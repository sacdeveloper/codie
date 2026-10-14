-- =============================================================================
-- Private storage buckets and organisation-scoped object policies.
-- Paths: {organisation_id}/{report_id}/passport/{document_id}.{ext}
--        {organisation_id}/{report_id}/reports/report-v{n}.pdf
--        {organisation_id}/letterhead/{file}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('passport-documents', 'passport-documents', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('generated-reports', 'generated-reports', false, 20971520, array['application/pdf']),
  ('organisation-assets', 'organisation-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- passport-documents ------------------------------------------------------------
create policy "passport docs read (org staff)" on storage.objects for select to authenticated
  using (bucket_id = 'passport-documents'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy "passport docs upload (org staff)" on storage.objects for insert to authenticated
  with check (bucket_id = 'passport-documents'
              and (storage.foldername(name))[1] = public.current_org_id()::text
              and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy "passport docs delete (org admin, retention)" on storage.objects for delete to authenticated
  using (bucket_id = 'passport-documents'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role(array['org_admin']::public.app_role[]));

-- generated-reports -------------------------------------------------------------
create policy "reports read (org staff)" on storage.objects for select to authenticated
  using (bucket_id = 'generated-reports'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy "reports write (approvers)" on storage.objects for insert to authenticated
  with check (bucket_id = 'generated-reports'
              and (storage.foldername(name))[1] = public.current_org_id()::text
              and public.has_role(array['org_admin', 'medical_officer']::public.app_role[]));
-- No update/delete: generated PDFs are versioned, never overwritten.

-- organisation-assets -----------------------------------------------------------
create policy "assets read (org members)" on storage.objects for select to authenticated
  using (bucket_id = 'organisation-assets'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role(array['org_admin', 'medical_officer', 'reporting_staff']::public.app_role[]));
create policy "assets write (org admin)" on storage.objects for insert to authenticated
  with check (bucket_id = 'organisation-assets'
              and (storage.foldername(name))[1] = public.current_org_id()::text
              and public.has_role(array['org_admin']::public.app_role[]));
create policy "assets update (org admin)" on storage.objects for update to authenticated
  using (bucket_id = 'organisation-assets'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role(array['org_admin']::public.app_role[]));
create policy "assets delete (org admin)" on storage.objects for delete to authenticated
  using (bucket_id = 'organisation-assets'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role(array['org_admin']::public.app_role[]));
