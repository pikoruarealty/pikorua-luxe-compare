-- PropCompare v2 additive canonical foundation.
-- Supabase SQL migrations remain the sole schema authority. Runtime Drizzle
-- definitions mirror these tables and are drift-checked; they never generate
-- production migrations.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO service_role;

DO $$ BEGIN
  CREATE TYPE public.field_state AS ENUM (
    'stated', 'not_stated', 'explicitly_not_offered', 'not_applicable', 'pending_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.configuration_kind AS ENUM (
    '2_bhk', '3_bhk', '4_bhk', '5_bhk', '6_bhk', '7_bhk',
    'penthouse', 'duplex', 'villa', 'bungalow', 'plot'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.area_basis AS ENUM (
    'carpet', 'rera_carpet', 'built_up', 'super_built_up', 'plot', 'not_stated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.area_unit AS ENUM ('sq_ft', 'sq_m', 'sq_yd');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.submission_state AS ENUM (
    'draft', 'submitted', 'validating', 'in_review', 'changes_requested',
    'rejected', 'approved', 'published', 'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_state AS ENUM ('pending', 'approved', 'rejected', 'purged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.review_visibility AS ENUM ('published', 'held', 'hidden', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.enquiry_status AS ENUM ('new', 'viewed', 'contacted', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ocr_job_state AS ENUM (
    'queued', 'processing', 'needs_correction', 'ready_for_review', 'completed',
    'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend staff roles without changing existing owner/developer rows.
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_role_check;
ALTER TABLE public.admin_profiles ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('owner', 'reviewer', 'support', 'developer')) NOT VALID;
ALTER TABLE public.admin_profiles VALIDATE CONSTRAINT admin_profiles_role_check;

CREATE TABLE IF NOT EXISTS public.markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  state_name text NOT NULL,
  city_code text NOT NULL,
  city_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_code, city_code)
);

CREATE TABLE IF NOT EXISTS public.configuration_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.configuration_kind NOT NULL UNIQUE,
  display_name text NOT NULL,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.market_configuration_options (
  market_id uuid NOT NULL REFERENCES public.markets (id) ON DELETE CASCADE,
  configuration_option_id uuid NOT NULL REFERENCES public.configuration_options (id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (market_id, configuration_option_id)
);

INSERT INTO public.markets (state_code, state_name, city_code, city_name, is_enabled)
VALUES ('GJ', 'Gujarat', 'ahmedabad', 'Ahmedabad', true)
ON CONFLICT (state_code, city_code) DO UPDATE
SET state_name = EXCLUDED.state_name,
    city_name = EXCLUDED.city_name;

INSERT INTO public.configuration_options (kind, display_name, sort_order)
VALUES
  ('2_bhk', '2 BHK', 20), ('3_bhk', '3 BHK', 30), ('4_bhk', '4 BHK', 40),
  ('5_bhk', '5 BHK', 50), ('6_bhk', '6 BHK', 60), ('7_bhk', '7 BHK', 70),
  ('penthouse', 'Penthouse', 80), ('duplex', 'Duplex', 90), ('villa', 'Villa', 100),
  ('bungalow', 'Bungalow', 110), ('plot', 'Plot', 120)
ON CONFLICT (kind) DO UPDATE
SET display_name = EXCLUDED.display_name,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.market_configuration_options (market_id, configuration_option_id)
SELECT m.id, c.id
FROM public.markets m
CROSS JOIN public.configuration_options c
WHERE m.state_code = 'GJ' AND m.city_code = 'ahmedabad'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.property_publication_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  market_id uuid NOT NULL REFERENCES public.markets (id) ON DELETE RESTRICT,
  public_snapshot jsonb NOT NULL,
  verified_at timestamptz NOT NULL,
  verified_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  previous_version_id uuid REFERENCES public.property_publication_versions (id) ON DELETE RESTRICT,
  source_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, version),
  CHECK (jsonb_typeof(public_snapshot) = 'object')
);

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS current_publication_version_id uuid;
DO $$ BEGIN
  ALTER TABLE public.properties
    ADD CONSTRAINT properties_current_publication_version_fk
    FOREIGN KEY (current_publication_version_id)
    REFERENCES public.property_publication_versions (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.configuration_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE CASCADE,
  configuration_option_id uuid NOT NULL REFERENCES public.configuration_options (id) ON DELETE RESTRICT,
  variant_name text,
  area_value numeric(14, 3) CHECK (area_value >= 0),
  area_basis public.area_basis,
  area_unit public.area_unit,
  area_state public.field_state NOT NULL DEFAULT 'not_stated',
  bathrooms smallint CHECK (bathrooms >= 0),
  bathrooms_state public.field_state NOT NULL DEFAULT 'not_stated',
  balconies smallint CHECK (balconies >= 0),
  balconies_state public.field_state NOT NULL DEFAULT 'not_stated',
  public_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(public_facts) = 'object')
);

