import "server-only";
import { serverEnv, publicEnv } from "@/lib/env";
import type { SessionContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { AuthorizationError, NotFoundError, UserFacingError } from "@/lib/errors";
import { todayInTimezone } from "@/lib/organisation/settings";
import { htmlToPdf, ReportOverflowError } from "@/lib/pdf/generate";
import { PRINT_TEMPLATE_VERSION, renderReportHtml, type OrganisationSnapshot } from "@/lib/pdf/render-html";
import { qrSvg } from "@/lib/qr/qr";
import { deriveVerificationToken, hashVerificationToken, newTokenNonce, verificationUrl } from "@/lib/qr/token";
import { BUCKETS, downloadAsDataUrl, paths, signedUrl, uploadPrivate } from "@/lib/storage";
import { DEFAULT_TEMPLATE } from "@/lib/template/default-template";
import { parseTemplate, templateFromRow } from "@/lib/template/invariants";
import type { ReportData, ReportTemplate, SectionKey } from "@/lib/template/types";
import { isValidIsoDate, validateReportData, type ValidationIssue } from "@/lib/template/validation";
import type { IssuedSnapshot, OrganisationRow, ReportFileRow, ReportRow, TemplateRow } from "@/lib/supabase/types";
import { computeValidUntil } from "./validity";
import { dataToReportColumns, reportRowToData } from "./data";

type Ctx = SessionContext & { organisation: OrganisationRow };

const EDITABLE: ReportRow["status"][] = ["draft", "pending_review"];
const ISSUE_CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export async function getActiveTemplate(ctx: Ctx): Promise<ReportTemplate> {
  const { data } = await ctx.supabase
    .from("report_templates")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .eq("is_active", true)
    .maybeSingle<TemplateRow>();
  return templateFromRow(data);
}

export async function getReport(ctx: Ctx, id: string): Promise<ReportRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Report not found.");
  const { data } = await ctx.supabase.from("reports").select("*").eq("id", id).maybeSingle<ReportRow>();
  // RLS hides other organisations' rows, so "not found" is also the answer for foreign ids.
  if (!data) throw new NotFoundError("Report not found.");
  return data;
}

