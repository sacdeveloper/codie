import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Search } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { dashboardStats, listReports } from "@/lib/reports/queries";
import { todayInTimezone } from "@/lib/organisation/settings";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ReportTable } from "@/components/report-table";

export const metadata = { title: "Dashboard" };

const FILTERS = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "pending_review", label: "Pending review" },
  { key: "completed", label: "Completed" },
  { key: "revoked", label: "Revoked" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ status?: string; denied?: string }> }) {
  const pre = await requireSession();
  if (pre.profile.role === "super_admin") redirect("/admin/organisations");
  const s = await requireSession("reports.view_metadata");
  const sp = await searchParams;
  const today = todayInTimezone(s.settings.timezone);
  const [stats, recent] = await Promise.all([dashboardStats(s.supabase, today), listReports(s.supabase, { status: sp.status, page: 1 })]);
  const tiles = [
    { label: "Total reports", value: stats.total },
    { label: "Created today", value: stats.todayCount },
    { label: "Drafts", value: stats.drafts },
    { label: "Pending review", value: stats.pending },
    { label: "Completed", value: stats.completed },
  ];
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={s.organisation?.name}
        actions={
          can(s.profile.role, "reports.create") && (
            <Button asChild size="lg">
              <Link href="/reports/new">
                <FilePlus2 /> Create new report
              </Link>
            </Button>
          )
        }
      />
      {sp.denied && <Alert variant="warning" className="mb-4">You do not have access to that page.</Alert>}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Recent reports</CardTitle>
          <form action="/reports" className="flex w-full max-w-sm gap-2">
            <Input name="q" placeholder="Search serial, name, passport no., position" aria-label="Search reports" />
            <Button type="submit" variant="secondary" size="icon" aria-label="Search"><Search /></Button>
          </form>
        </CardHeader>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-5 py-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/dashboard?status=${f.key}` : "/dashboard"}
              className={`rounded-full px-3 py-1 text-xs font-medium ${(sp.status ?? "") === f.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <ReportTable rows={recent.rows.slice(0, 10)} canEdit={can(s.profile.role, "reports.edit_draft")} canDownload={can(s.profile.role, "reports.download")} />
        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <Link href="/reports" className="text-sm font-medium text-brand-700 hover:underline">View all reports →</Link>
        </div>
      </Card>
    </>
  );
}
