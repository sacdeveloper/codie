import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/session";
import { apiError, isUuid } from "@/lib/api";
import { UserFacingError } from "@/lib/errors";
import { getFileSignedUrl } from "@/lib/reports/service";

export const runtime = "nodejs";

/** Authorised PDF download (?mode=download) or inline open for printing (?mode=inline). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    if (!isUuid(fileId)) throw new UserFacingError("File not found.", "not_found", 404);
    const ctx = await authorize("reports.download");
    const mode = request.nextUrl.searchParams.get("mode") === "inline" ? "inline" : "download";
    return NextResponse.redirect(await getFileSignedUrl(ctx, fileId, mode), { status: 303, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
