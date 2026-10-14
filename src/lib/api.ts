import "server-only";
import { NextResponse } from "next/server";
import { toSafeError } from "@/lib/errors";

export function apiError(e: unknown) {
  const s = toSafeError(e);
  return NextResponse.json({ error: s.error, code: s.code }, { status: s.status, headers: { "Cache-Control": "no-store" } });
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
