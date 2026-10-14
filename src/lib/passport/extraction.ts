import { nationalityFromCode } from "./countries";
import { parseMrz, type MrzResult } from "./mrz";
import {
  PASSPORT_FIELD_KEYS,
  type ExtractedField,
  type PassportExtraction,
  type PassportFieldKey,
  type PassportOcrInput,
  type PassportOcrProvider,
  type RawProviderField,
  type RawProviderResult,
} from "./types";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.85;

const empty = (reason = "Not found on the document."): ExtractedField => ({
  value: null,
  confidence: null,
  source: "none",
  needsReview: true,
  reason,
});

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function fromViz(f: RawProviderField | undefined): ExtractedField | null {
  if (!f || f.value === null || f.value.trim() === "") return null;
  const lowConfidence = f.confidence !== null && f.confidence < REVIEW_CONFIDENCE_THRESHOLD;
  return {
    value: f.value.trim(),
    confidence: f.confidence,
    source: "viz",
    needsReview: f.confidence === null || lowConfidence,
    reason: f.confidence === null ? "Provider did not report confidence." : lowConfidence ? "Low OCR confidence." : undefined,
  };
}

/**
 * Combines a VIZ value with the MRZ value for the same field.
 * Check-digit-protected MRZ values are preferred for identifiers and dates; any disagreement is
 * surfaced for review rather than silently resolved.
 */
function merge(viz: ExtractedField | null, mrzValue: string | null, mrzCheckValid: boolean | null, preferMrz: boolean): ExtractedField {
  const mrzField: ExtractedField | null =
    mrzValue && mrzValue.trim()
      ? {
          value: mrzValue,
          confidence: mrzCheckValid ? 0.99 : null,
          source: "mrz",
          needsReview: mrzCheckValid !== true,
          reason: mrzCheckValid === false ? "MRZ check digit failed." : mrzCheckValid === null ? "Read from MRZ (no check digit)." : undefined,
        }
      : null;

  if (viz && mrzField) {
    if (norm(viz.value) === norm(mrzField.value)) {
      return {
        value: preferMrz && mrzCheckValid ? mrzField.value : viz.value,
        confidence: Math.max(viz.confidence ?? 0, mrzField.confidence ?? 0) || null,
        source: "viz+mrz",
        needsReview: !(mrzCheckValid || !viz.needsReview),
        reason: undefined,
      };
    }
    const chosen = preferMrz && mrzCheckValid ? mrzField : viz;
    return { ...chosen, needsReview: true, reason: "Printed value and MRZ disagree — check against the passport." };
  }
  return viz ?? mrzField ?? empty();
}

