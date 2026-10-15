-- Hardening from Supabase database advisors (security + performance).

-- Covering indexes for foreign keys.
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists passport_documents_reviewed_by_idx on public.passport_documents (reviewed_by);
create index if not exists passport_documents_uploaded_by_idx on public.passport_documents (uploaded_by);
create index if not exists report_files_generated_by_idx on public.report_files (generated_by);
create index if not exists report_files_organisation_idx on public.report_files (organisation_id);
create index if not exists report_templates_created_by_idx on public.report_templates (created_by);
create index if not exists reports_approved_by_idx on public.reports (approved_by);
create index if not exists reports_created_by_idx on public.reports (created_by);
create index if not exists reports_identity_confirmed_by_idx on public.reports (identity_confirmed_by);
create index if not exists reports_submitted_by_idx on public.reports (submitted_by);
create index if not exists reports_superseded_by_idx on public.reports (superseded_by);
create index if not exists reports_template_idx on public.reports (template_id);
create index if not exists reports_updated_by_idx on public.reports (updated_by);
