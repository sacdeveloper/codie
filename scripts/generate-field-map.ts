/** Regenerates docs/field-mapping.md from the default template: npx tsx scripts/generate-field-map.ts */
import { writeFileSync } from "node:fs";
import { DEFAULT_TEMPLATE } from "../src/lib/template/default-template";

const fc = DEFAULT_TEMPLATE.fieldConfiguration;
const lines: string[] = [
  "# Reference report field mapping",
  "",
  "Generated from `src/lib/template/default-template.ts` (template v1) — do not edit by hand.",
  "Source: the supplied scanned reference report (\"MEDICAL REPORT — MEDICAL FOR QATAR\"), not stored in the repository because it contains personal data.",
  "",
  "## Colour classification observed on the reference",
  "",
  "| Colour on reference | Meaning | How the application models it |",
  "|---|---|---|",
  "| **Green** (pre-printed) | Labels, headings, column titles, declaration wording, \"Signature of Examinee\", \"AUTHORISED SIGNATORY\" caption, footer contact lines, letterhead | Template text and field labels (versioned, editable by organisation administrators) and organisation settings |",
  "| **Black** (typed) | Destination, exam date, \"Valid upto\" date, serial number, title, name, every identity value, history answers, every examination and laboratory result, units typed beside numbers, remarks | Form inputs per report (manual) — or server-generated values (serial, validity) |",
  "| **Purple** (rubber stamps) | \"ORIGINAL\", centre seal, \"FIT\", doctor's name/registration stamp | Not reproduced. Blank space is reserved for physical stamps and signatures |",
  "",
  "Note: \"Valid upto\" is printed in black on the reference (typed with its date); the application calculates it from a configurable rule (default: 1 year minus one day, matching 28/07/2026 → 27/07/2027).",
  "Units (\"Cms.\", \"Kgs\", \"grms.%\", \"mgs./dl\") are typed in black beside values on the reference; they are configured once per field (predefined) and printed in black beside the value.",
  "",
  "## Fixed template text (green)",
  "",
  `- Title: **${fc.reportTitle}**; subtitle pattern: \`${fc.subtitlePattern}\``,
  `- History introduction: “${fc.historyIntro}”`,
  `- Declaration: “${fc.declarationText}”`,
  `- Examinee signature label: “${fc.examineeSignatureLabel}”`,
  `- Table headings: “${fc.examinationHeading}” (${fc.examinationColumns.join(" | ")}), “${fc.laboratoryHeading}” (${fc.laboratoryColumns.join(" | ")})`,
  `- Remarks label: “${fc.remarksLabel}”; signatory caption: “${fc.authorisedSignatoryLabel}” + organisation declaration name`,
  "",
  "## Fields",
  "",
  "| Section | Group (printed) | Printed label | Key | Category | Type | Required | Options / unit / rules |",
  "|---|---|---|---|---|---|---|---|",
];
for (const s of fc.sections) {
  for (const g of s.groups) {
    for (const f of g.fields) {
      const rules = [
        f.options ? `options: ${f.options.map((o) => o.value).join(", ")}` : "",
        f.unit ? `unit: ${f.unit}` : "",
        f.min !== undefined ? `min ${f.min}` : "",
        f.max !== undefined ? `max ${f.max}` : "",
        f.maxLength ? `≤${f.maxLength} chars` : "",
        f.pattern ? `pattern \`${f.pattern}\`` : "",
        f.visibleWhen ? `shown when ${f.visibleWhen.field} = ${f.visibleWhen.equals.join("/")}` : "",
        f.requiredWhen ? `required when ${f.requiredWhen.field} = ${f.requiredWhen.equals.join("/")}` : "",
        f.print ? "" : "not printed",
        f.locked ? "locked" : "",
      ].filter(Boolean).join("; ");
      lines.push(`| ${s.key} | ${g.title || "—"} | ${f.printLabel === "" ? "(group title)" : f.printLabel ?? f.label} | \`${f.key}\` | ${f.category === "manual" ? "black / manual" : f.category} | ${f.type} | ${f.required ? "yes" : "no"} | ${rules.replace(/\|/g, "\\|")} |`);
    }
  }
}
lines.push(
  "",
  "System-generated (not in the template): serial number (database sequence, format `R-7` by default), exam date (defaults to today in the organisation time zone, editable), valid-upto date (calculated), QR verification code (generated at issue).",
  "",
  "Result fields offer the reference vocabulary as suggestions (NAD, NIL, ABSENT, NORMAL, NOT SEEN, NEGATIVE…) but never pre-fill a value.",
  "",
);
writeFileSync("docs/field-mapping.md", lines.join("\n"));
console.log("docs/field-mapping.md written");