/** Turns a provider's raw output into a reviewed-ready extraction. Never invents values. */
export function validateExtraction(raw: RawProviderResult, now = new Date()): PassportExtraction {
  const warnings: string[] = [];
  const f = raw.fields;
  let mrz: MrzResult | null = null;
  if (raw.mrzText) mrz = parseMrz(raw.mrzText, now);
  if (!mrz && raw.fullText) mrz = parseMrz(raw.fullText, now);
  if (mrz && !mrz.valid) warnings.push("The machine-readable zone failed one or more check digits; MRZ-derived values need review.");
  if (!mrz) warnings.push("No machine-readable zone was detected; all values come from printed text only.");
  if (mrz && mrz.documentCode && !mrz.documentCode.startsWith("P")) warnings.push("The document does not appear to be a passport.");

  const check = (name: string) => (mrz ? mrz.checks.find((c) => c.field === name)?.valid ?? null : null);

  const surname = merge(fromViz(f.surname), mrz?.surname || null, mrz ? true : null, false);
  const givenNames = merge(fromViz(f.givenNames), mrz?.givenNames || null, mrz ? true : null, false);
  // MRZ names are transliterated and may be truncated; never treat them as authoritative alone.
  for (const n of [surname, givenNames]) {
    if (n.source === "mrz") {
      n.needsReview = true;
      n.reason = "Taken from MRZ — may be truncated or transliterated.";
    }
  }

  const passportNumber = merge(fromViz(f.passportNumber), mrz?.documentNumber || null, check("documentNumber"), true);
  const dateOfBirth = merge(fromViz(f.dateOfBirth), mrz?.dateOfBirth ?? null, check("dateOfBirth"), true);
  const dateOfExpiry = merge(fromViz(f.dateOfExpiry), mrz?.dateOfExpiry ?? null, check("dateOfExpiry"), true);

  const vizSex = fromViz(f.sex);
  const normalisedVizSex = vizSex ? { ...vizSex, value: normaliseSex(vizSex.value) } : null;
  if (vizSex && !normalisedVizSex?.value) {
    normalisedVizSex!.needsReview = true;
    normalisedVizSex!.reason = `Unrecognised sex value "${vizSex.value}".`;
  }
  const sex = merge(normalisedVizSex?.value ? normalisedVizSex : null, mrz?.sex ? normaliseSex(mrz.sex) : null, mrz ? true : null, false);

  const natCode = f.nationalityCode?.value ?? mrz?.nationality ?? null;
  const vizNat = fromViz(f.nationality);
  let nationality: ExtractedField;
  if (vizNat) {
    nationality = vizNat;
  } else if (natCode) {
    const n = nationalityFromCode(natCode);
    nationality = {
      value: n.value,
      confidence: null,
      source: f.nationalityCode ? "viz" : "mrz",
      needsReview: !n.known,
      reason: n.known ? undefined : `Nationality code "${natCode}" is not in the lookup table — enter the nationality.`,
    };
  } else {
    nationality = empty();
  }

  // Place of issue is optional on many passports and must not be confused with the issuing authority.
  const vizPlace = fromViz(f.placeOfIssue);
  const placeOfIssue: ExtractedField = vizPlace
    ? { ...vizPlace, needsReview: true, reason: vizPlace.reason ?? "Confirm this is the place of issue." }
    : empty("No place of issue was printed or detected. Enter it manually if the report requires it.");
  const issuingAuthority = fromViz(f.issuingAuthority) ?? empty("No issuing authority detected.");

  const dateOfIssue = fromViz(f.dateOfIssue) ?? empty();

  const fullName: ExtractedField =
    givenNames.value || surname.value
      ? {
          value: [givenNames.value, surname.value].filter(Boolean).join(" "),
          confidence: null,
          source: "derived",
          needsReview: true,
          reason: "Composed from given names and surname — confirm the order matches the passport.",
        }
      : empty();

  const fields = { surname, givenNames, fullName, passportNumber, dateOfBirth, sex, nationality, placeOfIssue, issuingAuthority, dateOfIssue, dateOfExpiry };
  for (const key of PASSPORT_FIELD_KEYS) {
    const v = fields[key];
    if (v.value && /date/i.test(key) && !/^\d{4}-\d{2}-\d{2}$/.test(v.value)) {
      fields[key] = { ...v, value: null, needsReview: true, reason: `Unreadable date "${v.value}".` };
    }
  }

  return {
    provider: raw.provider,
    isMock: raw.isMock,
    fields,
    mrz: mrz ? { format: mrz.format, valid: mrz.valid, checks: mrz.checks, issuingState: mrz.issuingState } : null,
    warnings,
  };
}

export function normaliseSex(v: string | null | undefined): "MALE" | "FEMALE" | null {
  const s = (v ?? "").trim().toUpperCase();
  if (["M", "MALE", "H", "HOMME"].includes(s)) return "MALE";
  if (["F", "FEMALE", "FEMME", "W"].includes(s)) return "FEMALE";
  return null;
}

export async function extractPassportData(provider: PassportOcrProvider, input: PassportOcrInput): Promise<PassportExtraction> {
  const raw = await provider.extract(input);
  return validateExtraction(raw);
}

/** Reviewed values keyed by report examinee field. */
export type ExamineePassportValues = Partial<
  Record<"full_name" | "passport_number" | "date_of_birth" | "sex" | "nationality" | "place_of_issue" | "date_of_issue" | "date_of_expiry", string | null>
>;

/**
 * Maps (reviewed) passport fields onto the report's examinee section.
 * The passport number and name are preserved exactly as printed; normalised forms are derived
 * separately by the database for searching. Issuing authority is never mapped to place of issue.
 */
export function mapPassportFieldsToReport(fields: Partial<Record<PassportFieldKey, string | null>>): ExamineePassportValues {
  const out: ExamineePassportValues = {};
  const set = (k: keyof ExamineePassportValues, v: string | null | undefined) => {
    if (v !== undefined && v !== null && v.trim() !== "") out[k] = v.trim();
  };
  set("full_name", fields.fullName ?? ([fields.givenNames, fields.surname].filter(Boolean).join(" ") || null));
  set("passport_number", fields.passportNumber);
  set("date_of_birth", fields.dateOfBirth);
  set("sex", normaliseSex(fields.sex) ?? null);
  set("nationality", fields.nationality);
  set("place_of_issue", fields.placeOfIssue);
  set("date_of_issue", fields.dateOfIssue);
  set("date_of_expiry", fields.dateOfExpiry);
  return out;
}

export function extractionToValues(e: PassportExtraction): Record<PassportFieldKey, string | null> {
  return Object.fromEntries(PASSPORT_FIELD_KEYS.map((k) => [k, e.fields[k].value])) as Record<PassportFieldKey, string | null>;
}
