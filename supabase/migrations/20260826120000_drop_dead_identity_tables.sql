-- Phase A of the Supabase retirement: profiles / admin_profiles /
-- customer_activity move to a real Drizzle-owned home (src/db/schema.ts),
-- reusing the columns these tables already have from earlier migrations —
-- no column changes needed here.
--
-- Two tables from that same identity slice are confirmed dead (zero code
-- references anywhere in src/ or scripts/, verified 2026-08-26):
--   * profile_email_conflicts — one-time backfill/audit artifact from the
--     2026-08-14 email-uniqueness migration, its job already done.
--   * field_provenance — schema existed for a field-provenance feature that
--     was never wired up; nothing ever inserted into it.
-- Idempotent: safe to re-run.

DROP TABLE IF EXISTS public.profile_email_conflicts;
DROP TABLE IF EXISTS public.field_provenance;
