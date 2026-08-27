-- ---------------------------------------------------------------------------
-- Bootstrap prelude for a plain PostgreSQL server (local development or VM).
--
-- The historical migrations in supabase/migrations/ need a few objects that
-- stock Postgres does not provide:
--
--   1. the roles `anon`, `authenticated`, `service_role` (migration GRANTs),
--   2. a temporary `auth.users` table required by the historical foreign key,
--   3. `storage.buckets`, which two historical migrations populate.
--
-- This file creates those objects so every migration can replay in order on a
-- self-hosted database. The final Phase D migration repoints admin_profiles to
-- better-auth's public."user" table, and drops the temporary auth schema.
--
-- Idempotent. Run once against a fresh database, before any migration:
--
--   psql -U postgres -h 127.0.0.1 -p 5433 -d propcompare -f ops/db/bootstrap.sql
-- ---------------------------------------------------------------------------

-- 1. Roles -------------------------------------------------------------------
-- NOLOGIN: nothing connects as these. They only make historical GRANT
-- statements resolve; the application connects as the database owner.
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

-- 2. Temporary auth.users migration shim -------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- This minimal shape exists only for the old foreign key and is removed by the
-- final Phase D migration.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;

-- 3. storage.buckets migration shim ------------------------------------------
-- GCS is the actual object storage service. This table only makes historical
-- migration INSERTs succeed and records the expected bucket names.
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
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text,
  applied_at timestamptz NOT NULL DEFAULT now()
);
