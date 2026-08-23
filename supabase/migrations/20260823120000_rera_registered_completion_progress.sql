-- scripts/rera-enrich.ts already pulls the GujRERA-registered completion date
-- and construction-progress percentage for every hand-confirmed project, but
-- property_publication_details had no columns for either, so the enrichment
-- writes landed only in the OCR job JSON and never reached a publishable
-- field. These two mirror the existing proposed_start_date_rera pair.
ALTER TABLE public.property_publication_details
  ADD COLUMN IF NOT EXISTS registered_completion_date_rera date,
  ADD COLUMN IF NOT EXISTS registered_completion_date_rera_state public.field_state NOT NULL DEFAULT 'not_stated',
  ADD COLUMN IF NOT EXISTS construction_progress_rera text,
  ADD COLUMN IF NOT EXISTS construction_progress_rera_state public.field_state NOT NULL DEFAULT 'not_stated';
