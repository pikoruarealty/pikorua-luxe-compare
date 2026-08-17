-- Phase 5 keeps verification, scoring and connectivity as immutable evidence
-- snapshots. None of these tables changes the Phase 1 canonical dictionary;
-- they attach reviewed conclusions to an already-published version instead.

CREATE TABLE IF NOT EXISTS public.property_rera_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  registration_number text NOT NULL,
  source_url text,
  source_document_id uuid REFERENCES public.source_documents (id) ON DELETE RESTRICT,
  checked_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('matched', 'discrepancy', 'unavailable', 'invalid_registration')),
  published_promoter_name text,
  official_promoter_name text,
  promoter_match boolean,
  promoter_match_basis text CHECK (promoter_match_basis IN ('exact', 'normalized', 'manual_override', 'unresolved')),
  promoter_match_reason text,
  published_completion_date date,
  official_completion_date date,
  completion_difference_days integer CHECK (completion_difference_days IS NULL OR completion_difference_days >= 0),
  notes text,
  supersedes_id uuid REFERENCES public.property_rera_verifications (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_version_id, revision),
  CHECK (source_url IS NOT NULL OR source_document_id IS NOT NULL OR status = 'unavailable'),
  CHECK (promoter_match_basis <> 'manual_override' OR COALESCE(length(trim(promoter_match_reason)), 0) > 0)
);

CREATE TABLE IF NOT EXISTS public.property_rera_area_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.property_rera_verifications (id) ON DELETE CASCADE,
  configuration_variant_id uuid NOT NULL REFERENCES public.configuration_variants (id) ON DELETE RESTRICT,
  brochure_raw_value numeric(14, 3) NOT NULL CHECK (brochure_raw_value >= 0),
  brochure_raw_unit text NOT NULL CHECK (brochure_raw_unit IN ('sq_ft', 'sq_m', 'sq_yd', 'gaj', 'acre')),
  brochure_raw_text text NOT NULL,
  brochure_sq_ft numeric(14, 3) NOT NULL CHECK (brochure_sq_ft >= 0),
  rera_raw_value numeric(14, 3) NOT NULL CHECK (rera_raw_value >= 0),
  rera_raw_unit text NOT NULL CHECK (rera_raw_unit IN ('sq_ft', 'sq_m', 'sq_yd', 'gaj', 'acre')),
  rera_raw_text text NOT NULL,
  rera_sq_ft numeric(14, 3) NOT NULL CHECK (rera_sq_ft >= 0),
  absolute_difference_sq_ft numeric(14, 3) NOT NULL CHECK (absolute_difference_sq_ft >= 0),
  difference_percent numeric(8, 3) NOT NULL CHECK (difference_percent >= 0),
  result text NOT NULL CHECK (result IN ('rounding_equivalent', 'discrepancy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verification_id, configuration_variant_id)
);

CREATE TABLE IF NOT EXISTS public.property_score_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE RESTRICT,
  methodology_version text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  composite smallint CHECK (composite BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('complete', 'insufficient_evidence', 'invalid')),
  coverage_percent smallint NOT NULL CHECK (coverage_percent BETWEEN 0 AND 100),
  cohort_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cohort_snapshot) = 'object'),
  calculated_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  calculated_at timestamptz NOT NULL,
  supersedes_id uuid REFERENCES public.property_score_versions (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_version_id, methodology_version, revision),
  CHECK ((status = 'complete' AND composite IS NOT NULL) OR (status <> 'complete' AND composite IS NULL))
);

CREATE TABLE IF NOT EXISTS public.property_score_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_version_id uuid NOT NULL REFERENCES public.property_score_versions (id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('space', 'privacy', 'specification', 'developer', 'possession')),
  score smallint CHECK (score BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('complete', 'insufficient_evidence', 'invalid')),
  coverage_percent smallint NOT NULL CHECK (coverage_percent BETWEEN 0 AND 100),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_snapshot) = 'object'),
  public_explanation jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(public_explanation) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (score_version_id, dimension),
  CHECK ((status = 'complete' AND score IS NOT NULL) OR (status <> 'complete' AND score IS NULL))
);

