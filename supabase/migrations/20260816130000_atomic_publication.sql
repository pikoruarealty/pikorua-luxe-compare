-- Transactional publication support and immutable version enforcement.

CREATE TABLE IF NOT EXISTS public.cache_invalidation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cache_invalidation_outbox_pending_idx
  ON public.cache_invalidation_outbox (available_at, created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.cache_invalidation_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cache_invalidation_outbox TO service_role;

CREATE TABLE IF NOT EXISTS public.publication_assets (
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.property_assets (id) ON DELETE RESTRICT,
  sort_order smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (publication_version_id, asset_id)
);

ALTER TABLE public.publication_assets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.publication_assets TO service_role;

CREATE OR REPLACE FUNCTION public.reject_immutable_version_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS immutable_publication_versions ON public.property_publication_versions;
CREATE TRIGGER immutable_publication_versions
  BEFORE UPDATE OR DELETE ON public.property_publication_versions
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_version_change();

DROP TRIGGER IF EXISTS immutable_submission_revisions ON public.property_submission_revisions;
CREATE TRIGGER immutable_submission_revisions
  BEFORE UPDATE OR DELETE ON public.property_submission_revisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_version_change();

DROP TRIGGER IF EXISTS immutable_commercial_terms ON private.commercial_terms;
CREATE TRIGGER immutable_commercial_terms
  BEFORE UPDATE OR DELETE ON private.commercial_terms
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_version_change();
