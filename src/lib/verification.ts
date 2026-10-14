import "server-only";
import { createSupabaseAnonClient } from "@/lib/supabase/server";
import { hashVerificationToken, isWellFormedToken } from "@/lib/qr/token";

export type VerificationResult =
  | { result: "valid" | "expired" | "revoked" | "superseded"; reference: string; revision: number; organisation: string; issued_on: string; valid_until: string | null; revoked_on: string | null }
  | { result: "not_found" }
  | { result: "unavailable" };

/** Public verification. Only the SHA-256 of the token is sent to the database. */
export async function verifyToken(token: string): Promise<VerificationResult> {
  if (!isWellFormedToken(token)) return { result: "not_found" };
  try {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.rpc("verify_report", { p_token_hash: hashVerificationToken(token) });
    if (error || !data) return { result: "unavailable" };
    return data as VerificationResult;
  } catch {
    return { result: "unavailable" };
  }
}

/** Accepts either a bare token or a full verification URL. */
export function extractToken(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/verify\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/);
  if (m) return m[1];
  return isWellFormedToken(s) ? s : null;
}
