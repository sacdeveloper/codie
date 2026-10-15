-- Hardening from Supabase database advisors (security + performance).

-- Extensions do not belong in the API-exposed public schema.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
