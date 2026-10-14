import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { Browser } from "playwright-core";

export const A4_POINTS = { width: 595.28, height: 841.89 };

export class ReportOverflowError extends Error {
  constructor(public readonly overflowPx: number) {
    super(
      "The report content does not fit on a single A4 page. Shorten the longest values (usually Remarks) " +
        "or generate it with a continuation page.",
    );
    this.name = "ReportOverflowError";
  }
}

export class PdfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfValidationError";
  }
}

let browserPromise: Promise<Browser> | null = null;

function chromiumPath(): string | undefined {
  const configured = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  if (configured && existsSync(configured)) return configured;
  return undefined; // fall back to Playwright's managed browser (PLAYWRIGHT_BROWSERS_PATH)
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({
        executablePath: chromiumPath(),
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      });
      browser.on("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    })().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

export async function closePdfBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}

export interface PdfResult {
  pdf: Buffer;
  pageCount: number;
  sha256: string;
}

/**
 * Renders the report HTML to an A4 PDF.
 * The page is fully offline: every network request is blocked so the output depends only on the HTML.
 */
export async function htmlToPdf(html: string, opts: { mode?: "single" | "continuation" } = {}): Promise<PdfResult> {
  const mode = opts.mode ?? "single";
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
  try {
    const page = await context.newPage();
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.emulateMedia({ media: "print" });
    await page.setContent(html, { waitUntil: "load" });

    if (mode === "single") {
      const overflow = await page.evaluate(() => {
        const content = document.getElementById("content");
        const pageEl = document.getElementById("page");
        if (!content || !pageEl) return 0;
        let worst = Math.max(0, content.scrollHeight - content.clientHeight, pageEl.scrollHeight - pageEl.clientHeight);
        // Detect clipped text inside fixed-height cells (no wrapping allowed there).
        document.querySelectorAll<HTMLElement>("[data-fit], td, .val, .remarks .v").forEach((el) => {
          worst = Math.max(worst, el.scrollWidth - el.clientWidth - 1, el.scrollHeight - el.clientHeight - 1);
        });
        return worst;
      });
      if (overflow > 1) throw new ReportOverflowError(overflow);
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      displayHeaderFooter: mode === "continuation",
      headerTemplate: "<span></span>",
      footerTemplate:
        mode === "continuation"
          ? '<div style="font-size:7pt;width:100%;text-align:right;padding-right:8mm;color:#666">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
          : "<span></span>",
    });
    const buffer = Buffer.from(pdf);
    const pageCount = await validatePdf(buffer, mode === "single" ? 1 : undefined);
    return { pdf: buffer, pageCount, sha256: createHash("sha256").update(buffer).digest("hex") };
  } finally {
    await context.close();
  }
}

/** Ensures the output is A4 portrait (and a single page when required). Returns the page count. */
export async function validatePdf(pdf: Uint8Array, expectedPages?: number): Promise<number> {
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  if (expectedPages !== undefined && pages.length !== expectedPages) {
    throw new PdfValidationError(`Expected ${expectedPages} page(s) but rendered ${pages.length}.`);
  }
  for (const p of pages) {
    const { width, height } = p.getSize();
    if (Math.abs(width - A4_POINTS.width) > 1.5 || Math.abs(height - A4_POINTS.height) > 1.5) {
      throw new PdfValidationError(`Page size ${width.toFixed(1)}x${height.toFixed(1)}pt is not A4 portrait.`);
    }
  }
  return pages.length;
}
