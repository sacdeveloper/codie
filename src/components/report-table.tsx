import Link from "next/link";
import { Eye, Pencil, Download } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge, VerificationBadge } from "@/components/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RegistryRow } from "@/lib/supabase/types";

export function ReportTable({ rows, canEdit, canDownload }: { rows: RegistryRow[]; canEdit: boolean; canDownload: boolean }) {
  if (!rows.length) return <p className="px-5 py-10 text-center text-sm text-slate-500">No reports found.</p>;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Serial no.</TH>
          <TH>Report date</TH>
          <TH>Examinee</TH>
          <TH>Passport</TH>
          <TH>Position</TH>
          <TH>Status</TH>
          <TH>Created by</TH>
          <TH>Updated</TH>
          <TH>QR</TH>
          <TH className="text-right">Actions</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-mono text-xs font-medium whitespace-nowrap">
              {r.serial_number}
              {r.revision_number > 1 && <span className="ml-1 text-slate-400">rev {r.revision_number}</span>}
            </TD>
            <TD>{formatDate(r.report_date)}</TD>
            <TD className="max-w-48 truncate font-medium">{r.examinee_full_name || <span className="text-slate-400">—</span>}</TD>
            <TD className="font-mono text-xs">{r.passport_masked || "—"}</TD>
            <TD className="max-w-40 truncate">{r.position_applied_for || "—"}</TD>
            <TD><StatusBadge status={r.status} /></TD>
            <TD className="max-w-32 truncate text-slate-600">{r.created_by_name || "—"}</TD>
            <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.updated_at)}</TD>
            <TD><VerificationBadge status={r.verification_status} /></TD>
            <TD>
              <div className="flex justify-end gap-1">
                <Link href={`/reports/${r.id}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Preview">
                  <Eye className="size-4" />
                  <span className="sr-only">Preview {r.serial_number}</span>
                </Link>
                {canEdit && (r.status === "draft" || r.status === "pending_review") && (
                  <Link href={`/reports/${r.id}/edit`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Edit">
                    <Pencil className="size-4" />
                    <span className="sr-only">Edit {r.serial_number}</span>
                  </Link>
                )}
                {canDownload && r.status !== "draft" && r.status !== "pending_review" && (
                  <Link href={`/reports/${r.id}#files`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Download / print">
                    <Download className="size-4" />
                    <span className="sr-only">Download {r.serial_number}</span>
                  </Link>
                )}
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
