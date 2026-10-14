"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createOrganisationAction } from "./actions";

export function CreateOrganisationForm() {
  const [state, action, pending] = useActionState<Awaited<ReturnType<typeof createOrganisationAction>> | undefined, FormData>(createOrganisationAction, undefined);
  return (
    <form action={action} className="space-y-3">
      {state && (state.ok ? <Alert variant="success">Organisation created and administrator invited.</Alert> : <Alert variant="error">{state.error}</Alert>)}
      <div className="space-y-1"><Label htmlFor="name">Organisation name</Label><Input id="name" name="name" required /></div>
      <div className="space-y-1"><Label htmlFor="admin_name">Administrator name</Label><Input id="admin_name" name="admin_name" required /></div>
      <div className="space-y-1"><Label htmlFor="admin_email">Administrator email</Label><Input id="admin_email" name="admin_email" type="email" required /></div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create organisation"}</Button>
    </form>
  );
}