CREATE INDEX IF NOT EXISTS configuration_variants_publication_idx
  ON public.configuration_variants (publication_version_id, configuration_option_id);

CREATE TABLE IF NOT EXISTS private.commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_variant_id uuid NOT NULL REFERENCES public.configuration_variants (id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  base_sale_price_rupees bigint CHECK (base_sale_price_rupees >= 0),
  rate_rupees_per_sq_ft numeric(14, 2) CHECK (rate_rupees_per_sq_ft >= 0),
  rate_area_basis public.area_basis,
  private_lower_bound_rupees bigint CHECK (private_lower_bound_rupees >= 0),
  private_upper_bound_rupees bigint CHECK (private_upper_bound_rupees >= 0),
  verified_at timestamptz,
  verified_by uuid REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  stale_after timestamptz,
  source_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (configuration_variant_id, revision),
  CHECK (
    private_lower_bound_rupees IS NULL OR private_upper_bound_rupees IS NULL
    OR private_lower_bound_rupees <= private_upper_bound_rupees
  )
);

CREATE INDEX IF NOT EXISTS commercial_terms_variant_latest_idx
  ON private.commercial_terms (configuration_variant_id, revision DESC);

CREATE TABLE IF NOT EXISTS public.property_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE CASCADE,
  amenity_code text NOT NULL,
  display_name text NOT NULL,
  value_state public.field_state NOT NULL DEFAULT 'stated',
  details text,
  UNIQUE (publication_version_id, amenity_code)
);

CREATE TABLE IF NOT EXISTS public.property_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_version_id uuid NOT NULL REFERENCES public.property_publication_versions (id) ON DELETE CASCADE,
  specification_code text NOT NULL,
  display_name text NOT NULL,
  value_text text,
  value_state public.field_state NOT NULL DEFAULT 'not_stated',
  UNIQUE (publication_version_id, specification_code)
);

CREATE TABLE IF NOT EXISTS public.source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_developer_id uuid REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  storage_bucket text NOT NULL,
  storage_object_path text NOT NULL,
  original_filename text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  retention_hold boolean NOT NULL DEFAULT false,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_developer_id, sha256)
);

CREATE TABLE IF NOT EXISTS public.property_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties (id) ON DELETE RESTRICT,
  source_document_id uuid REFERENCES public.source_documents (id) ON DELETE RESTRICT,
  owner_developer_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  state public.asset_state NOT NULL DEFAULT 'pending',
  storage_bucket text NOT NULL,
  storage_object_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  approved_by uuid REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_submission_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties (id) ON DELETE RESTRICT,
  developer_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  state public.submission_state NOT NULL DEFAULT 'draft',
  current_revision integer NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_submission_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.property_submission_workflows (id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  submitted_payload jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, revision),
  CHECK (jsonb_typeof(submitted_payload) = 'object')
);

ALTER TABLE public.property_publication_versions
  DROP CONSTRAINT IF EXISTS property_publication_versions_source_revision_fk;
ALTER TABLE public.property_publication_versions
  ADD CONSTRAINT property_publication_versions_source_revision_fk
  FOREIGN KEY (source_revision_id) REFERENCES public.property_submission_revisions (id) ON DELETE RESTRICT;

ALTER TABLE private.commercial_terms
  DROP CONSTRAINT IF EXISTS commercial_terms_source_revision_fk;
ALTER TABLE private.commercial_terms
  ADD CONSTRAINT commercial_terms_source_revision_fk
  FOREIGN KEY (source_revision_id) REFERENCES public.property_submission_revisions (id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_revision_id uuid REFERENCES public.property_submission_revisions (id) ON DELETE CASCADE,
  publication_version_id uuid REFERENCES public.property_publication_versions (id) ON DELETE CASCADE,
  field_path text NOT NULL,
  value_state public.field_state NOT NULL,
  source_document_id uuid REFERENCES public.source_documents (id) ON DELETE RESTRICT,
  source_page integer CHECK (source_page > 0),
  evidence_text text,
  confidence numeric(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (submission_revision_id IS NOT NULL OR publication_version_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.property_submission_workflows (id) ON DELETE CASCADE,
  submission_revision_id uuid REFERENCES public.property_submission_revisions (id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  action text NOT NULL,
  reason text,
  before_values jsonb,
  after_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('staff', 'developer', 'consumer', 'system')),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets (id) ON DELETE RESTRICT,
  configuration_option_ids uuid[] NOT NULL,
  budget_band_id text NOT NULL,
  budget_min_rupees bigint CHECK (budget_min_rupees >= 0),
  budget_max_rupees bigint CHECK (budget_max_rupees >= budget_min_rupees),
  property_type_ids text[] NOT NULL DEFAULT '{}',
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE TABLE IF NOT EXISTS public.property_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  public_name text NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text CHECK (char_length(review_text) <= 2000),
  visibility public.review_visibility NOT NULL DEFAULT 'published',
  moderation_provider text,
  moderation_revision text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS property_reviews_profile_property_unique
  ON public.property_reviews (property_id, profile_id)
  WHERE profile_id IS NOT NULL AND visibility <> 'deleted';

CREATE TABLE IF NOT EXISTS public.property_review_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.property_reviews (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text CHECK (char_length(review_text) <= 2000),
  moderation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, version)
);

CREATE TABLE IF NOT EXISTS public.developer_review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.property_reviews (id) ON DELETE CASCADE,
  developer_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  response_text text NOT NULL CHECK (char_length(response_text) BETWEEN 1 AND 2000),
  visibility public.review_visibility NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.property_reviews (id) ON DELETE CASCADE,
  reporter_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reason_code text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  adjudicated_by uuid REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  adjudication_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_profile_id, reason_code)
);

