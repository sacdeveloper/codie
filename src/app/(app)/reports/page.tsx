import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listReports } from "@/lib/reports/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { ReportTable } from "@/components/report-table";
import { STATUS_LABELS } from "@/lib/reports/data";

export const metadata = { title: "All reports" };

type SP = { q?: string; status?: string; from?: string; to?: string; page?: string; archived?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession("reports.view_metadata");
  const sp = await searchParams;
  const res = await listReports(s.supabase, { q: sp.q, status: sp.status, from: sp.from, to: sp.to, page: Number(sp.page) || 1, archived: sp.archived === "1" });
  const qs = (page: number) => {
    const p = new URLSearchParams(Object.entries({ ...sp, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    return `/reports?${p.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="All reports"
        description={`${res.total} report${res.total === 1 ? "" : "s"}${sp.archived === "1" ? " (archived)" : ""}`}
        actions={can(s.profile.role, "reports.create") && <Button asChild><Link href="/reports/new">Create report</Link></Button>}
      />
      <Card>
        <form className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-6" role="search">
          <div className="md:col-span-2">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" defaultValue={sp.q} placeholder="Serial, name, passport no., position" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={sp.status ?? ""}>
              <option value="">Any</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={sp.from} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={sp.to} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">Filter</Button>
            <Button asChild variant="ghost"><Link href="/reports">Reset</Link></Button>
          </div>
          {can(s.profile.role, "reports.archive") && (
            <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-6">
              <input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Show archived reports only
            </label>
          )}
        </form>
        <ReportTable rows={res.rows} canEdit={can(s.profile.role, "reports.edit_draft")} canDownload={can(s.profile.role, "reports.download")} />
        <nav className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm" aria-label="Pagination">
          <span className="text-slate-500">Page {res.page} of {res.pageCount}</span>
          <div className="flex gap-2">
            {res.page > 1 && <Button asChild variant="secondary" size="sm"><Link href={qs(res.page - 1)}>Previous</Link></Button>}
            {res.page < res.pageCount && <Button asChild variant="secondary" size="sm"><Link href={qs(res.page + 1)}>Next</Link></Button>}
          </div>
        </nav>
      </Card>
    </>
  );
}
