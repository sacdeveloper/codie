import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/session";
import { apiError, isUuid } from "@/lib/api";
import { UserFacingError } from "@/lib/errors";
import { getDocumentUrl } from "@/lib/passport/service";

export const runtime = "nodejs";

/** Redirects an authorised user to a 60-second signed URL for the original passport upload. */
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { docId } = await params;
    if (!isUuid(docId)) throw new UserFacingError("Document not found.", "not_found", 404);
    const ctx = await authorize("passports.view");
    return NextResponse.redirect(await getDocumentUrl(ctx, docId), { status: 303, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
