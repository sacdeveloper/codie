"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { activateTemplateAction } from "./actions";

export function ActivateButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await activateTemplateAction(id); router.refresh(); })}>
      {pending ? "…" : "Activate"}
    </Button>
  );
}
