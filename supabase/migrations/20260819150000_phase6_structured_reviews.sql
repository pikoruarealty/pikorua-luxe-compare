-- Phase 6: structured, source-conscious reviews and staff field verification.
-- This migration is additive. User proof is private and is never a consumer asset.

ALTER TABLE public.property_reviews
  ADD COLUMN IF NOT EXISTS verification_tier text NOT NULL DEFAULT 'phone_verified'
    CHECK (verification_tier IN ('phone_verified', 'visit_evidence_reviewed')),
  ADD COLUMN IF NOT EXISTS structured_review_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.property_review_dimensions (
  review_id uuid NOT NULL REFERENCES public.property_reviews (id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('sales_experience', 'carpet_vs_promised', 'construction', 'density', 'noise', 'approach', 'negotiation')),
  experience_state text NOT NULL CHECK (experience_state IN ('experienced', 'not_experienced')),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  note text CHECK (char_length(note) <= 1000),
  PRIMARY KEY (review_id, dimension),
  CHECK ((experience_state = 'experienced' AND rating IS NOT NULL) OR (experience_state = 'not_experienced' AND rating IS NULL))
);

CREATE TABLE IF NOT EXISTS public.review_visit_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.property_reviews (id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  storage_bucket text NOT NULL,
  storage_object_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  upload_state text NOT NULL DEFAULT 'pending' CHECK (upload_state IN ('pending', 'verified', 'rejected', 'purged')),
  reviewed_by uuid REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  decision_reason text CHECK (char_length(decision_reason) <= 500),
  expires_at timestamptz NOT NULL,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.property_field_verification_shortlist (
  property_id uuid PRIMARY KEY REFERENCES public.properties (id) ON DELETE CASCADE,
  selected_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  selected_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  note text CHECK (char_length(note) <= 500)
);

CREATE TABLE IF NOT EXISTS public.property_field_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  publication_version_id uuid REFERENCES public.property_publication_versions (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('planned', 'completed', 'unable_to_verify')),
  visited_on date,
  completed_by uuid REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  internal_evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'completed') OR (visited_on IS NOT NULL AND completed_by IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.property_field_visit_observations (
  visit_id uuid NOT NULL REFERENCES public.property_field_visits (id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('sales_experience', 'carpet_vs_promised', 'construction', 'density', 'noise', 'approach', 'negotiation')),
  observation_state text NOT NULL CHECK (observation_state IN ('observed', 'not_observed')),
  observation text CHECK (char_length(observation) <= 1000),
  PRIMARY KEY (visit_id, dimension),
  CHECK ((observation_state = 'observed' AND observation IS NOT NULL) OR (observation_state = 'not_observed' AND observation IS NULL))
);

CREATE INDEX IF NOT EXISTS property_review_dimensions_aggregate_idx
  ON public.property_review_dimensions (dimension, rating) WHERE experience_state = 'experienced';
CREATE INDEX IF NOT EXISTS review_visit_evidence_expiry_idx
  ON public.review_visit_evidence (expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS property_field_visits_public_idx
  ON public.property_field_visits (property_id, visited_on DESC) WHERE status = 'completed';

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-visit-evidence', 'review-visit-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'property_review_dimensions', 'review_visit_evidence', 'property_field_verification_shortlist',
    'property_field_visits', 'property_field_visit_observations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
  END LOOP;
END $$;
