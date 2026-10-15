-- Hardening from Supabase database advisors (security + performance).

-- Internal trigger functions are never meant to be called through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
revoke execute on function public.reports_before_write() from public, anon, authenticated;
revoke execute on function public.reports_audit_status() from public, anon, authenticated;
revoke execute on function public.report_templates_guard() from public, anon, authenticated;
revoke execute on function public.passport_documents_guard() from public, anon, authenticated;
revoke execute on function public.report_files_guard() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.audit_logs_immutable() from public, anon, authenticated;

-- RLS helper functions are needed by signed-in users only.
revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.has_role(public.app_role[]) from public, anon;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

-- Explicitly keep the intended public entry points.
grant execute on function public.verify_report(text) to anon, authenticated;
grant execute on function public.log_audit_event(text, text, uuid, uuid, jsonb) to authenticated;
