-- ---------------------------------------------------------------------------
-- Bootstrap prelude for a plain PostgreSQL server (local dev, or the GCP VM).
--
-- The 21 migrations in supabase/migrations/ were written against Supabase,
-- which provides three things a stock Postgres does not:
--
--   1. the roles `anon`, `authenticated`, `service_role` (every migration
--      GRANTs to them),
--   2. `auth.users`  — admin_profiles.id has an FK onto it,
--   3. `storage.buckets` — two migrations INSERT a bucket row.
--
-- Rather than fork the migrations (which would drift from what already ran
-- against the hosted database), this file creates those three things up front
-- so every migration file replays byte-identical on either server.
--
-- Idempotent. Run once against a fresh database, before any migration:
--
--   psql -U postgres -h 127.0.0.1 -p 5433 -d propcompare -f ops/db/bootstrap.sql
--
-- NOTE ON auth.users: this is a shim, not Supabase Auth. It exists to satisfy
-- the admin_profiles foreign key and to hold the ids of accounts created by
-- whatever auth system replaces Supabase Auth. Migrating the actual auth flow
-- off Supabase is separate, unstarted work — see PROGRESS.md.
-- ---------------------------------------------------------------------------

-- 1. Roles -------------------------------------------------------------------
-- NOLOGIN: nothing connects as these. They exist only so the migrations'
-- GRANT statements resolve. The application connects as the database owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- 2. auth.users shim ---------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- Column set is deliberately the subset Supabase's own auth.users exposes that
-- this codebase actually reads (id, email, timestamps). Widen it only if real
-- code needs more, so the shim never pretends to be more than it is.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;

-- 3. storage.buckets shim ----------------------------------------------------
-- Object storage on the VM will not be Supabase Storage; this table only keeps
-- the two migration INSERTs from failing and records which buckets the app
-- expects to exist. Whatever backs those buckets is a separate decision.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;

-- 4. Migration tracking ------------------------------------------------------
-- The hosted database never had this table (migrations were applied by hand);
-- creating it here means the local database can track what has run, matching
-- the shape the Supabase CLI uses so the two stay comparable.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text,
  applied_at timestamptz NOT NULL DEFAULT now()
);
