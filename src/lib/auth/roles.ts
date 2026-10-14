export const ROLES = ["super_admin", "org_admin", "medical_officer", "reporting_staff", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  org_admin: "Organisation Administrator",
  medical_officer: "Medical Officer",
  reporting_staff: "Reporting Staff",
  auditor: "Read-only Auditor",
};

export const PERMISSIONS = [
  "platform.manage_organisations",
  "organisation.manage",
  "users.manage",
  "templates.manage",
  "reports.view_metadata",
  "reports.view_medical",
  "reports.create",
  "reports.edit_draft",
  "reports.submit",
  "reports.approve_issue",
  "reports.revise",
  "reports.revoke",
  "reports.archive",
  "reports.download",
  "passports.upload",
  "passports.view",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Explicit role -> permission matrix. Mirrored by RLS policies in the database
 * (supabase/migrations), which remain the final enforcement layer.
 *
 * Super administrators manage the platform and organisations but, by design (data minimisation),
 * are not given access to medical content or passport copies.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  super_admin: ["platform.manage_organisations", "organisation.manage", "users.manage", "templates.manage", "audit.view"],
  org_admin: [
    "organisation.manage",
    "users.manage",
    "templates.manage",
    "reports.view_metadata",
    "reports.view_medical",
    "reports.create",
    "reports.edit_draft",
    "reports.submit",
    "reports.approve_issue",
    "reports.revise",
    "reports.revoke",
    "reports.archive",
    "reports.download",
    "passports.upload",
    "passports.view",
    "audit.view",
  ],
  medical_officer: [
    "reports.view_metadata",
    "reports.view_medical",
    "reports.create",
    "reports.edit_draft",
    "reports.submit",
    "reports.approve_issue",
    "reports.revise",
    "reports.revoke",
    "reports.download",
    "passports.upload",
    "passports.view",
  ],
  reporting_staff: [
    "reports.view_metadata",
    "reports.view_medical",
    "reports.create",
    "reports.edit_draft",
    "reports.submit",
    "reports.download",
    "passports.upload",
    "passports.view",
  ],
  auditor: ["reports.view_metadata", "audit.view"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}
