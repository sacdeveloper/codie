import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Passport uploads" };
export const dynamic = "force-dynamic";
const PAGE = 30;

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "default" | "info"> = { succeeded: "success", failed: "danger", cancelled: "warning", processing: "info", uploaded: "default", manual: "default" };

export default async function PassportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const s = await requireSession("passports.view");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { data, count } = await s.supabase
    .from("passport_documents")
    .select("id, kind, original_filename, mime_type, file_size, ocr_status, ocr_provider, is_mock, reviewed_at, created_at, report_id, reports(serial_number, revision_number)", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  return (
    <>
      <PageHeader title="Passport uploads" description="Originals are stored in a private bucket and opened only through short-lived signed links." />
      <Card>
        <Table>
          <THead><tr><TH>Uploaded</TH><TH>Report</TH><TH>Type</TH><TH>File</TH><TH>OCR</TH><TH>Provider</TH><TH>Reviewed</TH><TH className="text-right">Open</TH></tr></THead>
          <TBody>
            {data?.map((d) => {
              const rep = d.reports as unknown as { serial_number: string; revision_number: number } | null;
              return (
                <TR key={d.id}>
                  <TD className="text-xs whitespace-nowrap">{formatDateTime(d.created_at)}</TD>
                  <TD className="font-mono text-xs"><Link className="text-brand-700 hover:underline" href={`/reports/${d.report_id}`}>{rep?.serial_number ?? "—"}</Link></TD>
                  <TD>{d.kind === "photo" ? "Photo" : "Passport"}</TD>
                  <TD className="max-w-40 truncate text-xs">{d.original_filename} <span className="text-slate-400">({Math.round(d.file_size / 1024)} KB)</span></TD>
                  <TD><Badge variant={STATUS_VARIANT[d.ocr_status] ?? "default"}>{d.ocr_status}</Badge></TD>
                  <TD className="text-xs">{d.ocr_provider ?? "—"}{d.is_mock && <Badge variant="warning" className="ml-1">mock</Badge>}</TD>
                  <TD className="text-xs">{d.reviewed_at ? formatDateTime(d.reviewed_at) : "—"}</TD>
                  <TD className="text-right"><a className="text-brand-700 hover:underline" href={`/api/passport-documents/${d.id}/file`} target="_blank" rel="noopener">View</a></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {!data?.length && <p className="px-5 py-10 text-center text-sm text-slate-500">No uploads yet.</p>}
        <nav className="flex justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <span className="text-slate-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild size="sm" variant="secondary"><Link href={`/passports?page=${page - 1}`}>Previous</Link></Button>}
            {page < pages && <Button asChild size="sm" variant="secondary"><Link href={`/passports?page=${page + 1}`}>Next</Link></Button>}
          </div>
        </nav>
      </Card>
    </>
  );
}