export async function getTemplateForReport(ctx: Ctx, report: ReportRow): Promise<ReportTemplate> {
  if (report.issued_snapshot) {
    const t = report.issued_snapshot.template;
    return { ...parseTemplate({ name: t.name, version: t.version, fieldConfiguration: t.fieldConfiguration, letterheadConfiguration: t.letterheadConfiguration, layoutConfiguration: t.layoutConfiguration }), id: t.id ?? undefined };
  }
  if (report.template_id) {
    const { data } = await ctx.supabase.from("report_templates").select("*").eq("id", report.template_id).maybeSingle<TemplateRow>();
    if (data) return templateFromRow(data);
  }
  return DEFAULT_TEMPLATE;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

/** Idempotent: retrying with the same clientRequestId returns the same draft. */
export async function createDraft(ctx: Ctx, clientRequestId: string): Promise<string> {
  if (!can(ctx.profile.role, "reports.create")) throw new AuthorizationError();
  const existing = await ctx.supabase.from("reports").select("id").eq("organisation_id", ctx.organisation.id).eq("client_request_id", clientRequestId).maybeSingle();
  if (existing.data) return existing.data.id as string;

  const template = await getActiveTemplate(ctx);
  const reportDate = todayInTimezone(ctx.settings.timezone);
  const { data, error } = await ctx.supabase
    .from("reports")
    .insert({
      organisation_id: ctx.organisation.id,
      template_id: template.id ?? null,
      template_version: template.version,
      report_date: reportDate,
      valid_until: computeValidUntil(reportDate, ctx.settings.validity_rule),
      client_request_id: clientRequestId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const again = await ctx.supabase.from("reports").select("id").eq("organisation_id", ctx.organisation.id).eq("client_request_id", clientRequestId).single();
      if (again.data) return again.data.id as string;
    }
    throw error;
  }
  return data.id as string;
}

export interface SaveInput {
  sections: Partial<Record<SectionKey, Record<string, unknown>>>;
  reportDate?: string;
  expectedUpdatedAt: string;
}

export interface SaveResult {
  updatedAt: string;
  validUntil: string | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function assertEditable(ctx: Ctx, report: ReportRow) {
  if (!EDITABLE.includes(report.status)) {
    throw new UserFacingError("This report has been issued and can no longer be edited. Create a revision to correct it.", "locked", 409);
  }
  if (report.status === "pending_review" && !can(ctx.profile.role, "reports.approve_issue")) {
    throw new UserFacingError("This report is awaiting review. Ask a medical officer to return it for changes.", "locked", 409);
  }
}

/** Saves draft data. Format errors are returned and nothing is saved; empty fields are allowed. */
export async function saveReport(ctx: Ctx, id: string, input: SaveInput): Promise<SaveResult> {
  if (!can(ctx.profile.role, "reports.edit_draft")) throw new AuthorizationError();
  const report = await getReport(ctx, id);
  assertEditable(ctx, report);
  const template = await getTemplateForReport(ctx, report);

  const merged = reportRowToData(report);
  for (const [section, values] of Object.entries(input.sections)) {
    merged[section as SectionKey] = { ...(values as ReportData[SectionKey]) };
  }
  const reportDate = input.reportDate ?? report.report_date;
  if (!isValidIsoDate(reportDate)) {
    return { updatedAt: report.updated_at, validUntil: report.valid_until, errors: [{ path: "meta.report_date", label: "Exam date", message: "Enter a valid date.", severity: "error" }], warnings: [] };
  }
  const result = validateReportData(template, merged, "draft", { reportDate });
  if (!result.ok) return { updatedAt: report.updated_at, validUntil: report.valid_until, errors: result.errors, warnings: result.warnings };

  const validUntil = computeValidUntil(reportDate, ctx.settings.validity_rule);
  const { data, error } = await ctx.supabase
    .from("reports")
    .update({ ...dataToReportColumns(result.data), report_date: reportDate, valid_until: validUntil })
    .eq("id", id)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new UserFacingError("This report was changed by someone else. Reload to see the latest version.", "conflict", 409);

  await logAudit(ctx.supabase, "report.updated", { type: "report", id, reportId: id }, { changed_fields: Object.keys(input.sections) });
  return { updatedAt: data.updated_at as string, validUntil, errors: [], warnings: result.warnings };
}

export interface CompletionCheck {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checklist: Array<{ key: string; label: string; done: boolean; required: boolean }>;
}

export async function checkCompletion(ctx: Ctx, report: ReportRow): Promise<CompletionCheck> {
  const template = await getTemplateForReport(ctx, report);
  const v = validateReportData(template, reportRowToData(report), "complete", { reportDate: report.report_date });
  const identity = Boolean(report.identity_confirmed_at);
  const independent = ctx.settings.require_independent_review;
  const checklist = [
    { key: "fields", label: "All required fields completed and valid", done: v.ok, required: true },
    { key: "identity", label: "Identity details reviewed (passport extraction or manual entry confirmed)", done: identity, required: true },
    {
      key: "review",
      label: independent ? "Submitted for independent review" : "Submitted for review (optional for medical officers)",
      done: report.status === "pending_review" || report.status === "completed",
      required: independent,
    },
  ];
  return { ok: checklist.every((c) => c.done || !c.required), errors: v.errors, warnings: v.warnings, checklist };
}

export async function confirmManualIdentity(ctx: Ctx, id: string): Promise<void> {
  if (!can(ctx.profile.role, "reports.edit_draft")) throw new AuthorizationError();
  const report = await getReport(ctx, id);
  assertEditable(ctx, report);
  const { error } = await ctx.supabase
    .from("reports")
    .update({ identity_source: "manual", identity_confirmed_at: new Date().toISOString(), identity_confirmed_by: ctx.userId })
    .eq("id", id);
  if (error) throw error;
  await logAudit(ctx.supabase, "report.identity_confirmed", { type: "report", id, reportId: id }, { result: "manual" });
}

export async function submitForReview(ctx: Ctx, id: string): Promise<CompletionCheck> {
  if (!can(ctx.profile.role, "reports.submit")) throw new AuthorizationError();
  const report = await getReport(ctx, id);
  if (report.status !== "draft") throw new UserFacingError("Only drafts can be submitted for review.", "conflict", 409);
  const check = await checkCompletion(ctx, report);
  const blocking = check.checklist.filter((c) => c.key !== "review" && !c.done);
  if (blocking.length) return { ...check, ok: false };
  const { error } = await ctx.supabase.from("reports").update({ status: "pending_review" }).eq("id", id).eq("status", "draft");
  if (error) throw error;
  return { ...check, ok: true };
}

export async function returnToDraft(ctx: Ctx, id: string): Promise<void> {
  if (!can(ctx.profile.role, "reports.approve_issue")) throw new AuthorizationError();
  const { error, data } = await ctx.supabase.from("reports").update({ status: "draft" }).eq("id", id).eq("status", "pending_review").select("id");
  if (error) throw error;
  if (!data?.length) throw new UserFacingError("The report is not awaiting review.", "conflict", 409);
}

// ---------------------------------------------------------------------------
// Issuing, PDF generation and verification
// ---------------------------------------------------------------------------

function organisationSnapshot(org: OrganisationRow): IssuedSnapshot["organisation"] {
  return {
    name: org.name,
    declarationName: org.declaration_name || org.name,
    registrationNumber: org.registration_number,
    address: org.address,
    phone: org.phone,
    email: org.email,
    website: org.website,
    accreditationDetails: org.accreditation_details,
    footerLines: org.footer_lines ?? [],
  };
}

async function renderFromSnapshot(ctx: Ctx, report: ReportRow, snapshot: IssuedSnapshot, token: string) {
  const template = parseTemplate({
    name: snapshot.template.name,
    version: snapshot.template.version,
    fieldConfiguration: snapshot.template.fieldConfiguration,
    letterheadConfiguration: snapshot.template.letterheadConfiguration,
    layoutConfiguration: snapshot.template.layoutConfiguration,
  });
  const url = verificationUrl(publicEnv.appUrl, token);
  const [logo, letterhead, signature, seal, photo] = await Promise.all([
    downloadAsDataUrl(ctx.supabase, BUCKETS.assets, snapshot.assets.logo),
    downloadAsDataUrl(ctx.supabase, BUCKETS.assets, snapshot.assets.letterhead),
    downloadAsDataUrl(ctx.supabase, BUCKETS.assets, snapshot.assets.signature),
    downloadAsDataUrl(ctx.supabase, BUCKETS.assets, snapshot.assets.seal),
    downloadAsDataUrl(ctx.supabase, BUCKETS.passports, snapshot.assets.photo),
  ]);
  const organisation: OrganisationSnapshot = { ...snapshot.organisation, logoDataUrl: logo, letterheadDataUrl: letterhead };
  const html = renderReportHtml({
    template,
    data: reportRowToData(report),
    meta: {
      serialNumber: report.serial_number,
      reportDate: report.report_date,
      validUntil: report.valid_until,
      revisionNumber: report.revision_number,
      templateVersion: template.version,
    },
    organisation,
    qr: { svg: await qrSvg(url), url },
    photoDataUrl: photo,
    signatureImages: signature || seal ? { signature, seal } : null,
    layoutMode: snapshot.layoutMode,
  });
  return htmlToPdf(html, { mode: snapshot.layoutMode });
}

async function storePdf(ctx: Ctx, report: ReportRow, pdf: { pdf: Buffer; pageCount: number; sha256: string }, templateVersion: number, layoutMode: "single" | "continuation") {
  const { count } = await ctx.supabase.from("report_files").select("id", { count: "exact", head: true }).eq("report_id", report.id);
  const version = (count ?? 0) + 1;
  const path = paths.reportPdf(report.organisation_id, report.id, version);
  await uploadPrivate(ctx.supabase, BUCKETS.reports, path, pdf.pdf, "application/pdf");
  const { data, error } = await ctx.supabase
    .from("report_files")
    .insert({
      report_id: report.id,
      organisation_id: report.organisation_id,
      file_type: "report_pdf",
      version,
      storage_path: path,
      content_hash: pdf.sha256,
      file_size: pdf.pdf.length,
      page_count: pdf.pageCount,
      layout_mode: layoutMode,
      template_version: templateVersion,
    })
    .select("*")
    .single<ReportFileRow>();
  if (error) throw error;
  await logAudit(ctx.supabase, "report.pdf_generated", { type: "report_file", id: data.id, reportId: report.id }, { version, content_hash: pdf.sha256, layout: layoutMode });
  return data;
}

export interface IssueOptions {
  layoutMode?: "single" | "continuation";
  applySignatureImages?: boolean;
}

/**
 * Validates, renders and issues a report: verification token -> QR -> A4 PDF -> private storage.
 * Idempotent and safe under retries: a claim column prevents concurrent double-issuing, and a
 * report that is already issued is returned as-is.
 */
export async function issueReport(ctx: Ctx, id: string, opts: IssueOptions = {}): Promise<{ reportId: string; fileId: string | null; alreadyIssued: boolean }> {
  if (!can(ctx.profile.role, "reports.approve_issue")) throw new AuthorizationError();
  const env = serverEnv();
  let report = await getReport(ctx, id);
  if (report.status === "completed") {
    const { data: f } = await ctx.supabase.from("report_files").select("id").eq("report_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
    return { reportId: id, fileId: (f?.id as string) ?? null, alreadyIssued: true };
  }
  if (!EDITABLE.includes(report.status)) throw new UserFacingError("This report cannot be issued.", "conflict", 409);
  if (ctx.settings.require_independent_review) {
    if (report.status !== "pending_review") throw new UserFacingError("Submit the report for review before issuing it.", "review_required", 409);
    if (report.submitted_by === ctx.userId) throw new UserFacingError("Independent review is required: another medical officer must issue this report.", "review_required", 409);
  }

  const check = await checkCompletion(ctx, report);
  if (!check.ok) {
    throw Object.assign(new UserFacingError("The report is not ready to issue. Resolve the listed items first.", "incomplete", 422), { details: check });
  }

  // Claim the report so that concurrent clicks / retries cannot issue twice.
  // Each statement is an atomic conditional UPDATE: claim an unclaimed report, or take over a stale claim.
  const staleBefore = new Date(Date.now() - ISSUE_CLAIM_TIMEOUT_MS).toISOString();
  const claimWhere = (q: ReturnType<ReturnType<typeof ctx.supabase.from>["update"]>) => q.eq("id", id).in("status", EDITABLE);
  let claim = await claimWhere(ctx.supabase.from("reports").update({ issuing_started_at: new Date().toISOString() }))
    .is("issuing_started_at", null)
    .select("*")
    .maybeSingle<ReportRow>();
  if (!claim.error && !claim.data) {
    claim = await claimWhere(ctx.supabase.from("reports").update({ issuing_started_at: new Date().toISOString() }))
      .lt("issuing_started_at", staleBefore)
      .select("*")
      .maybeSingle<ReportRow>();
  }
  if (claim.error) throw claim.error;
  if (!claim.data) throw new UserFacingError("This report is already being issued. Refresh in a moment.", "in_progress", 409);
  report = claim.data;

  const release = async () => {
    const { error } = await ctx.supabase.from("reports").update({ issuing_started_at: null }).eq("id", id).in("status", EDITABLE);
    if (error) console.error("[issue] failed to release claim");
  };

  try {
    const template = await getTemplateForReport(ctx, report);
    const layoutMode = opts.layoutMode ?? "single";
    const useSignatures = Boolean(opts.applySignatureImages && ctx.settings.signature_images_enabled);
    const snapshot: IssuedSnapshot = {
      printTemplateVersion: PRINT_TEMPLATE_VERSION,
      organisation: organisationSnapshot(ctx.organisation),
      assets: {
        logo: ctx.organisation.logo_path,
        letterhead: ctx.organisation.letterhead_path,
        signature: useSignatures ? ctx.organisation.signature_image_path : null,
        seal: useSignatures ? ctx.organisation.seal_image_path : null,
        photo: report.photo_path,
      },
      template: {
        id: template.id ?? null,
        name: template.name,
        version: template.version,
        fieldConfiguration: template.fieldConfiguration,
        letterheadConfiguration: template.letterheadConfiguration,
        layoutConfiguration: template.layoutConfiguration,
      },
      layoutMode,
    };
    const nonce = newTokenNonce();
    const token = deriveVerificationToken(env.VERIFICATION_TOKEN_SECRET, report.id, nonce);
    const pdf = await renderFromSnapshot(ctx, report, snapshot, token);

    const { data: issued, error } = await ctx.supabase
      .from("reports")
      .update({ status: "completed", verification_token_hash: hashVerificationToken(token), verification_nonce: nonce, issued_snapshot: snapshot })
      .eq("id", id)
      .in("status", EDITABLE)
      .select("*")
      .single<ReportRow>();
    if (error) throw error;

    const file = await storePdf(ctx, issued, pdf, template.version, layoutMode);

    if (issued.revision_of) {
      const { error: supErr } = await ctx.supabase.from("reports").update({ status: "superseded", superseded_by: issued.id }).eq("id", issued.revision_of).eq("status", "completed");
      if (supErr) console.error("[issue] failed to supersede previous revision");
    }
    await logAudit(ctx.supabase, "report.issued", { type: "report", id, reportId: id }, { template_version: template.version, layout: layoutMode, revision_number: issued.revision_number });
    return { reportId: id, fileId: file.id, alreadyIssued: false };
  } catch (e) {
    await release();
    console.error("[issue] failed:", e instanceof Error ? e.name : typeof e);
    if (e instanceof ReportOverflowError) throw new UserFacingError(e.message, "overflow", 422);
    throw e;
  }
}

/** Re-renders an issued report from its frozen snapshot into a new PDF version (history is kept). */
export async function regeneratePdf(ctx: Ctx, id: string): Promise<string> {
  if (!can(ctx.profile.role, "reports.approve_issue")) throw new AuthorizationError();
  const report = await getReport(ctx, id);
  if (!report.issued_snapshot || !report.verification_nonce || report.status === "draft" || report.status === "pending_review") {
    throw new UserFacingError("Only issued reports have a PDF to regenerate.", "conflict", 409);
  }
  const token = deriveVerificationToken(serverEnv().VERIFICATION_TOKEN_SECRET, report.id, report.verification_nonce);
  const pdf = await renderFromSnapshot(ctx, report, report.issued_snapshot, token);
  const file = await storePdf(ctx, report, pdf, report.template_version, report.issued_snapshot.layoutMode);
  return file.id;
}

/** Correction workflow: a new draft revision copying the issued data; the original stays valid until the revision is issued. */
export async function createRevision(ctx: Ctx, id: string): Promise<string> {
  if (!can(ctx.profile.role, "reports.revise")) throw new AuthorizationError();
  const original = await getReport(ctx, id);
  if (original.status !== "completed") throw new UserFacingError("Only completed reports can be revised.", "conflict", 409);
  const pending = await ctx.supabase.from("reports").select("id").eq("revision_of", id).in("status", EDITABLE).maybeSingle();
  if (pending.data) return pending.data.id as string;
  const template = await getActiveTemplate(ctx);
  const reportDate = todayInTimezone(ctx.settings.timezone);
  const { data, error } = await ctx.supabase
    .from("reports")
    .insert({
      organisation_id: original.organisation_id,
      revision_of: original.id,
      template_id: template.id ?? null,
      template_version: template.version,
      report_date: reportDate,
      valid_until: computeValidUntil(reportDate, ctx.settings.validity_rule),
      report_details: original.report_details,
      examinee_details: original.examinee_details,
      medical_history: original.medical_history,
      medical_examination: original.medical_examination,
      laboratory_results: original.laboratory_results,
      remarks: original.remarks,
      photo_path: original.photo_path,
      identity_source: original.identity_source,
      identity_confirmed_at: original.identity_confirmed_at,
      identity_confirmed_by: original.identity_confirmed_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function revokeReport(ctx: Ctx, id: string, reason: string): Promise<void> {
  if (!can(ctx.profile.role, "reports.revoke")) throw new AuthorizationError();
  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 300) throw new UserFacingError("Give a reason between 5 and 300 characters.", "invalid", 400);
  const { data, error } = await ctx.supabase.from("reports").update({ status: "revoked", revoked_reason: trimmed }).eq("id", id).eq("status", "completed").select("id");
  if (error) throw error;
  if (!data?.length) throw new UserFacingError("Only completed reports can be revoked.", "conflict", 409);
  await logAudit(ctx.supabase, "report.revoked", { type: "report", id, reportId: id });
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean): Promise<void> {
  if (!can(ctx.profile.role, "reports.archive")) throw new AuthorizationError();
  const { data, error } = await ctx.supabase.from("reports").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new NotFoundError("Report not found.");
  await logAudit(ctx.supabase, archived ? "report.archived" : "report.unarchived", { type: "report", id, reportId: id });
}

export async function getFileSignedUrl(ctx: Ctx, fileId: string, mode: "download" | "inline"): Promise<string> {
  if (!can(ctx.profile.role, "reports.download")) throw new AuthorizationError();
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new NotFoundError();
  const { data: file } = await ctx.supabase.from("report_files").select("*, reports(serial_number, revision_number)").eq("id", fileId).maybeSingle();
  if (!file) throw new NotFoundError("File not found.");
  const rep = file.reports as { serial_number: string; revision_number: number } | null;
  const name = `medical-report-${(rep?.serial_number ?? "report").replace(/[^A-Za-z0-9-]/g, "")}-r${rep?.revision_number ?? 1}-v${file.version}.pdf`;
  const url = await signedUrl(ctx.supabase, BUCKETS.reports, file.storage_path as string, { seconds: 60, download: mode === "download" ? name : false });
  await logAudit(ctx.supabase, mode === "download" ? "report.downloaded" : "report.printed", { type: "report_file", id: fileId, reportId: file.report_id as string }, { version: file.version as number });
  return url;
}

/** HTML preview of the current (possibly draft) data. Drafts carry a watermark and no QR. */
export async function renderPreviewHtml(ctx: Ctx, id: string): Promise<string> {
  if (!can(ctx.profile.role, "reports.view_medical")) throw new AuthorizationError();
  const report = await getReport(ctx, id);
  const template = await getTemplateForReport(ctx, report);
  const snap = report.issued_snapshot;
  const org = snap ? snap.organisation : organisationSnapshot(ctx.organisation);
  const assets = snap?.assets ?? { logo: ctx.organisation.logo_path, letterhead: ctx.organisation.letterhead_path, signature: null, seal: null, photo: report.photo_path };
  const [logo, letterhead, photo] = await Promise.all([
    downloadAsDataUrl(ctx.supabase, BUCKETS.assets, assets.logo),
    downloadAsDataUrl(ctx.supabase, BUCKETS.assets, assets.letterhead),
    downloadAsDataUrl(ctx.supabase, BUCKETS.passports, assets.photo),
  ]);
  let qr: { svg: string; url: string } | null = null;
  if (report.verification_nonce && snap) {
    const url = verificationUrl(publicEnv.appUrl, deriveVerificationToken(serverEnv().VERIFICATION_TOKEN_SECRET, report.id, report.verification_nonce));
    qr = { svg: await qrSvg(url), url };
  }
  const watermark =
    report.status === "draft" || report.status === "pending_review" ? "DRAFT — NOT VALID" : report.status === "revoked" ? "REVOKED" : report.status === "superseded" ? "SUPERSEDED" : null;
  return renderReportHtml({
    template,
    data: reportRowToData(report),
    meta: { serialNumber: report.serial_number, reportDate: report.report_date, validUntil: report.valid_until, revisionNumber: report.revision_number, templateVersion: template.version },
    organisation: { ...org, logoDataUrl: logo, letterheadDataUrl: letterhead },
    qr,
    photoDataUrl: photo,
    watermark,
    layoutMode: snap?.layoutMode ?? "single",
  });
}

/** Verification URL for authorised staff (shown on the report detail page). */
export function verificationUrlForReport(report: ReportRow): string | null {
  if (!report.verification_nonce || !report.issued_snapshot) return null;
  return verificationUrl(publicEnv.appUrl, deriveVerificationToken(serverEnv().VERIFICATION_TOKEN_SECRET, report.id, report.verification_nonce));
}
