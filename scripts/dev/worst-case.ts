import { writeFileSync } from "node:fs";
import { DEFAULT_TEMPLATE } from "../../src/lib/template/default-template";
import { allFields } from "../../src/lib/template/invariants";
import { renderReportHtml } from "../../src/lib/pdf/render-html";
import { SAMPLE_META, SAMPLE_ORG, SAMPLE_REPORT_DATA } from "../../src/lib/template/sample-data";
const ch = process.argv[2] ?? "N";
const data = structuredClone(SAMPLE_REPORT_DATA);
for (const { section, field } of allFields(DEFAULT_TEMPLATE.fieldConfiguration)) {
  if (field.type === "result" || field.type === "text") data[section][field.key] = ch.repeat(field.maxLength ?? 20);
  if (field.type === "textarea") data[section][field.key] = (ch + " ").repeat((field.maxLength ?? 300) / 2).trim();
  if (field.type === "number") data[section][field.key] = field.max ?? 999;
}
data.examination.blood_pressure = "120/80/72";
writeFileSync("tests/.artifacts/worst.html", renderReportHtml({ template: DEFAULT_TEMPLATE, data, meta: SAMPLE_META, organisation: SAMPLE_ORG, qr: null }));
