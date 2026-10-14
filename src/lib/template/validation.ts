import { allFields } from "./invariants";
import type { FieldDefinition, FieldValue, ReportData, ReportTemplate, SectionKey, VisibilityRule } from "./types";

export type ValidationMode = "draft" | "complete";

export interface ValidationIssue {
  path: string; // "section.field"
  label: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  data: ReportData;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const SECTIONS: SectionKey[] = ["report", "examinee", "history", "examination", "laboratory", "remarks"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function getValue(data: ReportData, path: string): FieldValue | undefined {
  const [section, key] = path.split(".") as [SectionKey, string];
  return data[section]?.[key];
}

export function ruleMatches(rule: VisibilityRule | undefined, data: ReportData): boolean {
  if (!rule) return false;
  const v = getValue(data, rule.field);
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toUpperCase();
  return rule.equals.some((e) => e.toUpperCase() === s);
}

export function isFieldVisible(field: FieldDefinition, data: ReportData): boolean {
  return field.visibleWhen ? ruleMatches(field.visibleWhen, data) : true;
}

export function isFieldRequired(field: FieldDefinition, data: ReportData): boolean {
  if (!isFieldVisible(field, data)) return false;
  return field.required || ruleMatches(field.requiredWhen, data);
}

function normaliseValue(field: FieldDefinition, raw: unknown): { value: FieldValue; error?: string } {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw === "string" && raw.trim() === "") return { value: null };

  switch (field.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
      if (!Number.isFinite(n)) return { value: null, error: "Enter a number." };
      if (field.min !== undefined && n < field.min) return { value: n, error: `Must be at least ${field.min}.` };
      if (field.max !== undefined && n > field.max) return { value: n, error: `Must be at most ${field.max}.` };
      return { value: n };
    }
    case "date": {
      const s = String(raw).trim();
      if (!isValidIsoDate(s)) return { value: null, error: "Enter a valid date." };
      return { value: s };
    }
    case "select": {
      const s = String(raw).trim();
      if (!field.options?.some((o) => o.value === s)) return { value: null, error: "Choose one of the listed options." };
      return { value: s };
    }
    default: {
      const s = String(raw).replace(/\s+/g, " ").trim();
      if (field.type === "textarea") {
        const t = String(raw).replace(/\r\n/g, "\n").trim();
        if (field.maxLength && t.length > field.maxLength) return { value: t, error: `Maximum ${field.maxLength} characters.` };
        return { value: t };
      }
      if (field.maxLength && s.length > field.maxLength) return { value: s, error: `Maximum ${field.maxLength} characters.` };
      if (field.pattern && !new RegExp(field.pattern).test(s)) {
        return { value: s, error: field.patternMessage ?? "Invalid format." };
      }
      return { value: s };
    }
  }
}

/**
 * Validates and normalises report data against a template.
 *  - "draft": type/format checks only; required fields may be empty.
 *  - "complete": additionally enforces required and conditionally-required fields.
 * Unknown keys are dropped. Hidden conditional fields are cleared. Nothing is ever auto-filled.
 */
export function validateReportData(
  template: ReportTemplate,
  input: Partial<Record<SectionKey, Record<string, unknown>>>,
  mode: ValidationMode,
  context: { reportDate?: string | null } = {},
): ValidationResult {
  const data: ReportData = { report: {}, examinee: {}, history: {}, examination: {}, laboratory: {}, remarks: {} };
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const fields = allFields(template.fieldConfiguration);

  // First pass: normalise every known field.
  for (const { section, field } of fields) {
    const raw = input?.[section]?.[field.key];
    const { value, error } = normaliseValue(field, raw);
    data[section][field.key] = value;
    if (error) errors.push({ path: `${section}.${field.key}`, label: field.label, message: error, severity: "error" });
  }

  // Second pass: visibility and required checks depend on other values.
  for (const { section, field } of fields) {
    const path = `${section}.${field.key}`;
    if (!isFieldVisible(field, data)) {
      data[section][field.key] = null;
      for (let i = errors.length - 1; i >= 0; i--) if (errors[i].path === path) errors.splice(i, 1);
      continue;
    }
    if (mode === "complete" && isFieldRequired(field, data) && data[section][field.key] === null) {
      if (!errors.some((e) => e.path === path)) {
        errors.push({ path, label: field.label, message: "Required.", severity: "error" });
      }
    }
  }

  // Cross-field checks (identity).
  const today = new Date().toISOString().slice(0, 10);
  const reportDate = context.reportDate && isValidIsoDate(context.reportDate) ? context.reportDate : today;
  const dob = data.examinee.date_of_birth as string | null;
  const doi = data.examinee.date_of_issue as string | null;
  const doe = data.examinee.date_of_expiry as string | null;
  if (dob && (dob > reportDate || dob < "1900-01-01")) {
    errors.push({ path: "examinee.date_of_birth", label: "Date of birth", message: "Date of birth is not plausible.", severity: "error" });
  }
  if (doi && doi > reportDate) {
    errors.push({ path: "examinee.date_of_issue", label: "Date of issue", message: "Date of issue cannot be after the exam date.", severity: "error" });
  }
  if (doi && dob && doi < dob) {
    errors.push({ path: "examinee.date_of_issue", label: "Date of issue", message: "Date of issue cannot be before date of birth.", severity: "error" });
  }
  if (doe && doi && doe <= doi) {
    errors.push({ path: "examinee.date_of_expiry", label: "Date of expiry", message: "Date of expiry must be after date of issue.", severity: "error" });
  }
  if (doe && doe < reportDate) {
    warnings.push({ path: "examinee.date_of_expiry", label: "Date of expiry", message: "Passport had expired on the exam date.", severity: "warning" });
  }
  const lmp = data.laboratory.lmp as string | null;
  if (lmp && lmp > reportDate) {
    errors.push({ path: "laboratory.lmp", label: "LMP", message: "LMP cannot be after the exam date.", severity: "error" });
  }

  return { ok: errors.length === 0, data, errors, warnings };
}

export function emptySectionValues(template: ReportTemplate): ReportData {
  const data: ReportData = { report: {}, examinee: {}, history: {}, examination: {}, laboratory: {}, remarks: {} };
  for (const { section, field } of allFields(template.fieldConfiguration)) {
    // Predefined (non-medical) fields may have an administrator-configured default.
    data[section][field.key] = field.category === "predefined" && field.defaultValue ? field.defaultValue : null;
  }
  return data;
}

export { SECTIONS };
