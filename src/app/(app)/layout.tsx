import { FileText, FilePlus2, LayoutDashboard, ScanLine, QrCode, Building2, Users, ScrollText, UserCog, LayoutTemplate, Globe, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { can, ROLE_LABELS, type Permission } from "@/lib/auth/roles";
import { NavLink } from "@/components/layout/nav-link";
import { signOut } from "../(auth)/login/actions";

const NAV: Array<{ href: string; label: string; icon: React.ComponentType; permission?: Permission; exact?: boolean }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "reports.view_metadata" },
  { href: "/reports/new", label: "Create Report", icon: FilePlus2, permission: "reports.create", exact: true },
  { href: "/reports", label: "All Reports", icon: FileText, permission: "reports.view_metadata" },
  { href: "/passports", label: "Passport Uploads", icon: ScanLine, permission: "passports.view" },
  { href: "/verification", label: "Report Verification", icon: QrCode },
  { href: "/settings/organisation", label: "Organisation Settings", icon: Building2, permission: "organisation.manage" },
  { href: "/settings/templates", label: "Report Templates", icon: LayoutTemplate, permission: "templates.manage" },
  { href: "/users", label: "User Management", icon: Users, permission: "users.manage" },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, permission: "audit.view" },
  { href: "/admin/organisations", label: "Organisations", icon: Globe, permission: "platform.manage_organisations" },
  { href: "/account", label: "Account Settings", icon: UserCog },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const role = s.profile.role;
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">MR</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{s.organisation?.name ?? "Platform administration"}</p>
            <p className="text-xs text-slate-500">Medical Reporting</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
          {NAV.filter((n) => !n.permission || can(role, n.permission)).map(({ href, label, icon: Icon, exact }) => (
            <NavLink key={href} href={href} exact={exact}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="px-3 pb-2">
            <p className="truncate text-sm font-medium">{s.profile.full_name || s.email}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
          </div>
          <form action={signOut}>
            <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <span className="font-semibold">Medical Reporting</span>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border px-3 py-1 text-sm">Menu</summary>
            <nav className="absolute right-0 z-20 mt-2 w-60 space-y-0.5 rounded-md border bg-white p-2 shadow-lg">
              {NAV.filter((n) => !n.permission || can(role, n.permission)).map(({ href, label, icon: Icon, exact }) => (
                <NavLink key={href} href={href} exact={exact}>
                  <Icon />
                  {label}
                </NavLink>
              ))}
            </nav>
          </details>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
