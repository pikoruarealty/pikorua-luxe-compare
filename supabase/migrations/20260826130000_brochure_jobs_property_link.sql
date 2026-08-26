-- Phase C, sub-phase C2: give `brochure_jobs` a real local-Postgres home and
-- link a job to the property it eventually became.
--
-- The table itself already exists here (20260814120000_brochure_job_ownership
-- .sql replays against local Postgres like every other migration) — what it
-- has never had is any linkage back to the catalogue. brochure-extract
-- .functions.ts:74-76 documents the consequence: once a brochure has been
-- extracted and turned into a property, its job still shows up forever in the
-- developer's "Search your extractions" resume dropdown, because nothing in
-- the schema can tell a consumed job from an abandoned one.
--
-- ON DELETE SET NULL, deliberately: if a property is ever removed, the
-- extraction job itself is still a real thing that happened and should return
-- to the resume list rather than disappear or block the delete.

ALTER TABLE public.brochure_jobs
  ADD COLUMN IF NOT EXISTS property_id uuid
  REFERENCES public.properties (id) ON DELETE SET NULL;

-- Partial index: every read of this column is "which jobs are still
-- unconsumed", so only the NULL side is worth indexing.
CREATE INDEX IF NOT EXISTS brochure_jobs_unconsumed_idx
  ON public.brochure_jobs (admin_profile_id, created_at DESC)
  WHERE property_id IS NULL;

GRANT ALL ON public.brochure_jobs TO service_role;
