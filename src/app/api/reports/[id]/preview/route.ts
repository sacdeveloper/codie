import { authorize } from "@/lib/auth/session";
import { apiError, isUuid } from "@/lib/api";
import { UserFacingError } from "@/lib/errors";
import { renderPreviewHtml } from "@/lib/reports/service";

export const runtime = "nodejs";

/** Sandboxed HTML preview of the print template (same renderer as the final PDF). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new UserFacingError("Report not found.", "not_found", 404);
    const ctx = await authorize("reports.view_medical");
    const html = await renderPreviewHtml(ctx, id);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
