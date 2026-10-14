import { requireSession } from "@/lib/auth/session";
import { templateFromRow } from "@/lib/template/invariants";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { TemplateRow } from "@/lib/supabase/types";
import { TemplateEditor } from "./template-editor";
import { ActivateButton } from "./activate-button";

export const metadata = { title: "Report templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const s = await requireSession("templates.manage");
  const { data: rows } = await s.supabase.from("report_templates").select("*").order("version", { ascending: false }).returns<TemplateRow[]>();
  const active = rows?.find((r) => r.is_active) ?? null;
  const base = templateFromRow(active);
  return (
    <>
      <PageHeader title="Report templates" description="Versioned field configuration, letterhead and layout. Issued reports always keep the version they were issued with." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Edit {active ? `version ${active.version}` : "the built-in default template"}</CardTitle>
            <CardDescription>Changes are saved as a new version. Required safety and access-control rules cannot be removed.</CardDescription>
          </CardHeader>
          <CardContent><TemplateEditor initial={base} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rows?.length ? rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2">
                <div>
                  <p className="font-medium">v{r.version} {r.is_active && <Badge variant="success">active</Badge>}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(r.created_at)}</p>
                </div>
                {!r.is_active && <ActivateButton id={r.id} />}
              </div>
            )) : <p className="text-slate-500">No saved versions yet — reports use the built-in default (transcribed from the reference report).</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
