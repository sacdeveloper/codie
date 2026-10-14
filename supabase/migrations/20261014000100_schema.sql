-- =============================================================================
-- Medical reporting platform — core schema
-- =============================================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.app_role as enum ('super_admin', 'org_admin', 'medical_officer', 'reporting_staff', 'auditor');
create type public.report_status as enum ('draft', 'pending_review', 'completed', 'revoked', 'superseded');
create type public.verification_status as enum ('not_issued', 'valid', 'revoked', 'superseded');
create type public.ocr_status as enum ('uploaded', 'processing', 'succeeded', 'failed', 'cancelled', 'manual');

-- -----------------------------------------------------------------------------
-- organisations
-- -----------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  -- Name used inside the examinee declaration (the reference prints "PEOPLE DIAGNOSTIC CENTRE"
  -- there while the letterhead says "PEOPLE MEDICAL CENTRE"), so it is configured separately.
  declaration_name text check (char_length(declaration_name) <= 160),
  registration_number text check (char_length(registration_number) <= 80),
  address text check (char_length(address) <= 400),
  phone text check (char_length(phone) <= 80),
  email text check (char_length(email) <= 160),
  website text check (char_length(website) <= 160),
  accreditation_details text check (char_length(accreditation_details) <= 200),
  footer_lines text[] not null default '{}' check (cardinality(footer_lines) <= 4),
  logo_path text,
  letterhead_path text,
  signature_image_path text,
  seal_image_path text,
  -- serial_prefix, serial_reset ('never'|'yearly'), serial_padding, validity_rule, timezone,
  -- signature_images_enabled (default false), verification_expires_after_validity, passport_retention_days
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 120),
  role public.app_role not null default 'reporting_staff',
  organisation_id uuid references public.organisations (id) on delete restrict,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_org_required check (role = 'super_admin' or organisation_id is not null or not is_active)
);
create index profiles_organisation_idx on public.profiles (organisation_id);

-- -----------------------------------------------------------------------------
-- report_templates (versioned; a version used by any report is immutable)
-- -----------------------------------------------------------------------------
create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  name text not null check (char_length(name) <= 120),
  version integer not null check (version > 0),
  field_configuration jsonb not null,
  letterhead_configuration jsonb not null default '{}'::jsonb,
  layout_configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, version)
);
create unique index report_templates_one_active on public.report_templates (organisation_id) where is_active;

-- -----------------------------------------------------------------------------
-- serial number counters (concurrency-safe via INSERT ... ON CONFLICT DO UPDATE)
-- -----------------------------------------------------------------------------
create table public.report_serial_counters (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  period text not null,
  last_value integer not null,
  primary key (organisation_id, period)
);

-- -----------------------------------------------------------------------------
-- reports
-- -----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  serial_number text not null,
  revision_number integer not null default 1 check (revision_number > 0),
  revision_of uuid references public.reports (id) on delete restrict,
  superseded_by uuid references public.reports (id) on delete restrict,
  report_date date not null default current_date,
  valid_until date,
  status public.report_status not null default 'draft',

  -- Section data, validated against the template schema by the application (src/lib/template).
  report_details jsonb not null default '{}'::jsonb check (jsonb_typeof(report_details) = 'object'),
  examinee_details jsonb not null default '{}'::jsonb check (jsonb_typeof(examinee_details) = 'object'),
  medical_history jsonb not null default '{}'::jsonb check (jsonb_typeof(medical_history) = 'object'),
  medical_examination jsonb not null default '{}'::jsonb check (jsonb_typeof(medical_examination) = 'object'),
  laboratory_results jsonb not null default '{}'::jsonb check (jsonb_typeof(laboratory_results) = 'object'),
  remarks text check (char_length(remarks) <= 2000),

  -- Denormalised, trigger-maintained columns for listing and server-side search.
  examinee_full_name text,
  passport_number text,
  passport_number_normalized text,
  position_applied_for text,
  nationality text,

  photo_path text,
  -- Identity review step: confirmed from a reviewed passport extraction or by manual entry.
  identity_source text check (identity_source in ('passport_ocr', 'manual')),
  identity_confirmed_at timestamptz,
  identity_confirmed_by uuid references auth.users (id) on delete set null,
  template_id uuid references public.report_templates (id) on delete restrict,
  template_version integer not null,
  -- Organisation + template snapshot captured at issue so regenerated PDFs are identical.
  issued_snapshot jsonb,

  verification_token_hash text unique check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  verification_nonce text,
  verification_status public.verification_status not null default 'not_issued',

  client_request_id uuid,
  issuing_started_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  revoked_reason text check (char_length(revoked_reason) <= 300),
  archived_at timestamptz,

  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  revoked_at timestamptz,

  unique (organisation_id, serial_number, revision_number),
  unique (organisation_id, client_request_id),
  constraint reports_completed_has_token check (status in ('draft', 'pending_review') or verification_token_hash is not null),
  constraint reports_valid_after_date check (valid_until is null or valid_until >= report_date)
);
create index reports_org_status_idx on public.reports (organisation_id, status, report_date desc);
create index reports_org_updated_idx on public.reports (organisation_id, updated_at desc);
create index reports_org_created_idx on public.reports (organisation_id, created_at desc);
create index reports_passport_idx on public.reports (organisation_id, passport_number_normalized);
create index reports_name_trgm_idx on public.reports using gin (examinee_full_name gin_trgm_ops);
create index reports_serial_trgm_idx on public.reports using gin (serial_number gin_trgm_ops);
create index reports_revision_of_idx on public.reports (revision_of);

-- -----------------------------------------------------------------------------
-- passport_documents
-- -----------------------------------------------------------------------------
create table public.passport_documents (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  kind text not null default 'passport' check (kind in ('passport', 'photo')),
  storage_path text not null unique,
  original_filename text check (char_length(original_filename) <= 120),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer not null check (file_size > 0),
  content_hash text check (content_hash ~ '^[0-9a-f]{64}$'),
  ocr_status public.ocr_status not null default 'uploaded',
  ocr_provider text,
  is_mock boolean not null default false,
  extraction_data jsonb,
  confidence_data jsonb,
  reviewed_data jsonb,
  error_message text check (char_length(error_message) <= 300),
  uploaded_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index passport_documents_report_idx on public.passport_documents (report_id);
create index passport_documents_org_created_idx on public.passport_documents (organisation_id, created_at desc);

-- -----------------------------------------------------------------------------
-- report_files (generated PDFs; every regeneration is a new version, history preserved)
-- -----------------------------------------------------------------------------
create table public.report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete restrict,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  file_type text not null default 'report_pdf' check (file_type in ('report_pdf')),
  version integer not null check (version > 0),
  storage_path text not null unique,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  file_size integer not null check (file_size > 0),
  page_count integer not null check (page_count > 0),
  layout_mode text not null default 'single' check (layout_mode in ('single', 'continuation')),
  template_version integer not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users (id) on delete set null,
  unique (report_id, file_type, version)
);
create index report_files_report_idx on public.report_files (report_id, version desc);

-- -----------------------------------------------------------------------------
-- audit_logs (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  report_id uuid references public.reports (id) on delete restrict,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organisation_id, created_at desc);
create index audit_logs_report_idx on public.audit_logs (report_id, created_at desc);

-- -----------------------------------------------------------------------------
-- verification statistics (kept apart from reports so scans never touch issued rows)
-- -----------------------------------------------------------------------------
create table public.verification_stats (
  report_id uuid primary key references public.reports (id) on delete cascade,
  scan_count integer not null default 0,
  last_verified_at timestamptz
);