CREATE TABLE IF NOT EXISTS public.market_landmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets (id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('airport', 'transit', 'business_district', 'hospital', 'school', 'shopping', 'highway_access')),
  display_name text NOT NULL,
  google_place_id text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  verified_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, google_place_id)
);

CREATE TABLE IF NOT EXISTS public.property_verified_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  google_place_id text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  verified_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL,
  supersedes_id uuid REFERENCES public.property_verified_locations (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_version_id, revision)
);

CREATE TABLE IF NOT EXISTS public.property_connectivity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_location_id uuid NOT NULL REFERENCES public.property_verified_locations (id) ON DELETE RESTRICT,
  landmark_id uuid NOT NULL REFERENCES public.market_landmarks (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('available', 'unavailable')),
  distance_meters integer CHECK (distance_meters IS NULL OR distance_meters >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  travel_mode text NOT NULL DEFAULT 'driving' CHECK (travel_mode = 'driving'),
  provider text NOT NULL DEFAULT 'google_routes' CHECK (provider = 'google_routes'),
  calculated_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  calculated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verified_location_id, landmark_id, revision),
  CHECK (
    (status = 'available' AND distance_meters IS NOT NULL AND duration_seconds IS NOT NULL)
    OR (status = 'unavailable' AND distance_meters IS NULL AND duration_seconds IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS rera_verifications_publication_idx
  ON public.property_rera_verifications (publication_version_id, revision DESC);
CREATE INDEX IF NOT EXISTS score_versions_publication_idx
  ON public.property_score_versions (publication_version_id, methodology_version, revision DESC);
CREATE INDEX IF NOT EXISTS active_market_landmarks_idx
  ON public.market_landmarks (market_id, sort_order, display_name) WHERE is_active;
CREATE INDEX IF NOT EXISTS verified_locations_publication_idx
  ON public.property_verified_locations (publication_version_id, revision DESC);
CREATE INDEX IF NOT EXISTS connectivity_location_idx
  ON public.property_connectivity_snapshots (verified_location_id, calculated_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_complete_propscore_dimensions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE target_score_id uuid;
DECLARE target_status text;
BEGIN
  IF TG_TABLE_NAME = 'property_score_versions' THEN
    target_score_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_score_id := OLD.score_version_id;
  ELSE
    target_score_id := NEW.score_version_id;
  END IF;
  SELECT status INTO target_status FROM public.property_score_versions WHERE id = target_score_id;
  IF target_status = 'complete' AND (
    SELECT count(DISTINCT dimension) FROM public.property_score_dimensions WHERE score_version_id = target_score_id
  ) <> 5 THEN
    RAISE EXCEPTION 'A complete PropScore requires exactly five dimensions';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS complete_propscore_version_dimensions ON public.property_score_versions;
CREATE CONSTRAINT TRIGGER complete_propscore_version_dimensions
AFTER INSERT OR UPDATE ON public.property_score_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_complete_propscore_dimensions();

DROP TRIGGER IF EXISTS complete_propscore_dimension_changes ON public.property_score_dimensions;
CREATE CONSTRAINT TRIGGER complete_propscore_dimension_changes
AFTER INSERT OR UPDATE OR DELETE ON public.property_score_dimensions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_complete_propscore_dimensions();

CREATE OR REPLACE FUNCTION public.reject_phase5_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; insert a superseding revision', TG_TABLE_NAME;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'property_rera_verifications', 'property_rera_area_checks',
    'property_score_versions', 'property_score_dimensions',
    'property_verified_locations', 'property_connectivity_snapshots'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_phase5_mutation ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_phase5_mutation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_phase5_evidence_mutation()',
      table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'property_rera_verifications', 'property_rera_area_checks',
    'property_score_versions', 'property_score_dimensions', 'market_landmarks',
    'property_verified_locations', 'property_connectivity_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
  END LOOP;
END $$;
