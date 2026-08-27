-- Post-Phase-D follow-up: wire markBrochureJobConsumed, which C2 wrote and
-- deferred to "C3/C4" but neither ever called. Every extraction a developer
-- has ever started still stays in the "resume" dropdown forever, including
-- ones that were already turned into published properties, because nothing
-- has ever pointed a brochure_jobs row at the property it became.
--
-- The missing link was the workflow, not the job: a create workflow doesn't
-- know its property's id until publishWorkflow allocates one (see
-- createPropertyIdentity), so the job id has to ride along on the workflow
-- from submit through to publish. This column is that ride.
--
-- Nullable and ON DELETE SET NULL: only create workflows that originated from
-- a brochure extraction ever set it; a manually-typed create or any edit
-- workflow leaves it null, same as today.

ALTER TABLE public.property_submission_workflows
  ADD COLUMN IF NOT EXISTS brochure_job_id text
  REFERENCES public.brochure_jobs (job_id) ON DELETE SET NULL;
