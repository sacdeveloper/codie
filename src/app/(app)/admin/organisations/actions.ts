"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizePlatform } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { runAction, UserFacingError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TEMPLATE } from "@/lib/template/default-template";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  admin_email: z.string().trim().toLowerCase().email().max(160),
  admin_name: z.string().trim().min(2).max(120),
});

/** Super administrators create organisations with the default template and a first administrator. */
export async function createOrganisationAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const s = await authorizePlatform("platform.manage_organisations");
    const p = schema.safeParse(Object.fromEntries(formData));
    if (!p.success) throw new UserFacingError("Enter the organisation name and the first administrator's name and email.");
    const { data: org, error } = await s.supabase.from("organisations").insert({ name: p.data.name, declaration_name: p.data.name }).select("id").single();
    if (error) throw error;
    const { error: tErr } = await s.supabase.from("report_templates").insert({
      organisation_id: org.id,
      name: DEFAULT_TEMPLATE.name,
      version: 1,
      field_configuration: DEFAULT_TEMPLATE.fieldConfiguration,
      letterhead_configuration: DEFAULT_TEMPLATE.letterheadConfiguration,
      layout_configuration: DEFAULT_TEMPLATE.layoutConfiguration,
      is_active: true,
      created_by: s.userId,
    });
    if (tErr) throw tErr;
    const admin = createSupabaseAdminClient();
    const { data: inv, error: iErr } = await admin.auth.admin.inviteUserByEmail(p.data.admin_email, {
      data: { full_name: p.data.admin_name },
      redirectTo: `${publicEnv.appUrl}/auth/confirm?next=/account`,
    });
    if (iErr || !inv.user) throw new UserFacingError("Organisation created, but the administrator invitation failed. Invite them from User Management.");
    await admin.from("profiles").update({ organisation_id: org.id, role: "org_admin", full_name: p.data.admin_name, is_active: true }).eq("id", inv.user.id);
    revalidatePath("/admin/organisations");
    return { id: org.id as string };
  });
}
