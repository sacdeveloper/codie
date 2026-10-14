/**
 * Audit metadata must never contain medical findings or identity data.
 * Only these keys are persisted; values are truncated scalars.
 */
const ALLOWED_KEYS = new Set([
  "status",
  "from_status",
  "to_status",
  "version",
  "file_type",
  "template_version",
  "provider",
  "is_mock",
  "ocr_status",
  "reason_code",
  "revision_of",
  "revision_number",
  "role",
  "changed_fields",
  "content_hash",
  "result",
  "layout",
  "count",
]);

export function sanitizeAuditMetadata(input: Record<string, unknown> | undefined): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").slice(0, 50).map((x) => String(x).slice(0, 60));
  }
  return out;
}
