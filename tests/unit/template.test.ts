import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE } from "@/lib/template/default-template";
import { allFields, checkTemplateInvariants, parseTemplate, TemplateValidationError } from "@/lib/template/invariants";
import { emptySectionValues, validateReportData } from "@/lib/template/validation";
import { SAMPLE_REPORT_DATA } from "../fixtures/sample-report";
import type { FieldConfiguration } from "@/lib/template/types";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("default template", () => {
  it("satisfies all invariants", () => {
    expect(checkTemplateInvariants(DEFAULT_TEMPLATE.fieldConfiguration)).toEqual([]);
  });

  it("represents every field from the reference report in order", () => {
    const labels = (section: string) =>
      allFields(DEFAULT_TEMPLATE.fieldConfiguration).filter((f) => f.section === section).map((f) => f.field.label);
    expect(labels("examination")).toEqual([
      "R. EYE", "L. EYE", "R. EAR", "L. EAR", "CARDIO-VASCULAR", "B.P.", "HEART", "LUNGS", "CHEST X-RAY", "ABDOMEN",
      "HERNIA", "VARICOSE VEINS", "EXTREMITIES", "DEFORMITIES", "SKIN", "CLINICAL",
    ]);
    expect(labels("laboratory")).toEqual([
      "SUGAR", "ALBUMIN", "ROUTINE", "1. HELMINTHES", "2. GIARDIA", "3. SALMONELLA", "SHIGELLA", "V.CHOLERA (IF ENDEMIC)",
      "HEMOGLOBIN", "1. MALARIA", "2. MICRO FILARIA", "3. GROUPING & RH", "1. BLOOD SUGAR", "2. L.F.T", "3 CREATININE", "4.UREA",
      "1. HIV 1-2 TEST", "2. Hbs Ag", "3. Anti HCV", "VDRL", "TPHA (IF VDRL POSITIVE)", "PREGNANCY TEST", "LMP",
    ]);
    const groups = DEFAULT_TEMPLATE.fieldConfiguration.sections.find((s) => s.key === "examination")!.groups.map((g) => g.title);
    expect(groups).toEqual(["EYE", "EAR", "SYSTEMATIC EXAMINATION", "RESPIRATORY SYSTEM", "GASTRO INTESTINAL", "OTHERS", "VENEREAL DISEASES"]);
  });

  it("never pre-fills medical results", () => {
    const empty = emptySectionValues(DEFAULT_TEMPLATE);
    for (const section of ["history", "examination", "laboratory", "remarks"] as const) {
      expect(Object.values(empty[section]).every((v) => v === null)).toBe(true);
    }
    for (const { field } of allFields(DEFAULT_TEMPLATE.fieldConfiguration)) expect(field.defaultValue).toBeUndefined();
  });
});

describe("template invariants", () => {
  it("rejects removing a locked field", () => {
    const fc = clone(DEFAULT_TEMPLATE.fieldConfiguration) as FieldConfiguration;
    const ex = fc.sections.find((s) => s.key === "examinee")!;
    ex.groups[0].fields = ex.groups[0].fields.filter((f) => f.key !== "passport_number");
    expect(checkTemplateInvariants(fc).join()).toMatch(/passport_number.*cannot be removed/);
  });

  it("rejects making a locked field optional", () => {
    const fc = clone(DEFAULT_TEMPLATE.fieldConfiguration) as FieldConfiguration;
    fc.sections.find((s) => s.key === "examinee")!.groups[0].fields.find((f) => f.key === "full_name")!.required = false;
    expect(checkTemplateInvariants(fc).join()).toMatch(/must remain required/);
  });

  it("rejects default values on medical findings", () => {
    const fc = clone(DEFAULT_TEMPLATE.fieldConfiguration) as FieldConfiguration;
    fc.sections.find((s) => s.key === "laboratory")!.groups[0].fields[0].defaultValue = "ABSENT";
    expect(checkTemplateInvariants(fc).join()).toMatch(/must not have a default/);
  });

  it("rejects conditions referencing unknown fields and invalid patterns", () => {
    const fc = clone(DEFAULT_TEMPLATE.fieldConfiguration) as FieldConfiguration;
    const f = fc.sections.find((s) => s.key === "laboratory")!.groups[0].fields[0];
    f.visibleWhen = { field: "examinee.nope", equals: ["X"] };
    f.pattern = "([";
    const issues = checkTemplateInvariants(fc).join();
    expect(issues).toMatch(/unknown field/);
    expect(issues).toMatch(/invalid validation pattern/);
  });

  it("parseTemplate throws a TemplateValidationError for malformed JSON", () => {
    expect(() => parseTemplate({ name: "x", version: 2, fieldConfiguration: { sections: "nope" }, letterheadConfiguration: {}, layoutConfiguration: {} })).toThrow(TemplateValidationError);
  });
});

