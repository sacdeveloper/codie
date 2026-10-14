/** Masks a passport number for listings, e.g. "Z1234567" -> "•••••567". */
export function maskPassport(value: string | null | undefined, visible = 3): string {
  if (!value) return "—";
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= visible) return "•".repeat(compact.length);
  return "•".repeat(compact.length - visible) + compact.slice(-visible);
}

/** ISO yyyy-mm-dd -> dd/mm/yyyy as printed on the reference report. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function normalisePassportNumber(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
