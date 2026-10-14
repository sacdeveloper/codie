import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Verification tokens are derived as HMAC-SHA256(secret, "report-verification:v1:" + reportId + ":" + nonce).
 *  - 256-bit, unpredictable without the server secret, and contain no record id or personal data.
 *  - Only SHA-256(token) is stored in the database (reports.verification_token_hash).
 *  - The random per-report nonce lets the server re-derive the same token when a PDF is
 *    regenerated, so printed QR codes stay valid. Rotating the nonce invalidates the old QR.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newTokenNonce(): string {
  return randomBytes(16).toString("hex");
}

export function deriveVerificationToken(secret: string, reportId: string, nonce: string): string {
  if (!secret || secret.length < 32) throw new Error("Verification secret is not configured.");
  return createHmac("sha256", secret).update(`report-verification:v1:${reportId}:${nonce}`).digest("base64url");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verificationUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/verify/${token}`;
}
