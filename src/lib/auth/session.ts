import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";
import type { OrganisationRow, ProfileRow } from "@/lib/supabase/types";
import { parseOrganisationSettings, type OrganisationSettings } from "@/lib/organisation/settings";
import { AuthorizationError } from "@/lib/errors";
import { can, type Permission } from "./roles";

export interface SessionContext {
  supabase: SupabaseServerClient;
  userId: string;
  email: string | null;
  profile: ProfileRow;
  organisation: OrganisationRow | null;
  settings: OrganisationSettings;
}

/** Loads the signed-in user, their active profile and organisation (once per request). */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>();
  if (!profile) return null;
  let organisation: OrganisationRow | null = null;
  if (profile.organisation_id) {
    const { data } = await supabase.from("organisations").select("*").eq("id", profile.organisation_id).maybeSingle<OrganisationRow>();
    organisation = data;
  }
  return { supabase, userId: user.id, email: user.email ?? null, profile, organisation, settings: parseOrganisationSettings(organisation?.settings) };
});

/** For pages: redirects to login / inactive-account page as needed. */
export async function requireSession(permission?: Permission): Promise<SessionContext> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.profile.is_active) redirect("/login?inactive=1");
  if (s.profile.role !== "super_admin" && !s.organisation) redirect("/login?inactive=1");
  if (permission && !can(s.profile.role, permission)) redirect("/dashboard?denied=1");
  return s;
}

/** For server actions / API routes: throws instead of redirecting. */
export async function authorize(permission: Permission): Promise<SessionContext & { organisation: OrganisationRow }> {
  const s = await getSession();
  if (!s || !s.profile.is_active) throw new AuthorizationError("Please sign in again.");
  if (!can(s.profile.role, permission)) throw new AuthorizationError();
  if (!s.organisation) throw new AuthorizationError("Your account is not attached to an organisation.");
  return s as SessionContext & { organisation: OrganisationRow };
}

export async function authorizePlatform(permission: Permission): Promise<SessionContext> {
  const s = await getSession();
  if (!s || !s.profile.is_active || !can(s.profile.role, permission)) throw new AuthorizationError();
  return s;
}
