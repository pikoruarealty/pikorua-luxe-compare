-- Phase 7 runtime invariants. The application also refreshes aggregates in the
-- same transaction so reads remain correct during rolling deployment.

CREATE OR REPLACE FUNCTION public.refresh_property_rating_aggregate(target_property_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.property_rating_aggregates (
    property_id, average_rating, published_review_count, updated_at
  )
  SELECT
    target_property_id,
    COALESCE(AVG(rating), 0)::numeric(3, 2),
    COUNT(*)::integer,
    now()
  FROM public.property_reviews
  WHERE property_id = target_property_id AND visibility = 'published'
  ON CONFLICT (property_id) DO UPDATE SET
    average_rating = EXCLUDED.average_rating,
    published_review_count = EXCLUDED.published_review_count,
    updated_at = EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION public.property_review_aggregate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_property_rating_aggregate(COALESCE(NEW.property_id, OLD.property_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS property_review_aggregate_after_write ON public.property_reviews;
CREATE TRIGGER property_review_aggregate_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.property_reviews
FOR EACH ROW EXECUTE FUNCTION public.property_review_aggregate_trigger();

CREATE INDEX IF NOT EXISTS property_reviews_public_listing_idx
  ON public.property_reviews (property_id, published_at DESC, created_at DESC)
  WHERE visibility = 'published';

CREATE INDEX IF NOT EXISTS review_reports_moderation_queue_idx
  ON public.review_reports (status, created_at DESC);

ALTER TABLE public.property_enquiries
  DROP CONSTRAINT IF EXISTS property_enquiries_anonymized_contact_check;
ALTER TABLE public.property_enquiries
  ADD CONSTRAINT property_enquiries_anonymized_contact_check
  CHECK (
    (anonymized_at IS NULL AND contact_name IS NOT NULL AND contact_phone IS NOT NULL)
    OR (anonymized_at IS NOT NULL AND contact_name IS NULL AND contact_phone IS NULL)
  ) NOT VALID;

COMMENT ON COLUMN public.property_enquiries.consent_text_version IS
  'Version of the explicit per-enquiry data-sharing notice accepted by the consumer.';
COMMENT ON COLUMN public.property_enquiries.deduplication_hash IS
  'Server-generated hash used only to suppress identical submissions within 24 hours.';
