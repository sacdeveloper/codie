/** Renders the sample report to PDF + PNG for visual comparison: npx tsx scripts/render-sample.ts <outDir> */
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_TEMPLATE } from "../src/lib/template/default-template";
import { renderReportHtml } from "../src/lib/pdf/render-html";
import { htmlToPdf, closePdfBrowser } from "../src/lib/pdf/generate";
import { qrSvg } from "../src/lib/qr/qr";
import { SAMPLE_META, SAMPLE_ORG, SAMPLE_REPORT_DATA } from "../src/lib/template/sample-data";

const out = process.argv[2] ?? "tests/.artifacts";
mkdirSync(out, { recursive: true });
const mode = (process.argv[3] as "blank" | "text") ?? "blank";
const url = "https://reports.example.com/verify/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const html = renderReportHtml({
  template: { ...DEFAULT_TEMPLATE, letterheadConfiguration: { ...DEFAULT_TEMPLATE.letterheadConfiguration, mode } },
  data: SAMPLE_REPORT_DATA, meta: SAMPLE_META, organisation: SAMPLE_ORG,
  qr: { svg: await qrSvg(url), url }, watermark: "SAMPLE DATA",
});
writeFileSync(`${out}/sample.html`, html);
const { pdf, pageCount } = await htmlToPdf(html);
writeFileSync(`${out}/sample-${mode}.pdf`, pdf);
console.log("pages", pageCount, "bytes", pdf.length);
await closePdfBrowser();
