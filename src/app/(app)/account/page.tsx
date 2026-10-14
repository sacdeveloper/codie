import { requireSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NameForm, PasswordForm } from "./forms";

export const metadata = { title: "Account settings" };

export default async function AccountPage() {
  const s = await requireSession();
  return (
    <>
      <PageHeader title="Account settings" description={`${s.email ?? ""} · ${ROLE_LABELS[s.profile.role]}${s.organisation ? ` · ${s.organisation.name}` : ""}`} />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent><NameForm name={s.profile.full_name ?? ""} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Password</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
      </div>
    </>
  );
}
