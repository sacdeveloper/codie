-- Hardening from Supabase database advisors (security + performance).

-- Evaluate auth.uid() once per statement instead of once per row.
alter policy profiles_select on public.profiles
  using (id = (select auth.uid())
         or (organisation_id = public.current_org_id())
         or public.has_role(array['super_admin']::public.app_role[]));
alter policy profiles_update on public.profiles
  using (id = (select auth.uid())
         or (organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]))
  with check (id = (select auth.uid())
         or (organisation_id = public.current_org_id() and public.has_role(array['org_admin']::public.app_role[]))
         or public.has_role(array['super_admin']::public.app_role[]));
