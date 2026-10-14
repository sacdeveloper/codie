import { requireSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ProfileRow } from "@/lib/supabase/types";
import { InviteForm, UserControls } from "./client";

export const metadata = { title: "User management" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const s = await requireSession("users.manage");
  const { data: users } = await s.supabase.from("profiles").select("*").eq("organisation_id", s.organisation!.id).order("full_name").returns<ProfileRow[]>();
  return (
    <>
      <PageHeader title="User management" description="Roles are enforced on the server and by row-level security in the database." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <Table>
            <THead><tr><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Status</TH><TH className="text-right">Manage</TH></tr></THead>
            <TBody>
              {users?.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.full_name || "—"}</TD>
                  <TD className="text-slate-600">{u.email}</TD>
                  <TD>{ROLE_LABELS[u.role]}</TD>
                  <TD>{u.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                  <TD><UserControls id={u.id} role={u.role} active={u.is_active} self={u.id === s.userId} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>Invite a user</CardTitle><CardDescription>The user receives an email to set a password.</CardDescription></CardHeader>
          <CardContent><InviteForm /></CardContent>
        </Card>
      </div>
    </>
  );
}
