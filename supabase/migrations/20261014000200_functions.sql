-- =============================================================================
-- Helper functions, triggers, serial numbers, audit and public verification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so RLS policies can read profiles without recursion)
-- -----------------------------------------------------------------------------
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organisation_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.has_role(roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organisations_touch before update on public.organisations for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger report_templates_touch before update on public.report_templates for each row execute function public.touch_updated_at();
create trigger passport_documents_touch before update on public.passport_documents for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- New auth user -> inactive profile. Organisation and role are assigned by an administrator.
-- user_metadata is user-controlled, so it is never trusted for role/organisation.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role, organisation_id, is_active)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), 'reporting_staff', null, false)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Profile guard: users may edit their own name; only administrators change role/org/active.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.app_role := public.current_app_role();
  actor_org uuid := public.current_org_id();
begin
  if auth.uid() is null then
    return new; -- service role / migrations
  end if;
  if new.id <> old.id or new.email is distinct from old.email then
    raise exception 'profile identity cannot be changed' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.organisation_id is distinct from old.organisation_id or new.is_active is distinct from old.is_active then
    if actor_role = 'super_admin' then
      return new;
    end if;
    if actor_role <> 'org_admin' or old.organisation_id is distinct from actor_org or new.organisation_id is distinct from actor_org then
      raise exception 'not permitted to change role, organisation or status' using errcode = '42501';
    end if;
    if new.role = 'super_admin' then
      raise exception 'organisation administrators cannot grant super administrator' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'administrators cannot change their own role or status' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- -----------------------------------------------------------------------------
