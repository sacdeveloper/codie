import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { OrganisationRow } from "@/lib/supabase/types";
import { CreateOrganisationForm } from "./form";

export const metadata = { title: "Organisations" };
export const dynamic = "force-dynamic";

export default async function OrganisationsPage() {
  const s = await requireSession("platform.manage_organisations");
  const { data: orgs } = await s.supabase.from("organisations").select("*").order("created_at", { ascending: false }).returns<OrganisationRow[]>();
  return (
    <>
      <PageHeader title="Organisations" description="Platform administration. Super administrators do not have access to medical records." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <Table>
            <THead><tr><TH>Name</TH><TH>Registration</TH><TH>Created</TH></tr></THead>
            <TBody>{orgs?.map((o) => <TR key={o.id}><TD className="font-medium">{o.name}</TD><TD>{o.registration_number ?? "—"}</TD><TD className="text-xs">{formatDateTime(o.created_at)}</TD></TR>)}</TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>New organisation</CardTitle><CardDescription>Creates the organisation, activates the default report template and invites its first administrator.</CardDescription></CardHeader>
          <CardContent><CreateOrganisationForm /></CardContent>
        </Card>
      </div>
    </>
  );
}
