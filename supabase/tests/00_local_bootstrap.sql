-- =============================================================================
-- LOCAL VALIDATION BOOTSTRAP (test harness only — NOT a production migration)
-- =============================================================================
-- Recreates the minimal slice of Supabase that saas_install.sql + the saas
-- migrations depend on, so they can be applied to a plain Postgres container:
--   * the `auth` schema with a stub `auth.users` table and `auth.uid()`
--   * the `anon` / `authenticated` / `service_role` roles
-- This lets us validate SQL + RLS isolation without the full Supabase stack.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase roles ---------------------------------------------------------------
DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- auth schema + stub users table ----------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                  UUID PRIMARY KEY,
  instance_id         UUID,
  aud                 TEXT,
  role                TEXT,
  email               TEXT,
  encrypted_password  TEXT,
  email_confirmed_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- auth.uid(): resolve the JWT 'sub' claim from the session setting, exactly like
-- Supabase does at runtime.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;

-- storage schema stub: saas_install.sql ends with setup_storage.sql which seeds
-- buckets and defines policies on storage.objects. Not part of the multi-tenant
-- migrations under test, but stubbed so the base install runs end-to-end.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  public             BOOLEAN DEFAULT FALSE,
  file_size_limit    BIGINT,
  allowed_mime_types TEXT[],
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  TEXT REFERENCES storage.buckets(id),
  name       TEXT,
  owner      UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
