import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeAuditMetadata } from "@/lib/audit-metadata";

/**
 * Writes an audit event through the log_audit_event() database function, which stamps the actor
 * and organisation from the session. Metadata is allow-listed (no personal or medical data).
 * Audit failures are reported but never expose details to the user.
 */
export async function logAudit(
  supabase: SupabaseServerClient,
  action: string,
  entity: { type: string; id?: string | null; reportId?: string | null },
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("log_audit_event", {
    p_action: action,
    p_entity_type: entity.type,
    p_entity_id: entity.id ?? null,
    p_report_id: entity.reportId ?? null,
    p_metadata: sanitizeAuditMetadata(metadata),
  });
  if (error) console.error("[audit] failed to record", action);
}
