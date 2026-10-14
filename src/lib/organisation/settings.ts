import { z } from "zod";
import { DEFAULT_VALIDITY_RULE, validityRuleSchema } from "@/lib/reports/validity";

export const organisationSettingsSchema = z.object({
  serial_prefix: z.string().regex(/^[A-Z0-9]{1,6}$/, "1–6 capital letters or digits").default("R"),
  serial_reset: z.enum(["never", "yearly"]).default("never"),
  serial_padding: z.number().int().min(0).max(8).default(0),
  validity_rule: validityRuleSchema.default(DEFAULT_VALIDITY_RULE),
  timezone: z.string().min(1).max(60).default("UTC"),
  /** Approved signature/seal images may be applied only when explicitly enabled. */
  signature_images_enabled: z.boolean().default(false),
  verification_expires_after_validity: z.boolean().default(true),
  /** When true, reports must be submitted for review and issued by a different person. */
  require_independent_review: z.boolean().default(false),
  passport_retention_days: z.number().int().min(30).max(36500).nullable().default(null),
});
export type OrganisationSettings = z.infer<typeof organisationSettingsSchema>;

export function parseOrganisationSettings(raw: unknown): OrganisationSettings {
  const parsed = organisationSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : organisationSettingsSchema.parse({});
}

/** Today's date (yyyy-mm-dd) in the organisation's time zone. */
export function todayInTimezone(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