CREATE TABLE IF NOT EXISTS public.property_rating_aggregates (
  property_id uuid PRIMARY KEY REFERENCES public.properties (id) ON DELETE CASCADE,
  average_rating numeric(3, 2) NOT NULL DEFAULT 0,
  published_review_count integer NOT NULL DEFAULT 0 CHECK (published_review_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  configuration_variant_id uuid REFERENCES public.configuration_variants (id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  developer_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  contact_name text,
  contact_phone text,
  message text CHECK (char_length(message) <= 2000),
  consented_at timestamptz NOT NULL,
  consent_text_version text NOT NULL,
  deduplication_hash text NOT NULL,
  status public.enquiry_status NOT NULL DEFAULT 'new',
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_enquiries_developer_idx
  ON public.property_enquiries (developer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS property_enquiries_dedupe_lookup_idx
  ON public.property_enquiries (profile_id, deduplication_hash, created_at DESC)
  WHERE profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid NOT NULL REFERENCES public.source_documents (id) ON DELETE RESTRICT,
  developer_id uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  state public.ocr_job_state NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  locked_by text,
  locked_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  cancel_requested_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_document_id)
);

CREATE INDEX IF NOT EXISTS ocr_jobs_claim_idx
  ON public.ocr_jobs (available_at, created_at)
  WHERE state = 'queued';

CREATE TABLE IF NOT EXISTS public.ocr_extraction_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ocr_jobs (id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  schema_version integer NOT NULL,
  model_version text NOT NULL,
  prompt_version text NOT NULL,
  parser_version text NOT NULL,
  formula_version text NOT NULL,
  extraction_payload jsonb NOT NULL,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, revision)
);

-- All canonical tables are server-only. The application enforces finer role
-- authorization; deny-by-default RLS protects accidental browser access.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'markets', 'configuration_options', 'market_configuration_options',
    'property_publication_versions', 'configuration_variants', 'property_amenities',
    'property_specifications', 'source_documents', 'property_assets',
    'property_submission_workflows', 'property_submission_revisions', 'field_provenance',
    'review_actions', 'audit_events', 'customer_preferences', 'property_reviews',
    'property_review_versions', 'developer_review_responses', 'review_reports',
    'property_rating_aggregates', 'property_enquiries', 'ocr_jobs',
    'ocr_extraction_revisions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
  END LOOP;
END $$;

ALTER TABLE private.commercial_terms ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.commercial_terms TO service_role;

DROP TRIGGER IF EXISTS update_markets_updated_at ON public.markets;
CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON public.markets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_submission_workflows_updated_at ON public.property_submission_workflows;
CREATE TRIGGER update_submission_workflows_updated_at BEFORE UPDATE ON public.property_submission_workflows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_preferences_updated_at ON public.customer_preferences;
CREATE TRIGGER update_customer_preferences_updated_at BEFORE UPDATE ON public.customer_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_reviews_updated_at ON public.property_reviews;
CREATE TRIGGER update_property_reviews_updated_at BEFORE UPDATE ON public.property_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_developer_review_responses_updated_at ON public.developer_review_responses;
CREATE TRIGGER update_developer_review_responses_updated_at BEFORE UPDATE ON public.developer_review_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_enquiries_updated_at ON public.property_enquiries;
CREATE TRIGGER update_property_enquiries_updated_at BEFORE UPDATE ON public.property_enquiries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ocr_jobs_updated_at ON public.ocr_jobs;
CREATE TRIGGER update_ocr_jobs_updated_at BEFORE UPDATE ON public.ocr_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
