-- Phase D, step 2 of 2 — repoints admin_profiles.id's FK from the auth.users
-- shim onto better-auth's own "user"(id) table (added in
-- 20260827130000_better_auth_core.sql).
--
-- DO NOT RUN THIS until every active admin_profiles row has a matching
-- "user" row (i.e. every active staff/developer account has been re-enrolled
-- via scripts/reenroll-staff-accounts.ts, run by the owner during an
-- attended maintenance window — see PROGRESS.md Phase D). Running it earlier
-- will fail with a foreign key violation on the first admin_profiles row
-- that has no matching "user" row, which is the point: it's a correctness
-- gate, not just documentation.
--
-- admin_profiles.id VALUES DO NOT CHANGE. Only the FK target changes. The
-- ~22 tables that reference admin_profiles.id elsewhere in this schema need
-- no changes at all.

ALTER TABLE public.admin_profiles
  DROP CONSTRAINT IF EXISTS admin_profiles_id_fkey;

ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_id_fkey
  FOREIGN KEY (id) REFERENCES public."user" (id) ON DELETE CASCADE;
