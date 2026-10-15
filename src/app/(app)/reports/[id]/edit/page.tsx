import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getReport, getTemplateForReport } from "@/lib/reports/service";
import { reportRowToData } from "@/lib/reports/data";
import { describeValidityRule } from "@/lib/reports/validity";
import { NotFoundError } from "@/lib/errors";
import { PageHeader } from "@/components/page-header";
import { ReportEditor } from "@/components/report-editor/report-editor";
import type { PassportDocumentRow } from "@/lib/supabase/types";
import type { PassportExtraction } from "@/lib/passport/types";
import type { ReportFormValues } from "@/lib/template/form-schema";
import type { OrganisationRow } from "@/lib/supabase/types";

export const metadata = { title: "Edit report" };
export const dynamic = "force-dynamic";
// Server actions on this page issue/regenerate PDFs (Chromium cold start on serverless hosts).
export const maxDuration = 60;

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession("reports.edit_draft");
  const ctx = { ...s, organisation: s.organisation as OrganisationRow };
  const report = await getReport(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (report.status !== "draft" && report.status !== "pending_review") redirect(`/reports/${id}`);
  const template = await getTemplateForReport(ctx, report);
  const { data: docs } = await s.supabase
    .from("passport_documents")
    .select("*")
    .eq("report_id", id)
    .eq("kind", "passport")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<PassportDocumentRow[]>();
  const doc = docs?.[0] ?? null;

  const data = reportRowToData(report);
  // Inputs work with strings; numbers are re-normalised on save by the shared validator.
  const initialValues = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([fk, fv]) => [fk, fv === null || fv === undefined ? "" : String(fv)]))]),
  ) as ReportFormValues;

  return (
    <>
      <PageHeader title={report.revision_of ? "Edit report revision" : "Edit report"} description="Complete each step. Drafts can be saved and reopened at any time." />
      <ReportEditor
        report={{
          id: report.id,
          serialNumber: report.serial_number,
          revisionNumber: report.revision_number,
          status: report.status,
          reportDate: report.report_date,
          validUntil: report.valid_until,
          updatedAt: report.updated_at,
          templateVersion: report.template_version,
          identityConfirmed: Boolean(report.identity_confirmed_at),
          identitySource: report.identity_source,
          hasPhoto: Boolean(report.photo_path),
        }}
        template={template}
        initialValues={initialValues}
        passportDoc={
          doc
            ? {
                id: doc.id,
                ocr_status: doc.ocr_status,
                original_filename: doc.original_filename,
                error_message: doc.error_message,
                extraction: (doc.extraction_data as PassportExtraction | null) ?? null,
                reviewed_at: doc.reviewed_at,
              }
            : null
        }
        permissions={{
          canSubmit: can(s.profile.role, "reports.submit"),
          canIssue: can(s.profile.role, "reports.approve_issue"),
          signatureImagesEnabled: s.settings.signature_images_enabled,
        }}
        validityRule={describeValidityRule(s.settings.validity_rule)}
      />
    </>
  );
}