-- Serial numbers: concurrency-safe per organisation (row lock via ON CONFLICT DO UPDATE).
-- Default format matches the reference ("R-7"); prefix, padding and yearly reset are configurable.
-- -----------------------------------------------------------------------------
create or replace function public.next_report_serial(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_settings jsonb;
  v_prefix text;
  v_reset text;
  v_padding int;
  v_period text;
  v_next int;
  v_seq text;
begin
  select settings into v_settings from public.organisations where id = p_org;
  if not found then
    raise exception 'organisation not found';
  end if;
  v_prefix := coalesce(nullif(v_settings ->> 'serial_prefix', ''), 'R');
  v_reset := coalesce(v_settings ->> 'serial_reset', 'never');
  v_padding := least(greatest(coalesce((v_settings ->> 'serial_padding')::int, 0), 0), 10);
  v_period := case when v_reset = 'yearly' then to_char(now() at time zone 'utc', 'YYYY') else 'all' end;

  insert into public.report_serial_counters as c (organisation_id, period, last_value)
  values (p_org, v_period, 1)
  on conflict (organisation_id, period) do update set last_value = c.last_value + 1
  returning last_value into v_next;

  v_seq := case when v_padding > 0 then lpad(v_next::text, v_padding, '0') else v_next::text end;
  return case when v_reset = 'yearly' then v_prefix || '-' || v_period || '-' || v_seq else v_prefix || '-' || v_seq end;
end $$;

revoke all on function public.next_report_serial(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reports: derive search columns, assign serials, enforce workflow + immutability.
-- -----------------------------------------------------------------------------
create or replace function public.reports_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  is_approver boolean := actor is null or actor_role in ('org_admin', 'medical_officer');
  parent public.reports;
begin
  -- Search columns always derived from the JSON source of truth.
  new.examinee_full_name := nullif(btrim(new.examinee_details ->> 'full_name'), '');
  new.passport_number := nullif(btrim(new.examinee_details ->> 'passport_number'), '');
  new.passport_number_normalized := nullif(upper(regexp_replace(coalesce(new.examinee_details ->> 'passport_number', ''), '[^A-Za-z0-9]', '', 'g')), '');
  new.position_applied_for := nullif(btrim(new.examinee_details ->> 'position_applied_for'), '');
  new.nationality := nullif(btrim(new.examinee_details ->> 'nationality'), '');
  new.updated_at := now();
  if actor is not null then
    new.updated_by := actor;
  end if;

  if tg_op = 'INSERT' then
    if actor is not null then
      new.created_by := actor;
    end if;
    if new.status <> 'draft' then
      raise exception 'reports must be created as drafts' using errcode = '42501';
    end if;
    new.verification_status := 'not_issued';
    new.verification_token_hash := null;
    new.issued_snapshot := null;
    new.completed_at := null;
    new.revoked_at := null;
    new.superseded_by := null;

    if new.revision_of is null then
      new.revision_number := 1;
      new.serial_number := public.next_report_serial(new.organisation_id);
    else
      select * into parent from public.reports where id = new.revision_of for update;
      if not found or parent.organisation_id <> new.organisation_id then
        raise exception 'original report not found' using errcode = '42501';
      end if;
      if parent.status <> 'completed' then
        raise exception 'only completed reports can be revised' using errcode = '42501';
      end if;
      if not is_approver then
        raise exception 'not permitted to revise reports' using errcode = '42501';
      end if;
      if exists (select 1 from public.reports r where r.revision_of = parent.id and r.status in ('draft', 'pending_review')) then
        raise exception 'a revision of this report is already in progress' using errcode = '23505';
      end if;
      new.serial_number := parent.serial_number;
      new.revision_number := (select max(r.revision_number) + 1 from public.reports r where r.organisation_id = parent.organisation_id and r.serial_number = parent.serial_number);
    end if;
    return new;
  end if;

  -- UPDATE
  if new.organisation_id <> old.organisation_id or new.id <> old.id or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at or new.serial_number <> old.serial_number or new.revision_number <> old.revision_number
     or new.revision_of is distinct from old.revision_of then
    raise exception 'report identity fields cannot be changed' using errcode = '42501';
  end if;

  if old.status in ('completed', 'revoked', 'superseded') then
    -- Issued documents are immutable: corrections go through a new revision.
    if new.report_date <> old.report_date or new.valid_until is distinct from old.valid_until
       or new.report_details <> old.report_details or new.examinee_details <> old.examinee_details
       or new.medical_history <> old.medical_history or new.medical_examination <> old.medical_examination
       or new.laboratory_results <> old.laboratory_results or new.remarks is distinct from old.remarks
       or new.photo_path is distinct from old.photo_path or new.template_id is distinct from old.template_id
       or new.identity_source is distinct from old.identity_source or new.identity_confirmed_at is distinct from old.identity_confirmed_at
       or new.template_version <> old.template_version or new.issued_snapshot is distinct from old.issued_snapshot
       or new.verification_token_hash is distinct from old.verification_token_hash
       or new.verification_nonce is distinct from old.verification_nonce
       or new.completed_at is distinct from old.completed_at or new.approved_by is distinct from old.approved_by then
      raise exception 'issued reports cannot be modified; create a revision instead' using errcode = '42501';
    end if;
  end if;

  if new.status <> old.status then
    if old.status = 'draft' and new.status = 'pending_review' then
      new.submitted_at := now();
      new.submitted_by := actor;
    elsif old.status = 'pending_review' and new.status = 'draft' then
      null; -- returned for changes
    elsif old.status in ('draft', 'pending_review') and new.status = 'completed' then
      if not is_approver then
        raise exception 'only a medical officer or organisation administrator can issue reports' using errcode = '42501';
      end if;
      if new.verification_token_hash is null or new.issued_snapshot is null then
        raise exception 'issued reports require a verification token and snapshot';
      end if;
      new.completed_at := now();
      new.approved_by := actor;
      new.verification_status := 'valid';
      new.issuing_started_at := null;
    elsif old.status = 'completed' and new.status = 'revoked' then
      if not is_approver then
        raise exception 'not permitted to revoke reports' using errcode = '42501';
      end if;
      new.revoked_at := now();
      new.verification_status := 'revoked';
    elsif old.status = 'completed' and new.status = 'superseded' then
      if not is_approver then
        raise exception 'not permitted to supersede reports' using errcode = '42501';
      end if;
      if new.superseded_by is null or not exists (
        select 1 from public.reports r where r.id = new.superseded_by and r.revision_of = old.id and r.status = 'completed'
      ) then
        raise exception 'a superseding revision must be issued first';
      end if;
      new.verification_status := 'superseded';
    else
      raise exception 'invalid status transition % -> %', old.status, new.status using errcode = '42501';
    end if;
  elsif new.verification_status <> old.verification_status then
    raise exception 'verification status follows the report status' using errcode = '42501';
  end if;

  if new.superseded_by is distinct from old.superseded_by and new.status <> 'superseded' then
    raise exception 'superseded_by can only be set when superseding' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at and actor is not null and actor_role <> 'org_admin' then
    raise exception 'only organisation administrators can archive reports' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger reports_before_write before insert or update on public.reports
for each row execute function public.reports_before_write();

-- Every status change is audited at the database level, independent of the application.
create or replace function public.reports_audit_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (organisation_id, actor_id, report_id, action, entity_type, entity_id, metadata)
    values (new.organisation_id, auth.uid(), new.id, case when new.revision_of is null then 'report.created' else 'report.revision_created' end,
            'report', new.id, jsonb_build_object('status', new.status, 'revision_number', new.revision_number));
  elsif new.status <> old.status then
    insert into public.audit_logs (organisation_id, actor_id, report_id, action, entity_type, entity_id, metadata)
    values (new.organisation_id, auth.uid(), new.id, 'report.status_changed', 'report', new.id,
            jsonb_build_object('from_status', old.status, 'to_status', new.status));
  end if;
  return null;
end $$;

create trigger reports_audit_status after insert or update on public.reports
for each row execute function public.reports_audit_status();

-- -----------------------------------------------------------------------------
-- Templates: a version referenced by any report can no longer change.
-- -----------------------------------------------------------------------------
create or replace function public.report_templates_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organisation_id <> old.organisation_id or new.version <> old.version then
    raise exception 'template identity cannot be changed' using errcode = '42501';
  end if;
  if (new.field_configuration <> old.field_configuration or new.letterhead_configuration <> old.letterhead_configuration
      or new.layout_configuration <> old.layout_configuration)
     and exists (select 1 from public.reports r where r.template_id = old.id) then
    raise exception 'template version is in use; create a new version instead' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger report_templates_guard before update on public.report_templates
for each row execute function public.report_templates_guard();

-- -----------------------------------------------------------------------------
-- Passport documents: organisation must match the report; reviewed data is append-once.
-- -----------------------------------------------------------------------------
create or replace function public.passport_documents_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.reports r where r.id = new.report_id and r.organisation_id = new.organisation_id) then
    raise exception 'report not found' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.storage_path <> old.storage_path or new.report_id <> old.report_id or new.organisation_id <> old.organisation_id
       or new.content_hash is distinct from old.content_hash or new.uploaded_by is distinct from old.uploaded_by then
      raise exception 'document identity cannot be changed' using errcode = '42501';
    end if;
  else
    if auth.uid() is not null then
      new.uploaded_by := auth.uid();
    end if;
    if new.storage_path not like new.organisation_id::text || '/' || new.report_id::text || '/%' then
      raise exception 'storage path must be organisation and report scoped' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger passport_documents_guard before insert or update on public.passport_documents
for each row execute function public.passport_documents_guard();

create or replace function public.report_files_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.reports r where r.id = new.report_id and r.organisation_id = new.organisation_id
                 and r.status in ('completed', 'revoked', 'superseded')) then
    raise exception 'files can only be attached to issued reports of the same organisation' using errcode = '42501';
  end if;
  if new.storage_path not like new.organisation_id::text || '/' || new.report_id::text || '/reports/%' then
    raise exception 'storage path must be organisation and report scoped' using errcode = '42501';
  end if;
  if auth.uid() is not null then
    new.generated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger report_files_guard before insert on public.report_files
