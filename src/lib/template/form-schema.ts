import { z } from "zod";
import type { ReportTemplate } from "./types";
import { validateReportData, type ValidationMode } from "./validation";

const value = z.union([z.string(), z.number(), z.null()]).optional();
const section = z.record(z.string(), value);

/**
 * Zod schema for React Hook Form, derived from the report template. All template rules
 * (types, ranges, patterns, required/conditional fields) come from validateReportData, so the
 * browser and the server apply exactly the same validation.
 */
export function buildReportFormSchema(template: ReportTemplate, mode: ValidationMode, reportDate?: string) {
  return z
    .object({ report: section, examinee: section, history: section, examination: section, laboratory: section, remarks: section })
    .superRefine((data, ctx) => {
      const r = validateReportData(template, data as never, mode, { reportDate });
      for (const e of r.errors) {
        const [s, k] = e.path.split(".");
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [s, k], message: e.message });
      }
    });
}

export type ReportFormValues = Record<"report" | "examinee" | "history" | "examination" | "laboratory" | "remarks", Record<string, string | number | null | undefined>>;
