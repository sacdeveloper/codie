import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { serverEnv } from "@/lib/env";
import { AuthorizationError, NotFoundError, UserFacingError } from "@/lib/errors";
import { validateUpload } from "@/lib/security/file-validation";
import { BUCKETS, downloadBytes, paths, signedUrl, uploadPrivate } from "@/lib/storage";
import type { OrganisationRow, PassportDocumentRow, ReportRow } from "@/lib/supabase/types";
import { getReport, getTemplateForReport } from "@/lib/reports/service";
import { reportRowToData } from "@/lib/reports/data";
import { validateReportData } from "@/lib/template/validation";
import { extractPassportData, mapPassportFieldsToReport } from "./extraction";
import { getPassportOcrProvider } from "./index";
import { OcrError, PASSPORT_FIELD_KEYS, type PassportExtraction, type PassportFieldKey } from "./types";

type Ctx = SessionContext & { organisation: OrganisationRow };

export interface UploadResult {
  document: Pick<PassportDocumentRow, "id" | "kind" | "ocr_status" | "original_filename" | "mime_type" | "file_size" | "created_at">;
}

function assertDraft(report: ReportRow) {
  if (report.status !== "draft" && report.status !== "pending_review") {
    throw new UserFacingError("Documents can only be added while the report is a draft.", "locked", 409);
  }
}

export async function uploadPassportDocument(ctx: Ctx, reportId: string, file: File, kind: "passport" | "photo"): Promise<UploadResult> {
  if (!can(ctx.profile.role, "passports.upload")) throw new AuthorizationError();
  const report = await getReport(ctx, reportId);
  assertDraft(report);

  const maxBytes = serverEnv().PASSPORT_MAX_FILE_MB * 1024 * 1024;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload({ name: file.name, size: file.size, type: file.type }, bytes.subarray(0, 32), {
    maxBytes,
    allowed: kind === "photo" ? ["image/jpeg", "image/png", "image/webp"] : undefined,
  });
  if (!check.ok) throw new UserFacingError(check.error, "invalid_file", 400);

  const id = randomUUID();
  const storagePath = kind === "photo" ? paths.photo(report.organisation_id, report.id, id, check.extension) : paths.passport(report.organisation_id, report.id, id, check.extension);
  await uploadPrivate(ctx.supabase, BUCKETS.passports, storagePath, bytes, check.mimeType);

  const { data, error } = await ctx.supabase
    .from("passport_documents")
    .insert({
      id,
      report_id: report.id,
      organisation_id: report.organisation_id,
      kind,
      storage_path: storagePath,
      original_filename: check.safeName,
      mime_type: check.mimeType,
      file_size: bytes.length,
      content_hash: createHash("sha256").update(bytes).digest("hex"),
      ocr_status: kind === "photo" ? "manual" : "uploaded",
    })
    .select("id, kind, ocr_status, original_filename, mime_type, file_size, created_at")
    .single();
  if (error) throw error;

  if (kind === "photo") {
    const { error: e2 } = await ctx.supabase.from("reports").update({ photo_path: storagePath }).eq("id", report.id);
    if (e2) throw e2;
  }
  await logAudit(ctx.supabase, kind === "photo" ? "photo.uploaded" : "passport.uploaded", { type: "passport_document", id, reportId }, { file_type: check.mimeType });
  return { document: data as UploadResult["document"] };
}

async function getDocument(ctx: Ctx, docId: string): Promise<PassportDocumentRow> {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) throw new NotFoundError("Document not found.");
  const { data } = await ctx.supabase.from("passport_documents").select("*").eq("id", docId).maybeSingle<PassportDocumentRow>();
  if (!data) throw new NotFoundError("Document not found.");
  return data;
}

