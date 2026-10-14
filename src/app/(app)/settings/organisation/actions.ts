"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { runAction, UserFacingError } from "@/lib/errors";
import { organisationSettingsSchema } from "@/lib/organisation/settings";
import { validateUpload } from "@/lib/security/file-validation";
import { BUCKETS, paths, uploadPrivate } from "@/lib/storage";

const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const orgSchema = z.object({
  name: z.string().trim().min(2).max(160),
  declaration_name: opt(160),
  registration_number: opt(80),
  address: opt(400),
  phone: opt(80),
  email: z.union([z.literal(""), z.string().trim().email().max(160)]).transform((v) => v || null),
  website: opt(160),
  accreditation_details: opt(200),
  footer_lines: z.string().max(800).transform((v) => v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)).pipe(z.array(z.string().max(120)).max(4)),
});

export async function updateOrganisationAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const ctx = await authorize("organisation.manage");
    const f = Object.fromEntries(formData);
    const org = orgSchema.safeParse(f);
    if (!org.success) throw new UserFacingError(`Check the organisation details: ${org.error.issues.map((i) => i.path.join(".")).join(", ")}.`);
    const settings = organisationSettingsSchema.safeParse({
      serial_prefix: String(f.serial_prefix ?? "").trim().toUpperCase(),
      serial_reset: f.serial_reset,
      serial_padding: Number(f.serial_padding ?? 0),
      validity_rule: { amount: Number(f.validity_amount), unit: f.validity_unit, subtractOneDay: f.validity_minus_day === "on" },
      timezone: String(f.timezone ?? "UTC"),
      signature_images_enabled: f.signature_images_enabled === "on",
      verification_expires_after_validity: f.verification_expires_after_validity === "on",
      require_independent_review: f.require_independent_review === "on",
      passport_retention_days: f.passport_retention_days ? Number(f.passport_retention_days) : null,
    });
    if (!settings.success) throw new UserFacingError(`Check the settings: ${settings.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", ")}.`);
    try {
      new Intl.DateTimeFormat("en", { timeZone: settings.data.timezone });
    } catch {
      throw new UserFacingError("Unknown time zone. Use an IANA name such as Asia/Kolkata.");
    }
    const { error } = await ctx.supabase.from("organisations").update({ ...org.data, settings: settings.data }).eq("id", ctx.organisation.id);
    if (error) throw error;
    await logAudit(ctx.supabase, "organisation.updated", { type: "organisation", id: ctx.organisation.id }, { changed_fields: Object.keys(org.data).concat("settings") });
    revalidatePath("/settings/organisation");
    return { saved: true };
  });
}

const ASSET_COLUMNS = { logo: "logo_path", letterhead: "letterhead_path", signature: "signature_image_path", seal: "seal_image_path" } as const;

export async function uploadAssetAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const ctx = await authorize("organisation.manage");
    const kind = String(formData.get("kind")) as keyof typeof ASSET_COLUMNS;
    if (!(kind in ASSET_COLUMNS)) throw new UserFacingError("Unknown asset type.");
    if ((kind === "signature" || kind === "seal") && !ctx.settings.signature_images_enabled) {
      throw new UserFacingError("Enable approved signature/seal images in the settings first.");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose an image.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUpload({ name: file.name, size: file.size, type: file.type }, bytes.subarray(0, 32), { maxBytes: 5 * 1024 * 1024, allowed: ["image/png", "image/jpeg", "image/webp"] });
    if (!check.ok) throw new UserFacingError(check.error);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const path = paths.asset(ctx.organisation.id, kind, hash, check.extension);
    await uploadPrivate(ctx.supabase, BUCKETS.assets, path, bytes, check.mimeType);
    const { error } = await ctx.supabase.from("organisations").update({ [ASSET_COLUMNS[kind]]: path }).eq("id", ctx.organisation.id);
    if (error) throw error;
    await logAudit(ctx.supabase, "organisation.asset_uploaded", { type: "organisation", id: ctx.organisation.id }, { file_type: kind, content_hash: hash });
    revalidatePath("/settings/organisation");
    return { saved: true };
  });
}

export async function removeAssetAction(kind: string) {
  return runAction(async () => {
    const ctx = await authorize("organisation.manage");
    if (!(kind in ASSET_COLUMNS)) throw new UserFacingError("Unknown asset type.");
    // The object is kept (issued reports may reference it in their snapshot); only the link is removed.
    const { error } = await ctx.supabase.from("organisations").update({ [ASSET_COLUMNS[kind as keyof typeof ASSET_COLUMNS]]: null }).eq("id", ctx.organisation.id);
    if (error) throw error;
    await logAudit(ctx.supabase, "organisation.asset_removed", { type: "organisation", id: ctx.organisation.id }, { file_type: kind });
    revalidatePath("/settings/organisation");
  });
}
