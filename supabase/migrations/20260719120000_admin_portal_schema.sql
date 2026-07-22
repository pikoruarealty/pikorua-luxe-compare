-- Admin portal + developer submission pipeline.
-- Adds three tables (admin_profiles, properties, property_submissions) and a
-- public Storage bucket for property images.
--
-- Security model mirrors the existing public.profiles table exactly:
--   * RLS is ENABLED on every table.
--   * NO policies are created — deny-by-default.
--   * All reads AND writes go exclusively through server functions using the
--     service-role client (src/integrations/supabase/client.server.ts), which
--     bypasses RLS. This includes public site reads.
-- Do NOT add public SELECT/INSERT policies here — the submission API is the
-- only intended write path, and that assumption is load-bearing for the
-- developer-portal approval workflow.
--
-- Fully idempotent: safe to re-run. Defines its own updated_at trigger function
-- rather than depending on one existing (the live DB uses handle_updated_at(),
-- which does not match this repo's earlier migration).

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function (self-contained; do not assume it exists).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin_profiles: owner + developer accounts, 1:1 with auth.users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'developer')),
  email text NOT NULL UNIQUE,
  full_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.admin_profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_profiles TO service_role;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- properties: the live source of truth for the whole public site.
--   * slug preserves existing /residence/<slug> and ?ids=<slug> URLs.
--   * configurations + gallery are JSONB (variable shape, read as a whole).
--   * amenities + advantages are text[] (flat lists, GIN-indexable).
--   * derived display fields (configuration_summary, price_summary,
--     size_numeric) are precomputed at write time, not on read.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  developer text,
  category text NOT NULL CHECK (category IN ('Apartment', 'Bungalow', 'Plots')),
  tagline text,
  image_url text,
  size text,
  size_numeric numeric,
  super_built_up_area text,
  carpet_area text,
  location text,
  state text,
  city text,
  status text,
  configuration_summary text,
  configurations jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_summary text,
  possession text,
  amenities text[] NOT NULL DEFAULT '{}',
  advantages text[] NOT NULL DEFAULT '{}',
  gallery jsonb NOT NULL DEFAULT '{}'::jsonb,
  expert_note text,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.admin_profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_category_idx ON public.properties (category);
CREATE INDEX IF NOT EXISTS properties_city_idx ON public.properties (city);
CREATE INDEX IF NOT EXISTS properties_is_published_idx ON public.properties (is_published);
CREATE INDEX IF NOT EXISTS properties_amenities_gin_idx ON public.properties USING gin (amenities);

GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- property_submissions: developer-proposed create/update, pending owner review.
--   * property_id NULL  => proposing a brand-new property.
--   * payload is a full Property-shaped camelCase object.
--   * approval writes payload into public.properties; rejection does not.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  developer_id uuid NOT NULL REFERENCES public.admin_profiles (id),
  property_id uuid REFERENCES public.properties (id),
  action text NOT NULL CHECK (action IN ('create', 'update')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id uuid REFERENCES public.admin_profiles (id),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_submissions_pending_idx ON public.property_submissions (status)
WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS property_submissions_developer_idx ON public.property_submissions (developer_id);

GRANT ALL ON public.property_submissions TO service_role;
ALTER TABLE public.property_submissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- updated_at triggers.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER update_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON public.properties;
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_submissions_updated_at ON public.property_submissions;
CREATE TRIGGER update_property_submissions_updated_at
  BEFORE UPDATE ON public.property_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Storage bucket for property images. Public read (images are marketing
-- assets, already public today as bundled files). No Storage RLS policies —
-- all uploads go through the service-role client in a server function.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;
