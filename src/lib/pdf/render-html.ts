/**
 * Deterministic, versioned HTML/CSS print template for the A4 medical report.
 * Pure function: identical inputs always produce identical HTML (no clocks, no randomness,
 * no network resources — images are passed in as data URLs and the QR as inline SVG).
 *
 * Layout follows the supplied reference report (see docs/field-mapping.md):
 *   [reserved letterhead]
 *   [identity box: photo | title, exam date/valid upto/serial, name, details, history, QR, declaration]
 *   [MEDICAL EXAMINATION table | LABORATORY INVESTIGATIONS table]
 *   [Remarks]
 *   [footer: seal space | contact lines (+ stamp space) | signature space + authorised signatory]
 */
import { formatDate } from "@/lib/format";
import type { FieldDefinition, FieldGroup, FieldValue, ReportData, ReportTemplate, TemplateSection } from "@/lib/template/types";

export const PRINT_TEMPLATE_VERSION = "print-1.0.0";

export interface OrganisationSnapshot {
  name: string;
  declarationName: string;
  registrationNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  accreditationDetails: string | null;
  /** Free-text lines printed in green in the footer centre (as on the reference). */
  footerLines: string[];
  logoDataUrl?: string | null;
  letterheadDataUrl?: string | null;
}

export interface ReportMeta {
  serialNumber: string;
  reportDate: string | null;
  validUntil: string | null;
  revisionNumber: number;
  templateVersion: number;
}

export interface RenderInput {
  template: ReportTemplate;
  data: ReportData;
  meta: ReportMeta;
  organisation: OrganisationSnapshot;
  qr: { svg: string; url: string } | null;
  photoDataUrl?: string | null;
  /** Only rendered when the organisation explicitly enabled approved signature/seal images. */
  signatureImages?: { signature?: string | null; seal?: string | null } | null;
  watermark?: string | null;
  layoutMode?: "single" | "continuation";
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Only allow inline raster data URLs for images (never remote URLs). */
const safeImg = (v: string | null | undefined): string | null =>
  v && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;

/** Only allow the SVG produced by the QR library (no scripts, no foreign objects). */
const safeSvg = (svg: string): string => (/<script|foreignObject|on\w+=|href=/i.test(svg) ? "" : svg);

function displayValue(field: FieldDefinition, value: FieldValue | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "date") return esc(formatDate(String(value)));
  return esc(value);
}

/**
 * Long values are scaled down proportionally (deterministically, never below 7.5pt) instead of
 * being clipped. Anything that still does not fit is caught by the overflow check in generate.ts.
 */
export const MIN_VALUE_PT = 7.5;

function fitStyle(len: number, comfortable: number, basePt: number): string {
  if (len <= comfortable) return "";
  const pt = Math.max(MIN_VALUE_PT, Math.floor(((basePt * comfortable) / len) * 10) / 10);
  return ` style="font-size:${pt}pt"`;
}

function valueWithUnit(field: FieldDefinition, value: FieldValue | undefined, comfortable = 12, basePt = 10.2): string {
  const v = displayValue(field, value);
  if (!v) return "";
  const raw = String(value);
  // Numbers are bounded by min/max and always fit at full size; only free text is scaled.
  const style = field.type === "number" ? "" : fitStyle(raw.length, comfortable, basePt);
  const inner = field.unit ? `<span class="num">${v}</span><span class="unit">${esc(field.unit)}</span>` : v;
  return style ? `<span class="fit"${style}>${inner}</span>` : inner;
}

function section(t: ReportTemplate, key: TemplateSection["key"]) {
  return t.fieldConfiguration.sections.find((s) => s.key === key);
}

function fieldOf(t: ReportTemplate, sectionKey: TemplateSection["key"], key: string): FieldDefinition | undefined {
  return section(t, sectionKey)?.groups.flatMap((g) => g.fields).find((f) => f.key === key);
}

function labelOf(f: FieldDefinition | undefined, fallback: string): string {
  if (!f) return esc(fallback);
  return esc(f.printLabel ?? f.label);
}

