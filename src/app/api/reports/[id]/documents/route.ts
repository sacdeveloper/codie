import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/session";
import { apiError, isUuid } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { processPassportOcr, uploadPassportDocument } from "@/lib/passport/service";
import { clientKeyFromHeaders, getLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Upload a passport (then OCR it) or an examinee photograph for a draft report. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new UserFacingError("Report not found.", "not_found", 404);
    const ctx = await authorize("passports.upload");
    const limit = getLimiter("upload", serverEnv().RATE_LIMIT_UPLOAD_PER_MINUTE).check(`${ctx.userId}:${clientKeyFromHeaders(request.headers)}`);
    if (!limit.allowed) throw new UserFacingError("Too many uploads. Wait a minute and try again.", "rate_limited", 429);

    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind") === "photo" ? "photo" : "passport";
    if (!(file instanceof File)) throw new UserFacingError("Choose a file to upload.");

    const uploaded = await uploadPassportDocument(ctx, id, file, kind);
    if (kind === "photo") return NextResponse.json({ document: uploaded.document });
    const ocr = await processPassportOcr(ctx, uploaded.document.id, request.signal);
    return NextResponse.json({ document: { ...uploaded.document, ocr_status: ocr.status }, ocr });
  } catch (e) {
    return apiError(e);
  }
}