describe("validateReportData", () => {
  it("accepts the complete sample data", () => {
    const r = validateReportData(DEFAULT_TEMPLATE, SAMPLE_REPORT_DATA, "complete", { reportDate: "2026-07-28" });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("allows incomplete drafts but blocks completion with every missing required field", () => {
    const draft = validateReportData(DEFAULT_TEMPLATE, { examinee: { full_name: "A" } }, "draft");
    expect(draft.ok).toBe(true);
    const complete = validateReportData(DEFAULT_TEMPLATE, { examinee: { full_name: "A" } }, "complete");
    expect(complete.ok).toBe(false);
    expect(complete.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["examinee.passport_number", "examination.right_eye", "laboratory.hiv", "report.destination"]));
    // Missing values stay empty — nothing is fabricated.
    expect(complete.data.laboratory.hiv).toBeNull();
    expect(complete.data.examination.right_eye).toBeNull();
  });

  it("validates numbers, ranges, dates, patterns and dropdown options", () => {
    const r = validateReportData(
      DEFAULT_TEMPLATE,
      {
        examinee: { height_cm: "abc", weight_kg: "900", date_of_birth: "2000-02-30", sex: "UNKNOWN", passport_number: "T@1" },
        examination: { blood_pressure: "high" },
      },
      "draft",
    );
    const paths = r.errors.map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(["examinee.height_cm", "examinee.weight_kg", "examinee.date_of_birth", "examinee.sex", "examinee.passport_number", "examination.blood_pressure"]),
    );
  });

  it("requires TPHA only when VDRL is positive", () => {
    const base = structuredClone(SAMPLE_REPORT_DATA);
    base.laboratory.tpha = null;
    expect(validateReportData(DEFAULT_TEMPLATE, base, "complete", { reportDate: "2026-07-28" }).ok).toBe(true);
    base.laboratory.vdrl = "POSITIVE";
    const r = validateReportData(DEFAULT_TEMPLATE, base, "complete", { reportDate: "2026-07-28" });
    expect(r.errors.map((e) => e.path)).toContain("laboratory.tpha");
  });

  it("shows and requires the pregnancy test only for female examinees", () => {
    const male = structuredClone(SAMPLE_REPORT_DATA);
    male.laboratory.pregnancy_test = "NEGATIVE";
    expect(validateReportData(DEFAULT_TEMPLATE, male, "complete", { reportDate: "2026-07-28" }).data.laboratory.pregnancy_test).toBeNull();
    const female = structuredClone(SAMPLE_REPORT_DATA);
    female.examinee.sex = "FEMALE";
    const r = validateReportData(DEFAULT_TEMPLATE, female, "complete", { reportDate: "2026-07-28" });
    expect(r.errors.map((e) => e.path)).toContain("laboratory.pregnancy_test");
  });

  it("runs identity cross-checks", () => {
    const d = structuredClone(SAMPLE_REPORT_DATA);
    d.examinee.date_of_issue = "2030-01-01";
    d.examinee.date_of_expiry = "2026-01-01";
    const r = validateReportData(DEFAULT_TEMPLATE, d, "draft", { reportDate: "2026-07-28" });
    expect(r.errors.map((e) => e.path)).toContain("examinee.date_of_issue");
    expect(r.errors.map((e) => e.path)).toContain("examinee.date_of_expiry");
  });

  it("drops unknown keys", () => {
    const r = validateReportData(DEFAULT_TEMPLATE, { examination: { injected: "x" } } as never, "draft");
    expect(r.data.examination).not.toHaveProperty("injected");
  });
});