for each row execute function public.report_files_guard();

-- -----------------------------------------------------------------------------
-- Audit: append-only, written through a definer function that stamps actor + organisation.
-- -----------------------------------------------------------------------------
create or replace function public.audit_logs_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit logs are append-only' using errcode = '42501';
end $$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
for each row execute function public.audit_logs_immutable();

create or replace function public.log_audit_event(
  p_action text, p_entity_type text, p_entity_id uuid default null, p_report_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.current_org_id();
begin
  if auth.uid() is null or public.current_app_role() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_report_id is not null and not exists (select 1 from public.reports r where r.id = p_report_id and r.organisation_id = v_org) then
    raise exception 'report not found' using errcode = '42501';
  end if;
  insert into public.audit_logs (organisation_id, actor_id, report_id, action, entity_type, entity_id, metadata)
  values (v_org, auth.uid(), p_report_id, p_action, left(p_entity_type, 40), p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

revoke all on function public.log_audit_event(text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, uuid, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Public verification: returns only the minimum needed to confirm authenticity.
-- Never returns names, passport data, dates of birth or any medical content.
-- -----------------------------------------------------------------------------
create or replace function public.verify_report(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_result text;
  v_expires boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'not_found');
  end if;

  select rp.id, rp.serial_number, rp.revision_number, rp.status, rp.report_date, rp.valid_until, rp.revoked_at,
         o.name as organisation_name, o.settings
    into r
    from public.reports rp
    join public.organisations o on o.id = rp.organisation_id
   where rp.verification_token_hash = p_token_hash
     and rp.status in ('completed', 'revoked', 'superseded');

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_expires := coalesce((r.settings ->> 'verification_expires_after_validity')::boolean, true);
  v_result := case
    when r.status = 'revoked' then 'revoked'
    when r.status = 'superseded' then 'superseded'
    when v_expires and r.valid_until is not null and r.valid_until < current_date then 'expired'
    else 'valid'
  end;

  insert into public.verification_stats as s (report_id, scan_count, last_verified_at)
  values (r.id, 1, now())
  on conflict (report_id) do update set scan_count = s.scan_count + 1, last_verified_at = now();

  return jsonb_build_object(
    'result', v_result,
    'reference', r.serial_number,
    'revision', r.revision_number,
    'organisation', r.organisation_name,
    'issued_on', r.report_date,
    'valid_until', r.valid_until,
    'revoked_on', (r.revoked_at at time zone 'utc')::date
  );
end $$;

revoke all on function public.verify_report(text) from public;
grant execute on function public.verify_report(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Retention: list passport files past the organisation's retention period (for the purge job).
-- -----------------------------------------------------------------------------
create or replace function public.passport_documents_due_for_purge(p_limit int default 500)
returns table (id uuid, organisation_id uuid, storage_path text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.organisation_id, d.storage_path
    from public.passport_documents d
    join public.organisations o on o.id = d.organisation_id
   where d.deleted_at is null
     and (o.settings ->> 'passport_retention_days') is not null
     and d.created_at < now() - make_interval(days => (o.settings ->> 'passport_retention_days')::int)
   order by d.created_at
   limit p_limit
$$;

revoke all on function public.passport_documents_due_for_purge(int) from public, anon, authenticated;
