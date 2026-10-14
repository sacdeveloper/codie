"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { runAction, UserFacingError } from "@/lib/errors";
import * as reports from "@/lib/reports/service";
import { confirmPassportReview } from "@/lib/passport/service";
import type { SectionKey } from "@/lib/template/types";

const uuid = z.string().uuid();
const sectionKeys = ["report", "examinee", "history", "examination", "laboratory", "remarks"] as const;
const saveSchema = z.object({
  sections: z.record(z.enum(sectionKeys), z.record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.null()]))),
  reportDate: z.string().optional(),
  expectedUpdatedAt: z.string().min(10).max(40),
});

export async function createDraftAction(formData: FormData) {
  const requestId = uuid.safeParse(formData.get("client_request_id"));
  const ctx = await authorize("reports.create");
  const id = await reports.createDraft(ctx, requestId.success ? requestId.data : randomUUID());
  redirect(`/reports/${id}/edit`);
}

export async function saveReportAction(id: string, payload: unknown) {
  return runAction(async () => {
    const parsed = saveSchema.safeParse(payload);
    if (!uuid.safeParse(id).success || !parsed.success) throw new UserFacingError("Invalid form submission.");
    const ctx = await authorize("reports.edit_draft");
    const res = await reports.saveReport(ctx, id, { ...parsed.data, sections: parsed.data.sections as Partial<Record<SectionKey, Record<string, unknown>>> });
    revalidatePath(`/reports/${id}`);
    return res;
  });
}

export async function confirmManualIdentityAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.edit_draft");
    await reports.confirmManualIdentity(ctx, uuid.parse(id));
    const r = await reports.getReport(ctx, id);
    return { updatedAt: r.updated_at };
  });
}

export async function checkCompletionAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.view_medical");
    return reports.checkCompletion(ctx, await reports.getReport(ctx, uuid.parse(id)));
  });
}

export async function submitForReviewAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.submit");
    const res = await reports.submitForReview(ctx, uuid.parse(id));
    revalidatePath(`/reports/${id}`);
    return res;
  });
}

export async function returnToDraftAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.approve_issue");
    await reports.returnToDraft(ctx, uuid.parse(id));
    revalidatePath(`/reports/${id}`);
  });
}

export async function issueReportAction(id: string, opts: { layoutMode?: "single" | "continuation"; applySignatureImages?: boolean }) {
  return runAction(async () => {
    const ctx = await authorize("reports.approve_issue");
    const res = await reports.issueReport(ctx, uuid.parse(id), {
      layoutMode: opts.layoutMode === "continuation" ? "continuation" : "single",
      applySignatureImages: Boolean(opts.applySignatureImages),
    });
    revalidatePath(`/reports/${id}`);
    revalidatePath("/reports");
    return res;
  });
}

export async function regeneratePdfAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.approve_issue");
    const fileId = await reports.regeneratePdf(ctx, uuid.parse(id));
    revalidatePath(`/reports/${id}`);
    return { fileId };
  });
}

export async function createRevisionAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.revise");
    return { id: await reports.createRevision(ctx, uuid.parse(id)) };
  });
}

export async function revokeReportAction(id: string, reason: string) {
  return runAction(async () => {
    const ctx = await authorize("reports.revoke");
    await reports.revokeReport(ctx, uuid.parse(id), String(reason ?? ""));
    revalidatePath(`/reports/${id}`);
  });
}

export async function setArchivedAction(id: string, archived: boolean) {
  return runAction(async () => {
    const ctx = await authorize("reports.archive");
    await reports.setArchived(ctx, uuid.parse(id), archived);
    revalidatePath(`/reports/${id}`);
    revalidatePath("/reports");
  });
}

export async function confirmPassportReviewAction(docId: string, values: unknown, expectedUpdatedAt: string) {
  return runAction(async () => {
    const ctx = await authorize("passports.upload");
    return confirmPassportReview(ctx, uuid.parse(docId), values, String(expectedUpdatedAt));
  });
}
