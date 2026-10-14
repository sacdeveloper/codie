/**
 * Default report template, transcribed from the supplied reference report
 * (a scanned "MEDICAL REPORT / MEDICAL FOR QATAR"; kept out of the repository because it contains
 * personal data — store it in docs/reference/ locally, which is git-ignored).
 *
 * Colour mapping observed on the reference scan:
 *   GREEN (pre-printed)  -> labels, headings, column titles, declaration wording, signatory caption,
 *                           footer contact lines. Modelled as template text / field labels
 *                           (category "predefined") and organisation settings.
 *   BLACK (typed)        -> destination, exam date, validity, serial, title, name, all identity
 *                           values, history answers, every examination and laboratory result,
 *                           units typed beside numeric values, and remarks (category "manual").
 *   PURPLE (rubber stamps, applied physically) -> "ORIGINAL", centre seal, "FIT", doctor's stamp.
 *                           These are NOT reproduced; blank space is reserved instead.
 *
 * Result fields carry *suggested* options (e.g. NAD, NIL, ABSENT) but never a default value:
 * no medical result is ever pre-filled.
 */
import type { FieldDefinition, ReportTemplate } from "./types";

type F = Partial<FieldDefinition> & Pick<FieldDefinition, "key" | "label" | "type">;

const field = (f: F): FieldDefinition => ({
  category: "manual",
  required: false,
  indent: 1,
  locked: false,
  print: true,
  ...f,
});

const opts = (...values: string[]) => values.map((v) => ({ value: v, label: v }));

const NAD = opts("NAD", "ABNORMAL");
const NORMAL = opts("NORMAL", "ABNORMAL");
const NIL = opts("NIL", "PRESENT");
const ABSENT = opts("ABSENT", "PRESENT");
const SEEN = opts("NOT SEEN", "SEEN");
const SEROLOGY = opts("NEGATIVE", "POSITIVE");
const VISION = opts("NAD 6/6", "NAD 6/9", "NAD 6/12", "6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60");
const POSITIVE_RESULTS = ["POSITIVE", "REACTIVE"];
const FEMALE = { field: "examinee.sex", equals: ["FEMALE"] };

export const DESTINATION_OPTIONS = opts(
  "QATAR",
  "SAUDI ARABIA",
  "UNITED ARAB EMIRATES",
  "KUWAIT",
  "OMAN",
  "BAHRAIN",
);