/** Rows for one examination/laboratory table. */
function tableRows(groups: FieldGroup[], values: Record<string, FieldValue>, kind: "exam" | "lab"): string {
  const rows: string[] = [];
  groups.forEach((g, gi) => {
    const fields = g.fields.filter((f) => f.print);
    // Consecutive single-line lab tests (VDRL, TPHA, PREGNANCY TEST, LMP) are printed without gaps.
    const compact = kind === "lab" && gi > 0 && g.fields.length === 1 && groups[gi - 1].fields.length === 1;
    if (gi > 0 && !compact) rows.push(kind === "lab" ? `<tr class="gap"><td></td><td></td><td class="res"></td></tr>` : `<tr class="gap"><td></td><td class="res"></td></tr>`);
    if (kind === "exam") {
      if (!g.titleInline) rows.push(`<tr><td class="grp" colspan="1">${esc(g.title)}</td><td class="res"></td></tr>`);
      fields.forEach((f, i) => {
        if (f.headingBefore) rows.push(`<tr><td class="sub ind1">${esc(f.headingBefore)}</td><td class="res"></td></tr>`);
        const label = esc(f.printLabel ?? f.label);
        const cell =
          g.titleInline
            ? `<td class="lbl"><div class="split"><span class="grp-inline">${i === 0 ? esc(g.title) : ""}</span><span class="side">${label}</span></div></td>`
            : `<td class="lbl ind${f.indent}">${label}</td>`;
        rows.push(`<tr data-field="examination.${esc(f.key)}">${cell}<td class="res">${valueWithUnit(f, values[f.key], 10)}</td></tr>`);
      });
    } else {
      fields.forEach((f, i) => {
        if (f.headingBefore) rows.push(`<tr><td class="grp"></td><td class="sub">${esc(f.headingBefore)}</td><td class="res"></td></tr>`);
        const label = f.printLabel === "" ? "" : esc(f.printLabel ?? f.label);
        const title = g.titleInline && i === 0 ? esc(g.title) : "";
        // Single-field groups whose title *is* the label (VDRL, TPHA, LMP...) span both label columns.
        const labelCells =
          label === ""
            ? `<td class="grp" colspan="2">${title}</td>`
            : `<td class="grp">${title}</td><td class="lbl ind${Math.max(0, f.indent - 1)}">${label}</td>`;
        rows.push(`<tr data-field="laboratory.${esc(f.key)}">${labelCells}<td class="res lab">${valueWithUnit(f, values[f.key], 9)}</td></tr>`);
      });
    }
  });
  return rows.join("\n");
}

function letterhead(input: RenderInput): string {
  const { organisation: o, template } = input;
  const mode = template.letterheadConfiguration.mode;
  if (mode === "image" && safeImg(o.letterheadDataUrl)) {
    return `<div class="letterhead lh-image"><img src="${safeImg(o.letterheadDataUrl)}" alt=""/></div>`;
  }
  if (mode === "text") {
    const logo = safeImg(o.logoDataUrl);
    return `<div class="letterhead lh-text">
      <div class="lh-left">${logo ? `<img class="lh-logo" src="${logo}" alt=""/>` : ""}
        <div><div class="lh-name">${esc(o.name)}</div>
        ${o.registrationNumber ? `<div class="lh-reg">Registration No: ${esc(o.registrationNumber)}</div>` : ""}
        ${o.accreditationDetails ? `<div class="lh-acc">${esc(o.accreditationDetails)}</div>` : ""}</div>
      </div>
      <div class="lh-right">
        ${o.address ? `<div>${esc(o.address).replace(/\n/g, "<br/>")}</div>` : ""}
        ${o.phone ? `<div>Phone: ${esc(o.phone)}</div>` : ""}
        ${o.email ? `<div>${esc(o.email)}</div>` : ""}
        ${o.website ? `<div>${esc(o.website)}</div>` : ""}
      </div>
    </div>`;
  }
  // Default: reserved blank area for pre-printed letterhead stationery.
  return `<div class="letterhead lh-blank" aria-hidden="true"></div>`;
}

