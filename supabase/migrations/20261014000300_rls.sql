-- =============================================================================
-- Row Level Security — organisation-level tenant isolation and role checks.
-- The application performs the same checks server-side (src/lib/auth); RLS is the final guard.
-- =============================================================================

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.report_templates enable row level security;
alter table public.report_serial_counters enable row level security;
alter table public.reports enable row level security;
alter table public.passport_documents enable row level security;
alter table public.report_files enable row level security;
alter table public.audit_logs enable row level security;
alter table public.verification_stats enable row level security;

-- Anonymous users get nothing from tables; public verification goes through verify_report().
revoke all on all tables in schema public from anon;

-- organisations ---------------------------------------------------------------
create policy organisations_select on public.organisations for select to authenticated
  using (id = public.current_org_id() or public.has_role(array['super_admin']::public.app_role[]));
create policy organisations_update on public.organisations for update to authenticated
  using ((id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]))
  with check ((id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]));
create policy organisations_insert on public.organisations for insert to authenticated
  with check (public.has_role(array['super_admin']::public.app_role[]));

-- profiles --------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid()
         or (organisation_id = public.current_org_id())
         or public.has_role(array['super_admin']::public.app_role[]));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()
         or (organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]))
  with check (id = auth.uid()
         or (organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]));

-- report_templates ------------------------------------------------------------
create policy report_templates_select on public.report_templates for select to authenticated
  using (organisation_id = public.current_org_id() or public.has_role(array['super_admin']::public.app_role[]));
create policy report_templates_insert on public.report_templates for insert to authenticated
  with check ((organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
              or public.has_role(array['super_admin']::public.app_role[]));
create policy report_templates_update on public.report_templates for update to authenticated
  using ((organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]))
  with check ((organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]));

-- reports ---------------------------------------------------------------------
-- Full rows (including medical content) are visible only to clinical/reporting roles.
-- Auditors use the metadata-only report_registry view below.
create policy reports_select on public.reports for select to authenticated
  using (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy reports_insert on public.reports for insert to authenticated
  with check (organisation_id = public.current_org_id()
              and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy reports_update on public.reports for update to authenticated
  using (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]))
  with check (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
-- No delete policy: reports are archived, never deleted by users.

-- passport_documents ----------------------------------------------------------
create policy passport_documents_select on public.passport_documents for select to authenticated
  using (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy passport_documents_insert on public.passport_documents for insert to authenticated
  with check (organisation_id = public.current_org_id()
              and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy passport_documents_update on public.passport_documents for update to authenticated
  using (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]))
  with check (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));

-- report_files ----------------------------------------------------------------
create policy report_files_select on public.report_files for select to authenticated
  using (organisation_id = public.current_org_id()
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy report_files_insert on public.report_files for insert to authenticated
  with check (organisation_id = public.current_org_id()
              and public.has_role(array['org_admin', 'medical_officer']::public.app_role[]));

-- audit_logs ------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((organisation_id = public.current_org_id() and public.has_role(array['org_admin', 'auditor']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]));
-- Inserts only through log_audit_event() / triggers (SECURITY DEFINER).

-- verification_stats ----------------------------------------------------------
create policy verification_stats_select on public.verification_stats for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and r.organisation_id = public.current_org_id()));

-- report_serial_counters: no policies (only next_report_serial() touches it).

-- -----------------------------------------------------------------------------
-- Metadata-only registry used by listings, dashboards and auditors.
-- Runs with the owner's rights, so it filters by the caller's organisation explicitly.
-- Passport numbers are masked; the searchable normalised value is exposed only to staff roles.
-- -----------------------------------------------------------------------------
create view public.report_registry with (security_barrier = true) as
select
  r.id,
  r.organisation_id,
  r.serial_number,
  r.revision_number,
  r.report_date,
  r.valid_until,
  r.status,
  r.verification_status,
  r.examinee_full_name,
  case when r.passport_number_normalized is null then null
       else repeat('•', greatest(char_length(r.passport_number_normalized) - 3, 0)) || right(r.passport_number_normalized, 3) end as passport_masked,
  case when public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[])
       then r.passport_number_normalized end as passport_search,
  r.position_applied_for,
  r.created_by,
  p.full_name as created_by_name,
  r.created_at,
  r.updated_at,
  r.completed_at,
  r.revoked_at,
  r.archived_at,
  r.revision_of,
  r.superseded_by
from public.reports r
left join public.profiles p on p.id = r.created_by
where r.organisation_id = public.current_org_id()
  and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff', 'auditor']::public.app_role[]);

revoke all on public.report_registry from anon;
grant select on public.report_registry to authenticated;

grant select, insert, update on public.organisations, public.profiles, public.report_templates, public.reports, public.passport_documents to authenticated;
grant select, insert on public.report_files to authenticated;
grant select on public.audit_logs, public.verification_stats to authenticated;
