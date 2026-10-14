"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { changePasswordAction, updateNameAction } from "./actions";

type R = Awaited<ReturnType<typeof updateNameAction>> | undefined;

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<R, FormData>(updateNameAction, undefined);
  return (
    <form action={action} className="space-y-3">
      {state && (state.ok ? <Alert variant="success">Name updated.</Alert> : <Alert variant="error">{state.error}</Alert>)}
      <div className="space-y-1"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" defaultValue={name} /></div>
      <Button type="submit" variant="secondary" disabled={pending}>Save</Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<R, FormData>(changePasswordAction, undefined);
  return (
    <form action={action} className="space-y-3">
      {state && (state.ok ? <Alert variant="success">Password changed.</Alert> : <Alert variant="error">{state.error}</Alert>)}
      <div className="space-y-1"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} /></div>
      <div className="space-y-1"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" /></div>
      <Button type="submit" variant="secondary" disabled={pending}>Change password</Button>
    </form>
  );
}
