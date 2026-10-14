"use client";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { inviteUserAction, updateUserAction } from "./actions";

const ORG_ROLES: Role[] = ["org_admin", "medical_officer", "reporting_staff", "auditor"];

export function InviteForm() {
  const [state, action, pending] = useActionState<Awaited<ReturnType<typeof inviteUserAction>> | undefined, FormData>(inviteUserAction, undefined);
  return (
    <form action={action} className="space-y-3">
      {state && (state.ok ? <Alert variant="success">Invitation sent.</Alert> : <Alert variant="error">{state.error}</Alert>)}
      <div className="space-y-1"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
      <div className="space-y-1"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" required /></div>
      <div className="space-y-1">
        <Label htmlFor="role">Role</Label>
        <Select id="role" name="role" defaultValue="reporting_staff">{ORG_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</Button>
    </form>
  );
}

export function UserControls({ id, role, active, self }: { id: string; role: Role; active: boolean; self: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (self || role === "super_admin") return <span className="text-xs text-slate-400">—</span>;
  const run = (patch: { role?: string; is_active?: boolean }) =>
    start(async () => {
      const r = await updateUserAction(id, patch);
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  return (
    <div className="flex items-center justify-end gap-2">
      <Select className="h-8 w-48 text-xs" value={role} disabled={pending} onChange={(e) => run({ role: e.target.value })} aria-label="Role">
        {ORG_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </Select>
      <Button size="sm" variant={active ? "ghost" : "secondary"} disabled={pending} onClick={() => run({ is_active: !active })}>{active ? "Deactivate" : "Activate"}</Button>
    </div>
  );
}
