import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { AuditLogRow } from "@/lib/supabase/types";

export const metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const s = await requireSession("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = s.supabase.from("audit_logs").select("*", { count: "exact" });
  if (sp.action && /^[a-z_.]{2,60}$/.test(sp.action)) q = q.ilike("action", `${sp.action}%`);
  const { data: logs, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1).returns<AuditLogRow[]>();
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))] as string[];
  const reportIds = [...new Set((logs ?? []).map((l) => l.report_id).filter(Boolean))] as string[];
  const [{ data: actors }, { data: reps }] = await Promise.all([
    actorIds.length ? s.supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    reportIds.length ? s.supabase.from("report_registry").select("id, serial_number, revision_number").in("id", reportIds) : Promise.resolve({ data: [] as { id: string; serial_number: string; revision_number: number }[] }),
  ]);
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name || a.email || a.id.slice(0, 8)]));
  const serial = new Map((reps ?? []).map((r) => [r.id, `${r.serial_number}${r.revision_number > 1 ? ` r${r.revision_number}` : ""}`]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of important actions. Contains no medical or passport data." />
      <Card>
        <form className="flex items-end gap-2 border-b border-slate-100 p-4">
          <div className="space-y-1"><Label htmlFor="action">Action starts with</Label><Input id="action" name="action" defaultValue={sp.action} placeholder="report. / passport. / user." /></div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        <Table>
          <THead><tr><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Report</TH><TH>Details</TH></tr></THead>
          <TBody>
            {logs?.map((l) => (
              <TR key={l.id}>
                <TD className="text-xs whitespace-nowrap">{formatDateTime(l.created_at)}</TD>
                <TD>{l.actor_id ? actorName.get(l.actor_id) ?? "—" : <span className="text-slate-400">system / public</span>}</TD>
                <TD className="font-mono text-xs">{l.action}</TD>
                <TD className="font-mono text-xs">{l.report_id ? serial.get(l.report_id) ?? "—" : "—"}</TD>
                <TD className="max-w-md truncate font-mono text-xs text-slate-500">{Object.keys(l.metadata ?? {}).length ? JSON.stringify(l.metadata) : ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <nav className="flex justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <span className="text-slate-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild size="sm" variant="secondary"><Link href={`/audit?page=${page - 1}${sp.action ? `&action=${sp.action}` : ""}`}>Previous</Link></Button>}
            {page < pages && <Button asChild size="sm" variant="secondary"><Link href={`/audit?page=${page + 1}${sp.action ? `&action=${sp.action}` : ""}`}>Next</Link></Button>}
          </div>
        </nav>
      </Card>
    </>
  );
}
