import { z } from "zod";

/**
 * Field categories mirror the colour coding of the reference report:
 *  - "predefined" (green on the reference): labels, template text and values that come from
 *    organisation settings, configuration or system-generated identifiers.
 *  - "manual" (black on the reference): values typed for each individual examinee.
 */
export const fieldCategorySchema = z.enum(["predefined", "manual", "system"]);
export type FieldCategory = z.infer<typeof fieldCategorySchema>;

export const fieldTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  // Free text with configured suggestions (e.g. NAD / NIL / ABSENT). Nothing is pre-selected.
  "result",
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const optionSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
});

export const visibilityRuleSchema = z.object({
  /** Path in the form "section.field", e.g. "examinee.sex". */
  field: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/),
  equals: z.array(z.string()).min(1),
});
export type VisibilityRule = z.infer<typeof visibilityRuleSchema>;

export const fieldDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(120),
  /** Label printed on the PDF if it differs from the on-screen label. */
  printLabel: z.string().max(120).optional(),
  category: fieldCategorySchema,
  type: fieldTypeSchema,
  required: z.boolean().default(false),
  /** Shown/required only when the rule matches. */
  visibleWhen: visibilityRuleSchema.optional(),
  /** Field becomes required when this rule matches (e.g. TPHA when VDRL is positive). */
  requiredWhen: visibilityRuleSchema.optional(),
  options: z.array(optionSchema).max(60).optional(),
  unit: z.string().max(30).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().int().positive().max(2000).optional(),
  pattern: z.string().max(200).optional(),
  patternMessage: z.string().max(200).optional(),
  /** Only predefined fields may carry a default. Medical results never do. */
  defaultValue: z.string().max(200).optional(),
  placeholder: z.string().max(120).optional(),
  helpText: z.string().max(300).optional(),
  /** A sub-heading line printed immediately before this field, e.g. "THICK FILM FOR". */
  headingBefore: z.string().max(120).optional(),
  /** Whether the field is printed on the PDF (some captured values are not on the reference form). */
  print: z.boolean().default(true),
  /** Indentation level used by the print layout (0 = group heading row). */
  indent: z.number().int().min(0).max(3).default(0),
  /** System-locked fields cannot be removed, renamed or made optional by administrators. */
  locked: z.boolean().default(false),
});
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

export const fieldGroupSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Group heading printed in the left-most column, e.g. "URINE" or "EYE". */
  title: z.string().max(120),
  /** Optional sub-heading printed before the fields, e.g. "THICK FILM FOR". */
  subtitle: z.string().max(120).optional(),
  /** Print the group title on the same line as its first field (e.g. "URINE  SUGAR", "EYE  R. EYE"). */
  titleInline: z.boolean().default(false),
  fields: z.array(fieldDefinitionSchema),
});
export type FieldGroup = z.infer<typeof fieldGroupSchema>;

export const sectionKeySchema = z.enum(["report", "examinee", "history", "examination", "laboratory", "remarks"]);
export type SectionKey = z.infer<typeof sectionKeySchema>;

export const sectionSchema = z.object({
  key: sectionKeySchema,
  title: z.string().max(120),
  groups: z.array(fieldGroupSchema),
});
export type TemplateSection = z.infer<typeof sectionSchema>;

export const fieldConfigurationSchema = z.object({
  reportTitle: z.string().min(1).max(80),
  /** e.g. "MEDICAL FOR {destination}" — rendered beside the title. */
  subtitlePattern: z.string().max(80),
  historyIntro: z.string().max(300),
  /** Declaration text. "{declaration_organisation_name}" is substituted at render time. */
  declarationText: z.string().min(1).max(2000),
  examineeSignatureLabel: z.string().max(80),
  examinationHeading: z.string().max(80),
  examinationColumns: z.tuple([z.string().max(60), z.string().max(60)]),
  laboratoryHeading: z.string().max(80),
  laboratoryColumns: z.tuple([z.string().max(60), z.string().max(60)]),
  remarksLabel: z.string().max(40),
  authorisedSignatoryLabel: z.string().max(80),
  sections: z.array(sectionSchema),
});
export type FieldConfiguration = z.infer<typeof fieldConfigurationSchema>;

export const letterheadConfigurationSchema = z.object({
  /**
   * blank — reserve empty space for pre-printed letterhead stationery (default)
   * text  — render the organisation details configured in settings
   * image — render an approved letterhead image uploaded by an administrator
   */
  mode: z.enum(["blank", "text", "image"]).default("blank"),
  heightMm: z.number().min(20).max(70).default(40),
});
export type LetterheadConfiguration = z.infer<typeof letterheadConfigurationSchema>;

export const layoutConfigurationSchema = z.object({
  /** Where the QR code is placed. "identity" matches the reference (right of identity block). */
  qrPosition: z.enum(["identity", "footer"]).default("identity"),
  qrSizeMm: z.number().min(18).max(35).default(24),
  showPhotoBox: z.boolean().default(true),
  footerHeightMm: z.number().min(25).max(60).default(33),
  /** Footer order: seal (left), centre (contact + stamp space), signature (right). */
  signaturePosition: z.enum(["right", "left"]).default("right"),
  sealPosition: z.enum(["left", "right"]).default("left"),
  pageMarginMm: z.number().min(5).max(15).default(8),
  baseFontPt: z.number().min(7.5).max(11).default(8.6),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1f9a4b"),
});
export type LayoutConfiguration = z.infer<typeof layoutConfigurationSchema>;

export type FieldValue = string | number | null;
export type SectionValues = Record<string, FieldValue>;

export interface ReportData {
  report: SectionValues;
  examinee: SectionValues;
  history: SectionValues;
  examination: SectionValues;
  laboratory: SectionValues;
  remarks: SectionValues;
}

export const EMPTY_REPORT_DATA: ReportData = {
  report: {},
  examinee: {},
  history: {},
  examination: {},
  laboratory: {},
  remarks: {},
};

export interface ReportTemplate {
  id?: string;
  name: string;
  version: number;
  fieldConfiguration: FieldConfiguration;
  letterheadConfiguration: LetterheadConfiguration;
  layoutConfiguration: LayoutConfiguration;
}
