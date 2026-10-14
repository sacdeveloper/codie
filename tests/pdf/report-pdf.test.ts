import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { closePdfBrowser, htmlToPdf, ReportOverflowError, validatePdf, A4_POINTS } from "@/lib/pdf/generate";
import { renderReportHtml, type RenderInput } from "@/lib/pdf/render-html";
import { qrSvg } from "@/lib/qr/qr";
import { DEFAULT_TEMPLATE } from "@/lib/template/default-template";
import { allFields } from "@/lib/template/invariants";
import type { ReportData } from "@/lib/template/types";
import { SAMPLE_META, SAMPLE_ORG, SAMPLE_REPORT_DATA } from "../fixtures/sample-report";

// Use a pre-installed browser directory when present (e.g. cloud dev containers).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
const hasPdftoppm = spawnSync("pdftoppm", ["-v"]).status === 0;
const out = mkdtempSync(join(tmpdir(), "codie-pdf-"));
const URL = "https://reports.example.com/verify/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

async function input(over: Partial<RenderInput> = {}): Promise<RenderInput> {
  return {
    template: DEFAULT_TEMPLATE,
    data: SAMPLE_REPORT_DATA,
    meta: SAMPLE_META,
    organisation: SAMPLE_ORG,
    qr: { svg: await qrSvg(URL), url: URL },
    ...over,
  };
}

function rasterize(pdf: Buffer, name: string, dpi = 150): PNG {
  const pdfPath = join(out, `${name}.pdf`);
  writeFileSync(pdfPath, pdf);
  execFileSync("pdftoppm", ["-r", String(dpi), "-png", "-singlefile", pdfPath, join(out, name)]);
  return PNG.sync.read(readFileSync(join(out, `${name}.png`)));
}

afterAll(async () => {
  await closePdfBrowser();
});

describe("A4 report PDF", () => {
  it("renders the sample report as exactly one A4 portrait page", async () => {
    const { pdf, pageCount, sha256 } = await htmlToPdf(renderReportHtml(await input()));
    expect(pageCount).toBe(1);
    expect(await validatePdf(pdf, 1)).toBe(1);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(A4_POINTS.width).toBeLessThan(A4_POINTS.height);
  });

  it("is deterministic: identical input produces identical HTML", async () => {
    expect(renderReportHtml(await input())).toBe(renderReportHtml(await input()));
  });

  it.skipIf(!hasPdftoppm)("embeds a QR code that decodes to the verification URL", async () => {
    const { pdf } = await htmlToPdf(renderReportHtml(await input()));
    const png = rasterize(pdf, "qr", 200);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code?.data).toBe(URL);
  });

  it.skipIf(!hasPdftoppm)("keeps the letterhead area blank by default", async () => {
    const { pdf } = await htmlToPdf(renderReportHtml(await input()));
    const png = rasterize(pdf, "letterhead", 72);
    const mmToPx = png.height / 297;
    const limit = Math.floor((DEFAULT_TEMPLATE.letterheadConfiguration.heightMm - 1) * mmToPx);
    let dark = 0;
    for (let y = 0; y < limit; y++) {
      for (let x = 0; x < png.width; x++) {
        const i = (y * png.width + x) * 4;
        if (png.data[i] < 240 || png.data[i + 1] < 240 || png.data[i + 2] < 240) dark++;
      }
    }
    expect(dark).toBe(0);
  });

  it.skipIf(!hasPdftoppm)("leaves the signature and seal areas empty for manual completion", async () => {
    const { pdf } = await htmlToPdf(renderReportHtml(await input({ organisation: { ...SAMPLE_ORG, footerLines: [] } })));
    const png = rasterize(pdf, "footer", 72);
    const mmToPx = png.height / 297;
    // Footer band: ~33mm above the bottom margin, excluding the signatory caption lines.
    const top = Math.floor((297 - 5 - 33) * mmToPx) + 2;
    const bottom = Math.floor((297 - 5 - 12) * mmToPx);
    let dark = 0;
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < png.width; x++) {
        const i = (y * png.width + x) * 4;
        if (png.data[i] < 200) dark++;
      }
    }
    expect(dark).toBe(0);
  });

  it("preserves the reference section order", async () => {
    const html = renderReportHtml(await input());
    const pos = (needle: string) => html.indexOf(needle);
    const order = [
      'class="letterhead',
      'class="title"',
      'data-field="meta.serial_number"',
      'data-field="examinee.full_name"',
      'data-field="examinee.position_applied_for"',
      'data-field="history.psychiatric_neurological"',
      'class="declaration"',
      'data-field="examination.right_eye"',
      'data-field="laboratory.urine_sugar"',
      'data-field="remarks.remarks"',
      'class="footer"',
    ].map(pos);
    expect(order.every((p) => p > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("prints every printable template field", async () => {
    const html = renderReportHtml(await input());
    for (const { section, field } of allFields(DEFAULT_TEMPLATE.fieldConfiguration)) {
      if (!field.print || section === "report" || field.key === "name_title") continue;
      expect(html, `${section}.${field.key}`).toContain(`data-field="${section}.${field.key}"`);
    }
  });

  it("fits maximum-length uppercase values without clipping", async () => {
    const data: ReportData = structuredClone(SAMPLE_REPORT_DATA);
    for (const { section, field } of allFields(DEFAULT_TEMPLATE.fieldConfiguration)) {
      if (field.type === "result" || field.type === "text") data[section][field.key] = "N".repeat(field.maxLength ?? 20);
      if (field.type === "textarea") data[section][field.key] = "N ".repeat((field.maxLength ?? 300) / 2).trim();
      if (field.type === "number") data[section][field.key] = field.max ?? 999;
    }
    // "N" approximates the widest common uppercase glyph width; wider runs are caught by the overflow check.
    data.examination.blood_pressure = "120/80/72";
    const { pageCount } = await htmlToPdf(renderReportHtml(await input({ data })));
    expect(pageCount).toBe(1);
  });

  it("refuses to clip unusually long content and offers a continuation layout", async () => {
    const data: ReportData = structuredClone(SAMPLE_REPORT_DATA);
    data.remarks.remarks = "LONG REMARK ".repeat(150);
    await expect(htmlToPdf(renderReportHtml(await input({ data })))).rejects.toBeInstanceOf(ReportOverflowError);
    const res = await htmlToPdf(renderReportHtml(await input({ data, layoutMode: "continuation" })), { mode: "continuation" });
    expect(res.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("escapes user content and blocks remote resources", async () => {
    const data: ReportData = structuredClone(SAMPLE_REPORT_DATA);
    data.examinee.full_name = '<img src="https://evil.example/x.png"><script>alert(1)</script>';
    const html = renderReportHtml(await input({ data, photoDataUrl: "https://evil.example/photo.png" }));
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('src="https://evil.example');
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a draft watermark and a QR placeholder before issue", async () => {
    const html = renderReportHtml(await input({ qr: null, watermark: "DRAFT — NOT VALID" }));
    expect(html).toContain("DRAFT — NOT VALID");
    expect(html).toContain("qr-empty");
  });

  it("supports configured letterhead text and footer QR placement", async () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      letterheadConfiguration: { mode: "text" as const, heightMm: 38 },
      layoutConfiguration: { ...DEFAULT_TEMPLATE.layoutConfiguration, qrPosition: "footer" as const },
    };
    const html = renderReportHtml(await input({ template }));
    expect(html).toContain("SAMPLE MEDICAL CENTRE");
    expect(html).toContain("qr-footer");
    const { pageCount } = await htmlToPdf(html);
    expect(pageCount).toBe(1);
  });
});
