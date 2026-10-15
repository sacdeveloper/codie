import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/session";
import { apiError, isUuid } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { processPassportOcr } from "@/lib/passport/service";
import { clientKeyFromHeaders, getLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Retry OCR for an already uploaded passport document. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { docId } = await params;
    if (!isUuid(docId)) throw new UserFacingError("Document not found.", "not_found", 404);
    const ctx = await authorize("passports.upload");
    if (!getLimiter("ocr", serverEnv().RATE_LIMIT_UPLOAD_PER_MINUTE).check(`${ctx.userId}:${clientKeyFromHeaders(request.headers)}`).allowed) {
      throw new UserFacingError("Too many OCR requests. Wait a minute and try again.", "rate_limited", 429);
    }
    return NextResponse.json({ ocr: await processPassportOcr(ctx, docId, request.signal) });
  } catch (e) {
    return apiError(e);
  }
}
