/**
 * Retention job: deletes passport files older than each organisation's configured
 * `passport_retention_days` and clears the extracted identity data, keeping only metadata.
 * Schedule it daily (cron / GitHub Actions / Supabase scheduled function):
 *   npx tsx scripts/purge-passports.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const dryRun = process.argv.includes("--dry-run");
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb.rpc("passport_documents_due_for_purge", { p_limit: 500 });
if (error) throw error;
const rows = (data ?? []) as Array<{ id: string; organisation_id: string; storage_path: string }>;
console.log(`${rows.length} document(s) due for purge${dryRun ? " (dry run)" : ""}.`);
if (!dryRun) {
  for (const r of rows) {
    const { error: sErr } = await sb.storage.from("passport-documents").remove([r.storage_path]);
    if (sErr) {
      console.error(`storage delete failed for ${r.id}`);
      continue;
    }
    await sb.from("passport_documents").update({ deleted_at: new Date().toISOString(), extraction_data: null, confidence_data: null, reviewed_data: null }).eq("id", r.id);
    await sb.from("audit_logs").insert({ organisation_id: r.organisation_id, action: "passport.purged", entity_type: "passport_document", entity_id: r.id, metadata: { reason_code: "retention" } });
  }
}