/** Runs OCR on a stored passport document. Supports cancellation via AbortSignal. */
export async function processPassportOcr(ctx: Ctx, docId: string, signal?: AbortSignal): Promise<{ status: PassportDocumentRow["ocr_status"]; extraction: PassportExtraction | null; error?: string; retryable?: boolean }> {
  if (!can(ctx.profile.role, "passports.upload")) throw new AuthorizationError();
  const doc = await getDocument(ctx, docId);
  if (doc.kind !== "passport") throw new UserFacingError("OCR is only available for passport documents.", "invalid", 400);
  const report = await getReport(ctx, doc.report_id);
  assertDraft(report);

  await ctx.supabase.from("passport_documents").update({ ocr_status: "processing", error_message: null }).eq("id", docId);
  try {
    const provider = getPassportOcrProvider();
    const bytes = await downloadBytes(ctx.supabase, BUCKETS.passports, doc.storage_path);
    const extraction = await extractPassportData(provider, { bytes, mimeType: doc.mime_type, signal });
    const confidence = Object.fromEntries(
      PASSPORT_FIELD_KEYS.map((k) => [k, { confidence: extraction.fields[k].confidence, needsReview: extraction.fields[k].needsReview, source: extraction.fields[k].source }]),
    );
    await ctx.supabase
      .from("passport_documents")
      .update({ ocr_status: "succeeded", ocr_provider: extraction.provider, is_mock: extraction.isMock, extraction_data: extraction, confidence_data: confidence })
      .eq("id", docId);
    await logAudit(ctx.supabase, "passport.ocr_completed", { type: "passport_document", id: docId, reportId: doc.report_id }, { provider: extraction.provider, is_mock: extraction.isMock, ocr_status: "succeeded" });
    return { status: "succeeded", extraction };
  } catch (e) {
    const ocr = e instanceof OcrError ? e : null;
    const cancelled = ocr?.code === "cancelled" || signal?.aborted;
    const message = ocr?.message ?? (e instanceof UserFacingError ? e.message : "OCR failed. Retry or enter the details manually.");
    await ctx.supabase.from("passport_documents").update({ ocr_status: cancelled ? "cancelled" : "failed", error_message: message.slice(0, 300) }).eq("id", docId);
    await logAudit(ctx.supabase, "passport.ocr_failed", { type: "passport_document", id: docId, reportId: doc.report_id }, { ocr_status: cancelled ? "cancelled" : "failed", reason_code: ocr?.code ?? "error" });
    return { status: cancelled ? "cancelled" : "failed", extraction: null, error: message, retryable: ocr?.retryable ?? true };
  }
}

const isoOrNull = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).transform((v) => v || null);
const textOrNull = z.union([z.string().max(80), z.null()]).transform((v) => (v && v.trim() ? v.trim() : null));
export const reviewedPassportSchema = z.object({
  surname: textOrNull,
  givenNames: textOrNull,
  fullName: textOrNull,
  passportNumber: textOrNull,
  dateOfBirth: isoOrNull,
  sex: z.union([z.enum(["MALE", "FEMALE"]), z.literal(""), z.null()]).transform((v) => v || null),
  nationality: textOrNull,
  placeOfIssue: textOrNull,
  issuingAuthority: textOrNull,
  dateOfIssue: isoOrNull,
  dateOfExpiry: isoOrNull,
});
export type ReviewedPassport = z.infer<typeof reviewedPassportSchema>;

/**
 * Explicit confirmation step: stores the reviewed values and copies them into the report's
 * examinee section. Values are validated with the report template before anything is saved.
 */
export async function confirmPassportReview(ctx: Ctx, docId: string, input: unknown, expectedUpdatedAt: string) {
  if (!can(ctx.profile.role, "passports.upload")) throw new AuthorizationError();
  const parsed = reviewedPassportSchema.safeParse(input);
  if (!parsed.success) throw new UserFacingError("Some reviewed values are invalid.", "invalid", 400);
  const reviewed = parsed.data;
  const doc = await getDocument(ctx, docId);
  const report = await getReport(ctx, doc.report_id);
  assertDraft(report);
  const template = await getTemplateForReport(ctx, report);

  const mapped = mapPassportFieldsToReport(reviewed);
  const data = reportRowToData(report);
  data.examinee = { ...data.examinee, ...mapped };
  const v = validateReportData(template, data, "draft", { reportDate: report.report_date });
  if (!v.ok) return { ok: false as const, errors: v.errors };

  const extracted = (doc.extraction_data as PassportExtraction | null)?.fields;
  const corrected = PASSPORT_FIELD_KEYS.filter((k: PassportFieldKey) => (extracted?.[k]?.value ?? null) !== (reviewed[k] ?? null));

  const { error: docErr } = await ctx.supabase
    .from("passport_documents")
    .update({ reviewed_data: reviewed, reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), ocr_status: doc.ocr_status === "succeeded" ? "succeeded" : "manual" })
    .eq("id", docId);
  if (docErr) throw docErr;

  const { data: upd, error } = await ctx.supabase
    .from("reports")
    .update({
      examinee_details: v.data.examinee,
      identity_source: doc.ocr_status === "succeeded" ? "passport_ocr" : "manual",
      identity_confirmed_at: new Date().toISOString(),
      identity_confirmed_by: ctx.userId,
    })
    .eq("id", report.id)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!upd) throw new UserFacingError("This report was changed by someone else. Reload and review again.", "conflict", 409);

  await logAudit(ctx.supabase, "passport.reviewed", { type: "passport_document", id: docId, reportId: report.id }, { changed_fields: corrected, count: corrected.length });
  return { ok: true as const, updatedAt: upd.updated_at as string, examinee: v.data.examinee };
}

export async function getDocumentUrl(ctx: Ctx, docId: string): Promise<string> {
  if (!can(ctx.profile.role, "passports.view")) throw new AuthorizationError();
  const doc = await getDocument(ctx, docId);
  const url = await signedUrl(ctx.supabase, BUCKETS.passports, doc.storage_path, { seconds: 60 });
  await logAudit(ctx.supabase, "passport.viewed", { type: "passport_document", id: docId, reportId: doc.report_id });
  return url;
}
