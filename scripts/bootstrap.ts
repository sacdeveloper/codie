/**
 * One-time bootstrap for a new deployment (run with the service-role key, never in the browser):
 *   npx tsx scripts/bootstrap.ts --org "People Medical Centre" --admin-email admin@example.com \
 *        --admin-name "Admin Name" [--admin-password '…'] [--super-admin-email ops@example.com]
 *
 * Creates the organisation, activates the default template (transcribed from the reference report)
 * and creates or invites the first organisation administrator.
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_TEMPLATE } from "../src/lib/template/default-template";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const orgName = arg("org");
const adminEmail = arg("admin-email");
const adminName = arg("admin-name") ?? "Organisation Administrator";
const adminPassword = arg("admin-password");
const superEmail = arg("super-admin-email");
if (!orgName || !adminEmail) throw new Error("Usage: --org <name> --admin-email <email> [--admin-name] [--admin-password] [--super-admin-email]");

const sb = createClient(url, key, { auth: { persistSession: false } });

async function ensureUser(email: string, fullName: string, password?: string) {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;
  if (password) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) throw error;
    return data.user.id;
  }
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: `${appUrl}/auth/confirm?next=/account` });
  if (error) throw error;
  return data.user.id;
}

const { data: org, error: orgErr } = await sb.from("organisations").insert({ name: orgName, declaration_name: orgName }).select("id").single();
if (orgErr) throw orgErr;
const { error: tErr } = await sb.from("report_templates").insert({
  organisation_id: org.id,
  name: DEFAULT_TEMPLATE.name,
  version: 1,
  field_configuration: DEFAULT_TEMPLATE.fieldConfiguration,
  letterhead_configuration: DEFAULT_TEMPLATE.letterheadConfiguration,
  layout_configuration: DEFAULT_TEMPLATE.layoutConfiguration,
  is_active: true,
});
if (tErr) throw tErr;

const adminId = await ensureUser(adminEmail, adminName, adminPassword);
const { error: pErr } = await sb.from("profiles").update({ organisation_id: org.id, role: "org_admin", full_name: adminName, is_active: true }).eq("id", adminId);
if (pErr) throw pErr;
console.log(`Organisation ${org.id} created; administrator ${adminEmail} ${adminPassword ? "created" : "invited"}.`);

if (superEmail) {
  const superId = await ensureUser(superEmail, "Platform Administrator", arg("super-admin-password"));
  await sb.from("profiles").update({ role: "super_admin", organisation_id: null, is_active: true }).eq("id", superId);
  console.log(`Super administrator ${superEmail} configured.`);
}
