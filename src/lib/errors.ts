/** Errors whose message is safe to show to the user. Anything else is replaced by a generic message. */
export class UserFacingError extends Error {
  constructor(message: string, public readonly code: string = "error", public readonly status = 400) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class AuthorizationError extends UserFacingError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden", 403);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends UserFacingError {
  constructor(message = "Not found.") {
    super(message, "not_found", 404);
    this.name = "NotFoundError";
  }
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string; details?: unknown };

/** Maps database/permission errors to safe messages; never leaks internals or personal data. */
export function toSafeError(e: unknown): { error: string; code: string; status: number; details?: unknown } {
  if (e instanceof UserFacingError) return { error: e.message, code: e.code, status: e.status, details: (e as { details?: unknown }).details };
  const msg = e instanceof Error ? e.message : String(e);
  // Messages raised deliberately by our own database triggers are safe and helpful.
  const known = [
    /issued reports cannot be modified; create a revision instead/,
    /only a medical officer or organisation administrator can issue reports/,
    /a revision of this report is already in progress/,
    /only completed reports can be revised/,
    /template version is in use; create a new version instead/,
    /administrators cannot change their own role or status/,
    /organisation administrators cannot grant super administrator/,
    /invalid status transition .*/,
  ];
  for (const k of known) {
    const m = msg.match(k);
    if (m) return { error: m[0].charAt(0).toUpperCase() + m[0].slice(1) + ".", code: "conflict", status: 409 };
  }
  if (/row-level security|permission denied|not permitted/i.test(msg)) return { error: "You do not have permission to do that.", code: "forbidden", status: 403 };
  // Log a non-sensitive marker only (no payloads).
  console.error("[unexpected-error]", e instanceof Error ? e.name : typeof e);
  return { error: "Something went wrong. Please try again.", code: "internal", status: 500 };
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // Let Next.js redirects/not-found propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && /NEXT_(REDIRECT|NOT_FOUND)/.test((e as { digest: string }).digest)) throw e;
    const s = toSafeError(e);
    return { ok: false, error: s.error, code: s.code, details: s.details };
  }
}
