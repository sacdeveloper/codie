"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, FilePen, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/input";
import { createRevisionAction, regeneratePdfAction, revokeReportAction, setArchivedAction } from "../actions";

export function ReportActions(props: { id: string; status: string; archived: boolean; canRevise: boolean; canRevoke: boolean; canRegenerate: boolean; canArchive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");

  async function run<T>(key: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, then?: (d: T) => void) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return setError(res.error);
    then?.(res.data);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {props.canRevise && props.status === "completed" && (
          <Button variant="secondary" disabled={!!busy} onClick={() => run("revise", () => createRevisionAction(props.id), (d) => router.push(`/reports/${d.id}/edit`))}>
            {busy === "revise" ? <Loader2 className="animate-spin" /> : <FilePen />} Create correction (revision)
          </Button>
        )}
        {props.canRegenerate && props.status !== "draft" && props.status !== "pending_review" && (
          <Button variant="secondary" disabled={!!busy} onClick={() => run("regen", () => regeneratePdfAction(props.id))}>
            {busy === "regen" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate PDF
          </Button>
        )}
        {props.canRevoke && props.status === "completed" && !revoking && (
          <Button variant="destructive" disabled={!!busy} onClick={() => setRevoking(true)}>
            <ShieldOff /> Revoke
          </Button>
        )}
        {props.canArchive && (
          <Button variant="ghost" disabled={!!busy} onClick={() => run("archive", () => setArchivedAction(props.id, !props.archived))}>
            {props.archived ? <ArchiveRestore /> : <Archive />} {props.archived ? "Unarchive" : "Archive"}
          </Button>
        )}
      </div>
      {revoking && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <label htmlFor="revoke-reason" className="text-sm font-medium text-red-900">Reason for revocation (recorded, not shown publicly)</label>
          <Textarea id="revoke-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={!!busy || reason.trim().length < 5} onClick={() => run("revoke", () => revokeReportAction(props.id, reason), () => setRevoking(false))}>
              {busy === "revoke" && <Loader2 className="animate-spin" />} Confirm revocation
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevoking(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
