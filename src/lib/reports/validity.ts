import { z } from "zod";

/**
 * Validity rule used to calculate "Valid upto" from the exam date.
 * Reference report: exam 28/07/2026 -> valid upto 27/07/2027, i.e. 1 year minus one day.
 */
export const validityRuleSchema = z.object({
  amount: z.number().int().min(1).max(36),
  unit: z.enum(["days", "months", "years"]),
  subtractOneDay: z.boolean(),
});
export type ValidityRule = z.infer<typeof validityRuleSchema>;

export const DEFAULT_VALIDITY_RULE: ValidityRule = { amount: 1, unit: "years", subtractOneDay: true };

export function computeValidUntil(reportDate: string, rule: ValidityRule = DEFAULT_VALIDITY_RULE): string {
  const [y, m, d] = reportDate.split("-").map(Number);
  let date: Date;
  if (rule.unit === "days") {
    date = new Date(Date.UTC(y, m - 1, d + rule.amount));
  } else {
    const months = rule.unit === "years" ? rule.amount * 12 : rule.amount;
    const targetMonth = m - 1 + months;
    // Clamp to the end of the month (e.g. 31 Jan + 1 month -> 28/29 Feb).
    const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
    date = new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
  }
  if (rule.subtractOneDay) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function describeValidityRule(rule: ValidityRule): string {
  const unit = rule.amount === 1 ? rule.unit.replace(/s$/, "") : rule.unit;
  return `${rule.amount} ${unit} from the exam date${rule.subtractOneDay ? ", minus one day" : ""}`;
}
