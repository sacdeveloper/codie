import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { RegistryRow, ReportStatus } from "@/lib/supabase/types";
import { normalisePassportNumber } from "@/lib/format";

export const PAGE_SIZE = 20;
const STATUSES: ReportStatus[] = ["draft", "pending_review", "completed", "revoked", "superseded"];

export interface ListParams {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  archived?: boolean;
}

/** Escapes characters that are meaningful inside PostgREST filter strings and LIKE patterns. */
function likeTerm(s: string) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()*:"]/g, " ").trim();
}

/** Server-side search over the metadata-only registry view (RLS + org filter apply). */
export async function listReports(supabase: SupabaseServerClient, p: ListParams) {
  const page = Math.max(1, Math.min(p.page ?? 1, 10_000));
  let q = supabase.from("report_registry").select("*", { count: "exact" });
  if (p.archived) q = q.not("archived_at", "is", null);
  else q = q.is("archived_at", null);
  if (p.status && STATUSES.includes(p.status as ReportStatus)) q = q.eq("status", p.status);
  if (p.from && /^\d{4}-\d{2}-\d{2}$/.test(p.from)) q = q.gte("report_date", p.from);
  if (p.to && /^\d{4}-\d{2}-\d{2}$/.test(p.to)) q = q.lte("report_date", p.to);
  const term = p.q ? likeTerm(p.q.slice(0, 80)) : "";
  if (term) {
    const pass = normalisePassportNumber(term);
    const ors = [`serial_number.ilike.*${term}*`, `examinee_full_name.ilike.*${term}*`, `position_applied_for.ilike.*${term}*`];
    if (pass.length >= 4) ors.push(`passport_search.eq.${pass}`);
    q = q.or(ors.join(","));
  }
  const { data, count, error } = await q.order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as RegistryRow[], total: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function dashboardStats(supabase: SupabaseServerClient, today: string) {
  const countWhere = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count } = await build(base());
    return count ?? 0;
  };
  const base = () => supabase.from("report_registry").select("id", { count: "exact", head: true }).is("archived_at", null);
  const [total, todayCount, drafts, pending, completed] = await Promise.all([
    countWhere((q) => q),
    countWhere((q) => q.gte("created_at", `${today}T00:00:00`)),
    countWhere((q) => q.eq("status", "draft")),
    countWhere((q) => q.eq("status", "pending_review")),
    countWhere((q) => q.eq("status", "completed")),
  ]);
  return { total, todayCount, drafts, pending, completed };
}
