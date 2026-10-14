import { DEFAULT_TEMPLATE } from "./default-template";
import {
  fieldConfigurationSchema,
  layoutConfigurationSchema,
  letterheadConfigurationSchema,
  type FieldConfiguration,
  type FieldDefinition,
  type ReportTemplate,
  type SectionKey,
} from "./types";

/**
 * Safety rules that template configuration can never remove. These fields drive identity,
 * verification and search; removing them or making them optional would allow unverifiable reports.
 */
export const LOCKED_FIELDS: Record<SectionKey, string[]> = {
  report: ["destination"],
  examinee: ["full_name", "sex", "date_of_birth", "passport_number", "nationality", "position_applied_for"],
  history: [],
  examination: [],
  laboratory: [],
  remarks: [],
};

/** Sections whose values are medical findings. Defaults are forbidden here. */
export const MEDICAL_SECTIONS: SectionKey[] = ["history", "examination", "laboratory", "remarks"];

export const REQUIRED_SECTIONS: SectionKey[] = ["report", "examinee", "history", "examination", "laboratory", "remarks"];

export class TemplateValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Template is invalid: ${issues.join("; ")}`);
    this.name = "TemplateValidationError";
  }
}

export function allFields(config: FieldConfiguration): Array<{ section: SectionKey; group: string; field: FieldDefinition }> {
  return config.sections.flatMap((s) => s.groups.flatMap((g) => g.fields.map((f) => ({ section: s.key, group: g.key, field: f }))));
}

export function findField(config: FieldConfiguration, path: string): FieldDefinition | undefined {
  const [section, key] = path.split(".");
  return config.sections.find((s) => s.key === section)?.groups.flatMap((g) => g.fields).find((f) => f.key === key);
}

/** Returns a list of human-readable issues; empty means the template is acceptable. */
export function checkTemplateInvariants(config: FieldConfiguration): string[] {
  const issues: string[] = [];
  const sectionKeys = config.sections.map((s) => s.key);

  for (const required of REQUIRED_SECTIONS) {
    if (!sectionKeys.includes(required)) issues.push(`Section "${required}" is required.`);
  }
  if (new Set(sectionKeys).size !== sectionKeys.length) issues.push("Section keys must be unique.");

  for (const section of config.sections) {
    const keys = section.groups.flatMap((g) => g.fields.map((f) => f.key));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) issues.push(`Duplicate field keys in "${section.key}": ${[...new Set(dupes)].join(", ")}.`);

    for (const lockedKey of LOCKED_FIELDS[section.key] ?? []) {
      const f = section.groups.flatMap((g) => g.fields).find((x) => x.key === lockedKey);
      if (!f) issues.push(`Locked field "${section.key}.${lockedKey}" cannot be removed.`);
      else if (!f.required) issues.push(`Locked field "${section.key}.${lockedKey}" must remain required.`);
    }

    for (const group of section.groups) {
      for (const f of group.fields) {
        const path = `${section.key}.${f.key}`;
        if (f.defaultValue !== undefined && f.defaultValue !== "") {
          if (MEDICAL_SECTIONS.includes(section.key)) {
            issues.push(`"${path}" is a medical finding and must not have a default value.`);
          } else if (f.category === "manual") {
            issues.push(`"${path}" is manually entered and must not have a default value.`);
          }
        }
        if ((f.type === "select") && (!f.options || f.options.length === 0)) {
          issues.push(`"${path}" is a dropdown and needs at least one option.`);
        }
        if (f.min !== undefined && f.max !== undefined && f.min > f.max) issues.push(`"${path}" has min greater than max.`);
        if (f.pattern) {
          try {
            new RegExp(f.pattern);
          } catch {
            issues.push(`"${path}" has an invalid validation pattern.`);
          }
        }
        for (const rule of [f.visibleWhen, f.requiredWhen]) {
          if (rule && !findField(config, rule.field)) issues.push(`"${path}" references unknown field "${rule.field}".`);
        }
      }
    }
  }
  return issues;
}

/** Parses untrusted template JSON (e.g. from the admin editor) and enforces invariants. */
export function parseTemplate(input: {
  name: string;
  version: number;
  fieldConfiguration: unknown;
  letterheadConfiguration: unknown;
  layoutConfiguration: unknown;
}): ReportTemplate {
  const fc = fieldConfigurationSchema.safeParse(input.fieldConfiguration);
  const lh = letterheadConfigurationSchema.safeParse(input.letterheadConfiguration ?? {});
  const lc = layoutConfigurationSchema.safeParse(input.layoutConfiguration ?? {});
  const issues: string[] = [];
  if (!fc.success) issues.push(...fc.error.issues.map((i) => `fieldConfiguration.${i.path.join(".")}: ${i.message}`));
  if (!lh.success) issues.push(...lh.error.issues.map((i) => `letterheadConfiguration.${i.path.join(".")}: ${i.message}`));
  if (!lc.success) issues.push(...lc.error.issues.map((i) => `layoutConfiguration.${i.path.join(".")}: ${i.message}`));
  if (fc.success) issues.push(...checkTemplateInvariants(fc.data));
  if (issues.length || !fc.success || !lh.success || !lc.success) throw new TemplateValidationError(issues);
  return {
    name: input.name,
    version: input.version,
    fieldConfiguration: fc.data,
    letterheadConfiguration: lh.data,
    layoutConfiguration: lc.data,
  };
}

/** Converts a DB row into a ReportTemplate, falling back to the built-in default if absent. */
export function templateFromRow(row: {
  id: string;
  name: string;
  version: number;
  field_configuration: unknown;
  letterhead_configuration: unknown;
  layout_configuration: unknown;
} | null): ReportTemplate {
  if (!row) return DEFAULT_TEMPLATE;
  const t = parseTemplate({
    name: row.name,
    version: row.version,
    fieldConfiguration: row.field_configuration,
    letterheadConfiguration: row.letterhead_configuration,
    layoutConfiguration: row.layout_configuration,
  });
  return { ...t, id: row.id };
}
