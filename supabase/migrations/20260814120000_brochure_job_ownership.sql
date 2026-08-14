-- Brochure extraction jobs need an owner in the website database.
--
-- The OCR service uses deliberately opaque job ids, but opacity is not
-- authorisation: every active developer previously had server functions that
-- could read or cancel any other developer's job if an id leaked. The website
-- now chooses the id before upload, records its owner here, and binds the
-- short-lived upload ticket to that id.
--
-- RLS is deny-by-default. All access goes through service-role server
-- functions, matching the rest of the admin portal schema.

CREATE TABLE IF NOT EXISTS public.brochure_jobs (
  job_id text NOT NULL PRIMARY KEY,
  admin_profile_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brochure_jobs_admin_profile_idx
  ON public.brochure_jobs (admin_profile_id);

GRANT ALL ON public.brochure_jobs TO service_role;
ALTER TABLE public.brochure_jobs ENABLE ROW LEVEL SECURITY;
