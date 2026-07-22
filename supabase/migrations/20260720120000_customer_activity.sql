-- Customer activity / interaction tracking for the admin panel.
--
-- Until now, visitor interactions (property views, compares, favourites) lived
-- only in browser localStorage, so the owner had no visibility into them.
-- This records them server-side so the admin Customers view can show what each
-- customer actually did, alongside the profile + quiz answers they submitted.
--
-- Same security model as every other table here: RLS ENABLED, NO policies
-- (deny-by-default). All reads/writes go through server functions using the
-- service-role client.
--
-- Fully idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.customer_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Null while the visitor is still anonymous (pre-signup).
  profile_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Groups anonymous events from one browser so they can be understood even
  -- when the visitor never signs up.
  session_key text,
  event_type text NOT NULL CHECK (
    event_type IN (
      'signup',
      'quiz_completed',
      'property_view',
      'compare_add',
      'compare_open',
      'favorite_add',
      'contact_click'
    )
  ),
  -- Slug of the property involved, when the event is property-specific.
  property_slug text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_activity_profile_idx
  ON public.customer_activity (profile_id);
CREATE INDEX IF NOT EXISTS customer_activity_event_idx
  ON public.customer_activity (event_type);
CREATE INDEX IF NOT EXISTS customer_activity_created_idx
  ON public.customer_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS customer_activity_property_idx
  ON public.customer_activity (property_slug);

GRANT ALL ON public.customer_activity TO service_role;
ALTER TABLE public.customer_activity ENABLE ROW LEVEL SECURITY;
