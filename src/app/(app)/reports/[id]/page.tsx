import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, Pencil, Printer } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getReport, verificationUrlForReport } from "@/lib/reports/service";
import { NotFoundError } from "@/lib/errors";
import { qrSvg } from "@/lib/qr/qr";
import { formatDate, formatDateTime, maskPassport } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge, VerificationBadge } from "@/components/status-badge";
import type { OrganisationRow, PassportDocumentRow, RegistryRow, ReportFileRow } from "@/lib/supabase/types";
import { ReportActions } from "./report-actions";

export const metadata = { title: "Report" };
export const dynamic = "force-dynamic";
// Server actions on this page issue/regenerate PDFs (Chromium cold start on serverless hosts).
export const maxDuration = 60;

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function ReportDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession("reports.view_metadata");
  const role = s.profile.role;

  // Auditors (and any role without medical access) only ever see registry metadata.
  if (!can(role, "reports.view_medical")) {
    const { data } = await s.supabase.from("report_registry").select("*").eq("id", id).maybeSingle<RegistryRow>();
    if (!data) notFound();
    return (
      <>
        <PageHeader title={`Report ${data.serial_number}`} description="Metadata only — medical content is not available to your role." />
        <Card>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Meta label="Status"><StatusBadge status={data.status} /></Meta>
              <Meta label="QR verification"><VerificationBadge status={data.verification_status} /></Meta>
              <Meta label="Report date">{formatDate(data.report_date)}</Meta>
              <Meta label="Examinee">{data.examinee_full_name ?? "—"}</Meta>
              <Meta label="Passport">{data.passport_masked ?? "—"}</Meta>
              <Meta label="Created by">{data.created_by_name ?? "—"}</Meta>
              <Meta label="Last updated">{formatDateTime(data.updated_at)}</Meta>
            </dl>
          </CardContent>
        </Card>
      </>
    );
  }

  const ctx = { ...s, organisation: s.organisation as OrganisationRow };
  const report = await getReport(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [{ data: files }, { data: docs }, { data: stats }, revisions] = await Promise.all([
    s.supabase.from("report_files").select("*").eq("report_id", id).order("version", { ascending: false }).returns<ReportFileRow[]>(),
    s.supabase.from("passport_documents").select("id, kind, original_filename, mime_type, ocr_status, ocr_provider, is_mock, reviewed_at, created_at").eq("report_id", id).order("created_at", { ascending: false }).returns<Partial<PassportDocumentRow>[]>(),
    s.supabase.from("verification_stats").select("scan_count, last_verified_at").eq("report_id", id).maybeSingle(),
    s.supabase.from("report_registry").select("id, revision_number, status").eq("serial_number", report.serial_number).order("revision_number"),
  ]);
  const url = verificationUrlForReport(report);
  const svg = url ? await qrSvg(url) : null;
  const editable = report.status === "draft" || report.status === "pending_review";
  const latest = files?.[0];

  return (
    <>
      <PageHeader
        title={`Report ${report.serial_number}${report.revision_number > 1 ? ` (rev ${report.revision_number})` : ""}`}
        description={report.examinee_full_name ?? "Examinee not yet entered"}
        actions={
          <>
            {editable && can(role, "reports.edit_draft") && (
              <Button asChild><Link href={`/reports/${id}/edit`}><Pencil /> Continue editing</Link></Button>
            )}
            {latest && can(role, "reports.download") && (
              <>
                <Button asChild variant="secondary"><a href={`/api/report-files/${latest.id}?mode=download`}><Download /> Download PDF</a></Button>
                <Button asChild variant="secondary"><a href={`/api/report-files/${latest.id}?mode=inline`} target="_blank" rel="noopener"><Printer /> Print</a></Button>
              </>
            )}
          </>
        }
      />
      {sp.issued && <Alert variant="success" className="mb-4" title="Report issued">The A4 PDF was generated, saved to private cloud storage and a unique QR verification code was created.</Alert>}
      {report.status === "completed" && !latest && (
        <Alert variant="warning" className="mb-4">The report is issued but no PDF is stored. Use “Regenerate PDF”.</Alert>
      )}
      {report.superseded_by && (
        <Alert variant="info" className="mb-4">This report was superseded by <Link className="underline" href={`/reports/${report.superseded_by}`}>a newer revision</Link>.</Alert>
      )}
      {report.status === "revoked" && <Alert variant="error" className="mb-4" title="Revoked">{report.revoked_reason ?? "This report has been revoked."}</Alert>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Meta label="Status"><StatusBadge status={report.status} /></Meta>
                <Meta label="QR verification"><VerificationBadge status={report.verification_status} /></Meta>
                <Meta label="Exam date">{formatDate(report.report_date)}</Meta>
                <Meta label="Valid upto">{formatDate(report.valid_until) || "—"}</Meta>
                <Meta label="Passport">{maskPassport(report.passport_number)}</Meta>
                <Meta label="Position applied for">{report.position_applied_for ?? "—"}</Meta>
                <Meta label="Template version">v{report.template_version}</Meta>
                <Meta label="Issued">{formatDateTime(report.completed_at)}</Meta>
                <Meta label="Last updated">{formatDateTime(report.updated_at)}</Meta>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
            <CardContent className="overflow-auto bg-slate-100">
              <iframe title="Report preview" src={`/api/reports/${id}/preview?v=${encodeURIComponent(report.updated_at)}`} sandbox="" className="mx-auto block h-[1123px] w-[794px] bg-white shadow" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>QR verification</CardTitle>
              <CardDescription>The QR code opens a public page that confirms authenticity only. It never reveals medical or passport data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {svg && url ? (
                <>
                  <div className="mx-auto w-44" dangerouslySetInnerHTML={{ __html: svg }} />
                  <a href={url} target="_blank" rel="noopener" className="flex items-center justify-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                    Open verification page <ExternalLink className="size-3.5" />
                  </a>
                  <p className="text-center text-xs text-slate-500">Scanned {stats?.scan_count ?? 0} time(s){stats?.last_verified_at ? `, last ${formatDateTime(stats.last_verified_at)}` : ""}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">A QR code is created when the report is issued.</p>
              )}
            </CardContent>
          </Card>

          <Card id="files">
            <CardHeader><CardTitle>Stored PDFs</CardTitle><CardDescription>Private cloud storage. Every regeneration is kept as a new version.</CardDescription></CardHeader>
            {files?.length ? (
              <Table>
                <THead><tr><TH>Ver.</TH><TH>Generated</TH><TH className="text-right">File</TH></tr></THead>
                <TBody>
                  {files.map((f) => (
                    <TR key={f.id}>
                      <TD>v{f.version}</TD>
                      <TD className="text-xs">
                        {formatDateTime(f.generated_at)}
                        <div className="font-mono text-[10px] text-slate-400" title="SHA-256 content hash">{f.content_hash.slice(0, 16)}…</div>
                      </TD>
                      <TD className="text-right">
                        {can(role, "reports.download") && (
                          <span className="inline-flex gap-2">
                            <a className="text-brand-700 hover:underline" href={`/api/report-files/${f.id}?mode=download`}>Download</a>
                            <a className="text-brand-700 hover:underline" href={`/api/report-files/${f.id}?mode=inline`} target="_blank" rel="noopener">Print</a>
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <CardContent><p className="text-sm text-slate-500">No PDF yet.</p></CardContent>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {docs?.length ? docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {d.kind === "photo" ? "Photograph" : "Passport"} · {d.ocr_status}{d.is_mock ? " (mock OCR)" : ""}{d.reviewed_at ? " · reviewed" : ""}
                  </span>
                  {can(role, "passports.view") && <a className="shrink-0 text-brand-700 hover:underline" href={`/api/passport-documents/${d.id}/file`} target="_blank" rel="noopener">View</a>}
                </div>
              )) : <p className="text-slate-500">No documents uploaded.</p>}
            </CardContent>
          </Card>

          {(revisions.data?.length ?? 0) > 1 && (
            <Card>
              <CardHeader><CardTitle>Revisions</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {revisions.data!.map((r) => (
                  <Link key={r.id} href={`/reports/${r.id}`} className={`flex justify-between rounded px-2 py-1 hover:bg-slate-50 ${r.id === id ? "bg-slate-50 font-medium" : ""}`}>
                    <span>Revision {r.revision_number}</span>
                    <StatusBadge status={r.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent>
              <ReportActions
                id={id}
                status={report.status}
                archived={Boolean(report.archived_at)}
                canRevise={can(role, "reports.revise")}
                canRevoke={can(role, "reports.revoke")}
                canRegenerate={can(role, "reports.approve_issue")}
                canArchive={can(role, "reports.archive")}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
