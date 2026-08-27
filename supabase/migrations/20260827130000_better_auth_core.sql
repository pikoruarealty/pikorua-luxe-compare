-- Phase D (auth retirement): core tables for better-auth, the self-hosted
-- replacement for Supabase Auth. Purely additive — admin_profiles.id keeps
-- its existing FK onto the auth.users shim (ops/db/bootstrap.sql) for now.
-- A later migration repoints that FK onto "user"(id) below, once every
-- active staff/developer account has re-enrolled (see PROGRESS.md Phase D).
--
-- Column set and field names are dictated by better-auth's own internal
-- adapter (node_modules/@better-auth/core/dist/db/schema/*, node_modules/
-- better-auth/dist/plugins/two-factor) — verified against the installed
-- package this session, not guessed. Notably:
--   * id columns default to gen_random_uuid() even though this codebase's
--     own account-creation path always supplies an explicit id (matching
--     admin_profiles.id) — better-auth's internal sign-in/session code path
--     creates "session" and "verification" rows itself with no id supplied
--     (advanced.database.generateId is set to false in src/lib/auth/
--     auth.server.ts), so the database must fill those in.
--   * account.issuer plus account.accountId = account.userId for the
--     "credential" (password) provider — see better-auth's
--     createLocalAccountIssuer() and internal-adapter.mjs's
--     findCredentialAccount().
--
-- Security model matches every other table in this repo: RLS enabled, no
-- policies, all access through the service-role Drizzle connection
-- (src/db/client.server.ts). See 20260719120000_admin_portal_schema.sql.

CREATE TABLE IF NOT EXISTS public."user" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public."user" TO service_role;
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.session (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON public.session (user_id);

GRANT ALL ON public.session TO service_role;
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.account (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  issuer text NOT NULL,
  account_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, account_id)
);

CREATE INDEX IF NOT EXISTS account_user_id_idx ON public.account (user_id);

GRANT ALL ON public.account TO service_role;
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.verification (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON public.verification (identifier);

GRANT ALL ON public.verification TO service_role;
ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;

-- two_factor: one row per user (the twoFactor plugin looks it up by user_id
-- alone and updates in place on re-enroll — node_modules/better-auth/dist/
-- plugins/two-factor/index.mjs's enableTwoFactor handler), hence UNIQUE.
CREATE TABLE IF NOT EXISTS public.two_factor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  secret text NOT NULL,
  backup_codes text NOT NULL,
  verified boolean NOT NULL DEFAULT true,
  failed_verification_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  UNIQUE (user_id)
);

GRANT ALL ON public.two_factor TO service_role;
ALTER TABLE public.two_factor ENABLE ROW LEVEL SECURITY;
