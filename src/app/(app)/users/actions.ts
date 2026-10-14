"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { runAction, UserFacingError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ORG_ROLES = ["org_admin", "medical_officer", "reporting_staff", "auditor"] as const;
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(160), full_name: z.string().trim().min(2).max(120), role: z.enum(ORG_ROLES) });

/**
 * Invites a user into the caller's organisation. Uses the service-role client ONLY after the
 * users.manage permission check, because new auth users are not yet visible through RLS.
 */
export async function inviteUserAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const ctx = await authorize("users.manage");
    const p = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!p.success) throw new UserFacingError("Enter a valid email address, name and role.");
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(p.data.email, {
      data: { full_name: p.data.full_name },
      redirectTo: `${publicEnv.appUrl}/auth/confirm?next=/account`,
    });
    if (error || !data.user) throw new UserFacingError("The invitation could not be sent. The address may already be registered.");
    const { data: existing } = await admin.from("profiles").select("organisation_id").eq("id", data.user.id).maybeSingle();
    if (existing?.organisation_id && existing.organisation_id !== ctx.organisation.id) {
      throw new UserFacingError("This user belongs to another organisation.");
    }
    const { error: pErr } = await admin
      .from("profiles")
      .update({ organisation_id: ctx.organisation.id, role: p.data.role, full_name: p.data.full_name, is_active: true })
      .eq("id", data.user.id);
    if (pErr) throw pErr;
    await logAudit(ctx.supabase, "user.invited", { type: "profile", id: data.user.id }, { role: p.data.role });
    revalidatePath("/users");
    return { invited: true };
  });
}

export async function updateUserAction(userId: string, patch: { role?: string; is_active?: boolean }) {
  return runAction(async () => {
    const ctx = await authorize("users.manage");
    if (!z.string().uuid().safeParse(userId).success) throw new UserFacingError("User not found.");
    const update: Record<string, unknown> = {};
    if (patch.role !== undefined) update.role = z.enum(ORG_ROLES).parse(patch.role);
    if (patch.is_active !== undefined) update.is_active = Boolean(patch.is_active);
    // Runs as the administrator: RLS + the profiles_guard trigger enforce tenant and role rules.
    const { data, error } = await ctx.supabase.from("profiles").update(update).eq("id", userId).eq("organisation_id", ctx.organisation.id).select("id");
    if (error) throw error;
    if (!data?.length) throw new UserFacingError("User not found.", "not_found", 404);
    await logAudit(ctx.supabase, update.role ? "user.role_changed" : "user.status_changed", { type: "profile", id: userId }, { role: update.role as string | undefined, status: update.is_active === undefined ? undefined : String(update.is_active) });
    revalidatePath("/users");
  });
}