export const DEFAULT_TEMPLATE: ReportTemplate = {
  name: "Medical Report (GCC pre-employment)",
  version: 1,
  letterheadConfiguration: { mode: "blank", heightMm: 38 },
  layoutConfiguration: {
    qrPosition: "identity",
    qrSizeMm: 24,
    showPhotoBox: true,
    footerHeightMm: 33,
    signaturePosition: "right",
    sealPosition: "left",
    pageMarginMm: 8,
    baseFontPt: 8.6,
    accentColor: "#1f9a4b",
  },
  fieldConfiguration: {
    reportTitle: "MEDICAL REPORT",
    subtitlePattern: "MEDICAL FOR {destination}",
    historyIntro: "History of any significant past illness including:",
    declarationText:
      "I hereby permit the {declaration_organisation_name} and the undersigned physician to furnish such information the company may need performing to my health status and other pertinent and medical findings and do hereby release them from any and all legal responsibility by doing so. I also certify that my medical history contained above is true and any false statement will disqualify me from my employment, benefits and claims.",
    examineeSignatureLabel: "Signature of Examinee",
    examinationHeading: "MEDICAL EXAMINATION",
    examinationColumns: ["TYPE OF MEDICAL EXAM", "RESULTS"],
    laboratoryHeading: "LABORATORY INVESTIGATIONS",
    laboratoryColumns: ["TYPE OF LAB. INVESTIGATIONS", "RESULTS"],
    remarksLabel: "Remarks",
    authorisedSignatoryLabel: "AUTHORISED SIGNATORY",
    sections: [
      {
        key: "report",
        title: "Report information",
        groups: [
          {
            key: "report",
            titleInline: false,
            title: "",
            fields: [
              field({
                key: "destination",
                label: "Medical for (destination country)",
                type: "select",
                options: DESTINATION_OPTIONS,
                required: true,
                locked: true,
                indent: 0,
                helpText: 'Printed beside the title, e.g. "MEDICAL FOR QATAR". Options are configurable.',
              }),
            ],
          },
        ],
      },
      {
        key: "examinee",
        title: "Examinee details",
        groups: [
          {
            key: "identity",
            titleInline: false,
            title: "",
            fields: [
              field({ key: "name_title", label: "Title", printLabel: "Name", type: "select", options: opts("Mr.", "Mrs.", "Ms.", "Miss"), indent: 0 }),
              field({ key: "full_name", label: "Full name (as in passport)", printLabel: "Name", type: "text", required: true, locked: true, maxLength: 55, indent: 0 }),
              field({ key: "height_cm", label: "Height", printLabel: "Height", type: "number", unit: "Cms.", min: 50, max: 250, required: true, indent: 0 }),
              field({ key: "weight_kg", label: "Weight", printLabel: "Weight", type: "number", unit: "Kgs", min: 20, max: 300, required: true, indent: 0 }),
              field({ key: "sex", label: "Sex", printLabel: "Sex", type: "select", options: opts("MALE", "FEMALE"), required: true, locked: true, indent: 0 }),
              field({ key: "marital_status", label: "Marital status", printLabel: "Status", type: "select", options: opts("SINGLE", "MARRIED", "DIVORCED", "WIDOWED"), required: true, indent: 0 }),
              field({ key: "date_of_birth", label: "Date of birth", printLabel: "DOB", type: "date", required: true, locked: true, indent: 0 }),
              field({ key: "nationality", label: "Nationality", printLabel: "Nationality", type: "text", required: true, maxLength: 14, indent: 0 }),
              field({
                key: "passport_number",
                label: "Passport number",
                printLabel: "Passport No",
                type: "text",
                required: true,
                locked: true,
                maxLength: 13,
                pattern: "^[A-Za-z0-9 ]{5,13}$",
                patternMessage: "Use 5–13 letters, digits or spaces as printed in the passport.",
                indent: 0,
              }),
              field({ key: "place_of_issue", label: "Place of issue", printLabel: "Place of Issue", type: "text", maxLength: 14, indent: 0 }),
              field({ key: "date_of_issue", label: "Date of issue", printLabel: "DOI", type: "date", indent: 0 }),
              field({ key: "date_of_expiry", label: "Date of expiry (if applicable)", type: "date", print: false, indent: 0, helpText: "Captured for validation; not printed on the reference form." }),
              field({ key: "position_applied_for", label: "Position applied for", printLabel: "Position applied for", type: "text", required: true, maxLength: 45, indent: 0 }),
            ],
          },
        ],
      },
      {
        key: "history",
        title: "Medical history and declaration",
        groups: [
          {
            key: "past_illness",
            titleInline: false,
            title: "",
            fields: [
              field({ key: "psychiatric_neurological", label: "1) Psychiatric and Neurological disorders (Epilepsy, Depression)", type: "result", options: NIL, required: true, maxLength: 16 }),
              field({ key: "allergy", label: "2) Allergy", type: "result", options: NIL, required: true, maxLength: 16 }),
              field({ key: "others", label: "3) Others", type: "result", options: NIL, required: true, maxLength: 16 }),
            ],
          },
        ],
      },
      {
        key: "examination",
        title: "Medical examination",
        groups: [
          {
            key: "eye",
            titleInline: true,
            title: "EYE",
            fields: [
              field({ key: "right_eye", label: "R. EYE", type: "result", options: VISION, required: true, maxLength: 14 }),
              field({ key: "left_eye", label: "L. EYE", type: "result", options: VISION, required: true, maxLength: 14 }),
            ],
          },
          {
            key: "ear",
            titleInline: true,
            title: "EAR",
            fields: [
              field({ key: "right_ear", label: "R. EAR", type: "result", options: NAD, required: true, maxLength: 14 }),
              field({ key: "left_ear", label: "L. EAR", type: "result", options: NAD, required: true, maxLength: 14 }),
            ],
          },
          {
            key: "systematic",
            titleInline: false,
            title: "SYSTEMATIC EXAMINATION",
            fields: [
              field({ key: "cardiovascular", label: "CARDIO-VASCULAR", type: "result", options: NORMAL, required: true, maxLength: 14 }),
              field({
                key: "blood_pressure",
                label: "B.P.",
                type: "text",
                required: true,
                maxLength: 15,
                pattern: "^\\d{2,3}/\\d{2,3}(/\\d{2,3})?$",
                patternMessage: "Enter systolic/diastolic[/pulse], e.g. 120/80 or 120/80/72.",
                placeholder: "e.g. 120/80/72",
              }),
              field({ key: "heart", label: "HEART", type: "result", options: NAD, required: true, maxLength: 14 }),
            ],
          },
          {
            key: "respiratory",
            titleInline: false,
            title: "RESPIRATORY SYSTEM",
            fields: [
              field({ key: "lungs", label: "LUNGS", type: "result", options: NAD, required: true, maxLength: 14 }),
              field({ key: "chest_xray", label: "CHEST X-RAY", type: "result", options: NORMAL, required: true, maxLength: 14 }),
            ],
          },
          {
            key: "gastro_intestinal",
            titleInline: false,
            title: "GASTRO INTESTINAL",
            fields: [field({ key: "abdomen", label: "ABDOMEN", type: "result", options: NAD, required: true, maxLength: 14 })],
          },
          {
            key: "others",
            titleInline: false,
            title: "OTHERS",
            fields: [
              field({ key: "hernia", label: "HERNIA", type: "result", options: NIL, required: true, maxLength: 14 }),
              field({ key: "varicose_veins", label: "VARICOSE VEINS", type: "result", options: NIL, required: true, maxLength: 14 }),
              field({ key: "extremities", label: "EXTREMITIES", type: "result", options: NAD, required: true, maxLength: 14 }),
              field({ key: "deformities", label: "DEFORMITIES", type: "result", options: NIL, required: true, maxLength: 14 }),
              field({ key: "skin", label: "SKIN", type: "result", options: NAD, required: true, maxLength: 14 }),
            ],
          },
          {
            key: "venereal",
            titleInline: false,
            title: "VENEREAL DISEASES",
            fields: [field({ key: "clinical", label: "CLINICAL", type: "result", options: NAD, required: true, maxLength: 14 })],
          },
        ],
      },
      {
        key: "laboratory",
        title: "Laboratory investigations",
        groups: [
          {
            key: "urine",
            titleInline: true,
            title: "URINE",
            fields: [
              field({ key: "urine_sugar", label: "SUGAR", type: "result", options: opts("ABSENT", "PRESENT", "TRACE"), required: true, maxLength: 12 }),
              field({ key: "urine_albumin", label: "ALBUMIN", type: "result", options: opts("ABSENT", "PRESENT", "TRACE"), required: true, maxLength: 12 }),
            ],
          },
          {
            key: "stool",
            titleInline: true,
            title: "STOOL",
            fields: [
              field({ key: "stool_routine", label: "ROUTINE", type: "result", options: NAD, required: true, maxLength: 12 }),
              field({ key: "helminthes", label: "1. HELMINTHES", type: "result", options: NIL, required: true, maxLength: 12 }),
              field({ key: "giardia", label: "2. GIARDIA", type: "result", options: ABSENT, required: true, maxLength: 12 }),
              field({ key: "salmonella", label: "3. SALMONELLA", type: "result", options: ABSENT, required: true, maxLength: 12 }),
              field({ key: "shigella", label: "SHIGELLA", type: "result", options: ABSENT, required: true, maxLength: 12, indent: 2 }),
              field({ key: "v_cholera", label: "V.CHOLERA (IF ENDEMIC)", type: "result", options: ABSENT, maxLength: 12, indent: 2, helpText: "Only required where cholera is endemic." }),
            ],
          },
          {
            key: "blood",
            titleInline: true,
            title: "BLOOD",
            fields: [
              field({ key: "hemoglobin", label: "HEMOGLOBIN", type: "number", unit: "grms.%", min: 2, max: 25, required: true }),
              field({ key: "malaria", label: "1. MALARIA", type: "result", options: SEEN, required: true, maxLength: 12, headingBefore: "THICK FILM FOR" }),
              field({ key: "micro_filaria", label: "2. MICRO FILARIA", type: "result", options: SEEN, required: true, maxLength: 12 }),
              field({
                key: "blood_group",
                label: "3. GROUPING & RH",
                type: "select",
                options: opts("A + VE", "A - VE", "B + VE", "B - VE", "AB + VE", "AB - VE", "O + VE", "O - VE"),
                required: true,
              }),
            ],
          },
          {
            key: "serology",
            titleInline: true,
            title: "SEROLOGY",
            fields: [
              field({ key: "blood_sugar", label: "1. BLOOD SUGAR", type: "number", unit: "mgs./dl", min: 10, max: 1000, required: true }),
              field({ key: "lft", label: "2. L.F.T", type: "result", options: NORMAL, required: true, maxLength: 12 }),
              field({ key: "creatinine", label: "3 CREATININE", type: "number", unit: "mgs./dl", min: 0.1, max: 30, required: true }),
              field({ key: "urea", label: "4.UREA", type: "number", unit: "mgs./dl", min: 1, max: 400, required: true }),
            ],
          },
          {
            key: "elisa",
            titleInline: true,
            title: "ELISA",
            fields: [
              field({ key: "hiv", label: "1. HIV 1-2 TEST", type: "result", options: SEROLOGY, required: true, maxLength: 12 }),
              field({ key: "hbsag", label: "2. Hbs Ag", type: "result", options: SEROLOGY, required: true, maxLength: 12 }),
              field({ key: "anti_hcv", label: "3. Anti HCV", type: "result", options: SEROLOGY, required: true, maxLength: 12 }),
            ],
          },
          {
            key: "vdrl",
            titleInline: true,
            title: "VDRL",
            fields: [field({ key: "vdrl", label: "VDRL", printLabel: "", type: "result", options: opts("NEGATIVE", "POSITIVE", "REACTIVE", "NON-REACTIVE"), required: true, maxLength: 12, indent: 0 })],
          },
          {
            key: "tpha",
            titleInline: true,
            title: "TPHA (IF VDRL POSITIVE)",
            fields: [
              field({
                key: "tpha",
                label: "TPHA (IF VDRL POSITIVE)",
                printLabel: "",
                type: "result",
                options: SEROLOGY,
                maxLength: 12,
                indent: 0,
                requiredWhen: { field: "laboratory.vdrl", equals: POSITIVE_RESULTS },
                helpText: "Required when VDRL is positive/reactive.",
              }),
            ],
          },
          {
            key: "pregnancy",
            titleInline: true,
            title: "PREGNANCY TEST",
            fields: [
              field({ key: "pregnancy_test", label: "PREGNANCY TEST", printLabel: "", type: "result", options: SEROLOGY, maxLength: 12, indent: 0, visibleWhen: FEMALE, requiredWhen: FEMALE }),
            ],
          },
          {
            key: "lmp",
            titleInline: true,
            title: "LMP",
            fields: [field({ key: "lmp", label: "LMP", printLabel: "", type: "date", indent: 0, visibleWhen: FEMALE })],
          },
        ],
      },
      {
        key: "remarks",
        title: "Remarks",
        groups: [
          {
            key: "remarks",
            titleInline: false,
            title: "",
            fields: [
              field({
                key: "remarks",
                label: "Medical officer's remarks",
                type: "textarea",
                maxLength: 300,
                indent: 0,
                helpText: "Entered by the medical officer. The system never generates conclusions.",
              }),
            ],
          },
        ],
      },
    ],
  },
};