export function renderReportHtml(input: RenderInput): string {
  const { template: t, data, meta, organisation: org } = input;
  const fc = t.fieldConfiguration;
  const layout = t.layoutConfiguration;
  const accent = layout.accentColor;
  const mode = input.layoutMode ?? "single";
  const ex = data.examinee;
  const ef = (k: string) => fieldOf(t, "examinee", k);
  // Comfortable character counts per identity slot before the font steps down.
  const comfortable: Record<string, number> = { full_name: 38, position_applied_for: 30, place_of_issue: 9, nationality: 9, passport_number: 10 };
  const ev = (k: string) => {
    const f = ef(k);
    return f ? valueWithUnit(f, ex[k], comfortable[k] ?? 12, 10.5) : "";
  };

  const destination = data.report.destination ? String(data.report.destination) : "";
  const subtitle = destination ? fc.subtitlePattern.replace("{destination}", destination) : "";
  const historyFields = section(t, "history")?.groups.flatMap((g) => g.fields).filter((f) => f.print) ?? [];
  const examGroups = section(t, "examination")?.groups ?? [];
  const labGroups = section(t, "laboratory")?.groups ?? [];
  const remarksField = fieldOf(t, "remarks", "remarks");
  const declaration = esc(fc.declarationText).replace(/\{declaration_organisation_name\}/g, esc(org.declarationName || org.name));
  const qrSvg = input.qr ? safeSvg(input.qr.svg) : "";
  const qrInIdentity = layout.qrPosition === "identity";
  const photo = safeImg(input.photoDataUrl);
  const sig = safeImg(input.signatureImages?.signature);
  const seal = safeImg(input.signatureImages?.seal);

  const qrBlock = (cls: string) =>
    qrSvg ? `<div class="qr ${cls}" data-qr="1">${qrSvg}</div>` : `<div class="qr ${cls} qr-empty"></div>`;

  const sealCell = `<div class="foot-cell foot-seal">${seal ? `<img class="seal-img" src="${seal}" alt=""/>` : ""}</div>`;
  const signatureCell = `<div class="foot-cell foot-sign">
      <div class="sign-space">${sig ? `<img class="sig-img" src="${sig}" alt=""/>` : ""}</div>
      <div class="signatory">${esc(fc.authorisedSignatoryLabel)}</div>
      <div class="signatory">${esc(org.declarationName || org.name)}</div>
    </div>`;
  const centreCell = `<div class="foot-cell foot-centre">
      ${!qrInIdentity ? qrBlock("qr-footer") : `<div class="stamp-space"></div>`}
      ${org.footerLines.map((l) => `<div class="contact">${esc(l)}</div>`).join("")}
    </div>`;
  const footerCells =
    layout.signaturePosition === "right" ? [sealCell, centreCell, signatureCell] : [signatureCell, centreCell, sealCell];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="template-version" content="${esc(PRINT_TEMPLATE_VERSION)}/${esc(t.version)}"/>
<title>${esc(meta.serialNumber)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-family: "Liberation Sans", Arial, Helvetica, sans-serif; font-size: ${layout.baseFontPt}pt; color: #000; }
  .page { position: relative; width: 210mm; ${mode === "single" ? "height: 297mm; overflow: hidden;" : "min-height: 297mm;"}
    padding: 0 ${layout.pageMarginMm}mm 5mm; display: flex; flex-direction: column; }
  #content { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
  .g { color: ${accent}; }
  .v, .val, .res, .num { font-family: "Liberation Serif", "Times New Roman", Times, serif; color: #000; }
  .letterhead { height: ${t.letterheadConfiguration.heightMm}mm; flex: 0 0 auto; }
  .lh-image img { width: 100%; height: 100%; object-fit: contain; object-position: top center; }
  .lh-text { display: flex; justify-content: space-between; align-items: flex-start; padding-top: 7mm; color: ${accent}; }
  .lh-left { display: flex; gap: 3mm; align-items: flex-start; }
  .lh-logo { max-height: 18mm; max-width: 22mm; object-fit: contain; }
  .lh-name { font-family: "Liberation Serif", serif; font-weight: bold; font-size: 17pt; letter-spacing: .3pt; }
  .lh-reg, .lh-acc { font-family: "Liberation Serif", serif; font-size: 10pt; }
  .lh-acc { margin-top: 2mm; font-size: 11pt; }
  .lh-right { text-align: right; font-family: "Liberation Serif", serif; font-size: 10pt; line-height: 1.25; max-width: 75mm; }

  .box { border: 0.35mm solid ${accent}; }
  .idbox { display: grid; grid-template-columns: 42mm 1fr; }
  .id-photo-head { border-right: 0.35mm solid ${accent}; border-bottom: 0.35mm solid ${accent}; }
  .id-title { border-bottom: 0.35mm solid ${accent}; display: flex; align-items: center; justify-content: center; gap: 6mm; height: 8.5mm; }
  .title { color: ${accent}; font-weight: bold; font-size: 15pt; letter-spacing: 1.6pt; }
  .subtitle { font-family: "Liberation Serif", serif; font-weight: bold; font-size: 12.5pt; }
  .id-photo { border-right: 0.35mm solid ${accent}; display: flex; align-items: center; justify-content: center; padding: 3mm 0; }
  .photo-box { width: 33mm; height: 42mm; }
  .photo-box img { width: 100%; height: 100%; object-fit: cover; }
  .photo-box.empty { border: 0.2mm dashed #bbb; }
  .id-main { display: flex; flex-direction: column; }
  .row { display: flex; align-items: baseline; padding: 0 1.5mm; }
  .row-meta { height: 7mm; border-bottom: 0.35mm solid ${accent}; }
  .row-name { height: 6.5mm; border-bottom: 0.35mm solid ${accent}; }
  .lab { white-space: nowrap; }
  .val { font-size: 10.5pt; margin-left: 2mm; }
  .meta-date { flex: 0 0 33%; } .meta-valid { flex: 0 0 34%; } .meta-serial { flex: 1; text-align: right; padding-right: 8mm; }
  .valid-label { font-family: "Liberation Serif", serif; font-weight: bold; font-size: 10.5pt; }
  .name-title { margin-right: 3mm; }
  .details { display: grid; grid-template-columns: 1fr 1.05fr 0.95fr; column-gap: 2mm; padding: 1mm 1.5mm 0; row-gap: 0.4mm; }
  .details .cell { display: flex; align-items: baseline; min-width: 0; height: 5.2mm; }
  .details .val { white-space: nowrap; overflow: hidden; text-overflow: clip; }
  .unit { margin-left: 1.5mm; font-family: "Liberation Serif", serif; }
  .lower { display: grid; grid-template-columns: 1fr 27mm; padding: 0 1.5mm 1mm; column-gap: 2mm; }
  .position { display: flex; align-items: baseline; height: 6mm; }
  .history { margin-top: 1.4mm; }
  .history .intro, .history .item { display: grid; grid-template-columns: 1fr 22mm; align-items: baseline; min-height: 4.4mm; }
  .history .item .label { padding-left: 0; }
  .history .item .v { font-size: 10.5pt; }
  .qr { width: ${layout.qrSizeMm}mm; height: ${layout.qrSizeMm}mm; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .qr-identity { align-self: center; justify-self: end; }
  .qr-empty { border: 0.2mm dashed #ccc; }
  .declaration { grid-column: 1 / -1; border-top: 0.35mm solid ${accent}; padding: 1.2mm 1.5mm 1mm; color: ${accent}; font-size: ${Math.max(7.6, layout.baseFontPt - 0.6)}pt; line-height: 1.32; text-align: justify; }
  .exam-sign { text-align: right; margin-top: 3mm; padding-right: 10mm; }
  .exam-sign .dots { display: inline-block; width: 52mm; border-bottom: 0.25mm dotted ${accent}; margin-left: 1.5mm; }

  .tables-head { display: grid; grid-template-columns: 52.5% 47.5%; margin-top: 2mm; height: 5.5mm; align-items: end; }
  .tables-head div { color: ${accent}; font-weight: bold; font-size: 10.5pt; letter-spacing: 1pt; text-align: center; }
  .tables { display: grid; grid-template-columns: 52.5% 47.5%; flex: 1 1 auto; min-height: 0; }
  .tables > div + div { border-left: 0.35mm solid ${accent}; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* Result-column rule drawn on the container so it runs down to the remarks box at any row count. */
  .tables > div { min-height: 0; overflow: hidden;
    background: linear-gradient(to right, transparent calc(70% - 0.35mm), ${accent} calc(70% - 0.35mm), ${accent} 70%, transparent 70%); }
  thead th { background: #fff; color: ${accent}; font-weight: normal; font-size: ${layout.baseFontPt + 0.6}pt; height: 6mm; border-bottom: 0.35mm solid ${accent}; }
  thead th + th { border-left: 0.35mm solid ${accent}; }
  tbody td { height: 3.72mm; line-height: 3.72mm; padding: 0 1.2mm; vertical-align: middle; white-space: nowrap; overflow: hidden; }
  tbody td.res { text-align: center; font-size: 10.2pt; }
  tbody td.res.lab { text-align: left; padding-left: 2.2mm; }
  tbody td.res.lab .unit { margin-left: 3mm; }
  tr.gap td { height: 1.9mm; line-height: 1.9mm; }
  td.grp, td.lbl, td.sub, .grp-inline, .side { color: ${accent}; }
  td.ind1 { padding-left: 7mm; } td.ind2 { padding-left: 11mm; } td.ind3 { padding-left: 14mm; }
  .tbl-lab td.lbl.ind1 { padding-left: 4mm; }
  .tbl-lab td.sub { padding-left: 1.2mm; }
  .split { display: flex; justify-content: space-between; }
  .col-exam-res { width: 30%; } .col-lab-grp { width: 21%; } .col-lab-res { width: 30%; }

  .remarks { border-top: 0.35mm solid ${accent}; display: flex; gap: 2mm; padding: 1mm 1.5mm; height: 14mm; }
  .remarks .lab { color: ${accent}; }
  .remarks .v { font-size: 10.5pt; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.3; }

  .footer { flex: 0 0 ${layout.footerHeightMm}mm; display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 1mm; }
  .foot-cell { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; text-align: center; }
  .foot-centre { justify-content: flex-end; }
  .stamp-space { flex: 1; }
  .contact { color: ${accent}; font-size: ${layout.baseFontPt + 0.6}pt; letter-spacing: .3pt; line-height: 1.45; }
  .foot-sign { justify-content: flex-end; }
  .sign-space { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .sig-img { max-height: 16mm; max-width: 50mm; object-fit: contain; }
  .seal-img { max-height: 30mm; max-width: 55mm; object-fit: contain; }
  .signatory { color: ${accent}; font-size: ${layout.baseFontPt + 0.4}pt; letter-spacing: .4pt; line-height: 1.3; }
  .qr-footer { margin-bottom: 1mm; }
  .microline { position: absolute; bottom: 1.6mm; left: ${layout.pageMarginMm}mm; right: ${layout.pageMarginMm}mm; display: flex; justify-content: space-between; font-size: 6pt; color: #777; }
  .watermark { position: absolute; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-30deg);
    font-size: 54pt; font-weight: bold; color: rgba(200, 0, 0, 0.13); letter-spacing: 4pt; pointer-events: none; }
</style></head>
<body><div class="page" id="page">
  ${letterhead(input)}
  <div id="content">
  <div class="box">
    <div class="idbox">
      <div class="id-photo-head"></div>
      <div class="id-title"><span class="title">${esc(fc.reportTitle)}</span>${subtitle ? `<span class="subtitle" data-field="report.destination">${esc(subtitle)}</span>` : ""}</div>
      ${
        layout.showPhotoBox
          ? `<div class="id-photo"><div class="photo-box${photo ? "" : " empty"}">${photo ? `<img src="${photo}" alt=""/>` : ""}</div></div>`
          : `<div class="id-photo"></div>`
      }
      <div class="id-main">
        <div class="row row-meta">
          <div class="meta-date"><span class="lab g">Exam Date:</span><span class="val" data-field="meta.report_date">${esc(formatDate(meta.reportDate))}</span></div>
          <div class="meta-valid"><span class="valid-label">Valid upto</span><span class="val" data-field="meta.valid_until">${esc(formatDate(meta.validUntil))}</span></div>
          <div class="meta-serial"><span class="lab g">Serial Number:</span><span class="val" data-field="meta.serial_number">${esc(meta.serialNumber)}${meta.revisionNumber > 1 ? ` (Rev. ${esc(meta.revisionNumber)})` : ""}</span></div>
        </div>
        <div class="row row-name">
          <span class="lab g">${labelOf(ef("full_name"), "Name")}:</span>
          <span class="val name-title" data-field="examinee.name_title">${ev("name_title")}</span>
          <span class="val" data-field="examinee.full_name">${ev("full_name")}</span>
        </div>
        <div class="details">
          ${[
            ["height_cm", "Height"], ["weight_kg", "Weight"], ["sex", "Sex"],
            ["marital_status", "Status"], ["date_of_birth", "DOB"], ["nationality", "Nationality"],
            ["passport_number", "Passport No"], ["place_of_issue", "Place of Issue"], ["date_of_issue", "DOI"],
          ]
            .map(([k, fb]) => `<div class="cell"><span class="lab g">${labelOf(ef(k), fb)}:</span><span class="val" data-field="examinee.${k}">${ev(k)}</span></div>`)
            .join("")}
        </div>
        <div class="lower">
          <div>
            <div class="position"><span class="lab g">${labelOf(ef("position_applied_for"), "Position applied for")}</span><span class="val" data-field="examinee.position_applied_for">${ev("position_applied_for")}</span></div>
            <div class="history">
              <div class="intro g">${esc(fc.historyIntro)}</div>
              ${historyFields
                .map((f) => `<div class="item"><span class="label g">${esc(f.printLabel ?? f.label)}</span><span class="v" data-field="history.${esc(f.key)}">${valueWithUnit(f, data.history[f.key], 8, 10.5)}</span></div>`)
                .join("")}
            </div>
          </div>
          ${qrInIdentity ? qrBlock("qr-identity") : "<div></div>"}
        </div>
      </div>
      <div class="declaration">${declaration}
        <div class="exam-sign">${esc(fc.examineeSignatureLabel)}<span class="dots"></span></div>
      </div>
    </div>
  </div>

  <div class="tables-head"><div>${esc(fc.examinationHeading)}</div><div>${esc(fc.laboratoryHeading)}</div></div>
  <div class="box" style="flex:1 1 auto; display:flex; flex-direction:column; min-height:0;">
    <div class="tables">
      <div data-fit="1"><table class="tbl-exam">
        <colgroup><col/><col class="col-exam-res"/></colgroup>
        <thead><tr><th>${esc(fc.examinationColumns[0])}</th><th>${esc(fc.examinationColumns[1])}</th></tr></thead>
        <tbody>${tableRows(examGroups, data.examination, "exam")}</tbody>
      </table></div>
      <div data-fit="1"><table class="tbl-lab">
        <colgroup><col class="col-lab-grp"/><col/><col class="col-lab-res"/></colgroup>
        <thead><tr><th colspan="2">${esc(fc.laboratoryColumns[0])}</th><th>${esc(fc.laboratoryColumns[1])}</th></tr></thead>
        <tbody>${tableRows(labGroups, data.laboratory, "lab")}</tbody>
      </table></div>
    </div>
    <div class="remarks"><span class="lab">${esc(fc.remarksLabel)}</span><span class="v" data-field="remarks.remarks"${fitStyle(String(data.remarks.remarks ?? "").length, 150, 10.5)}>${remarksField ? displayValue(remarksField, data.remarks.remarks) : ""}</span></div>
  </div>
  </div>

  <div class="footer">${footerCells.join("")}</div>
  <div class="microline"><span>Ref. ${esc(meta.serialNumber)}${meta.revisionNumber > 1 ? ` · Rev. ${esc(meta.revisionNumber)}` : ""}</span><span>${input.qr ? "Scan the QR code to verify authenticity" : ""}</span><span>Template v${esc(meta.templateVersion)}</span></div>
  ${input.watermark ? `<div class="watermark">${esc(input.watermark)}</div>` : ""}
</div></body></html>`;
}
