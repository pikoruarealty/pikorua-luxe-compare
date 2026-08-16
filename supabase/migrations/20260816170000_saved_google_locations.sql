CREATE TABLE IF NOT EXISTS public.saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  google_place_id text NOT NULL CHECK (char_length(google_place_id) BETWEEN 5 AND 300),
  place_id_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, google_place_id)
);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_locations FROM anon, authenticated;
GRANT ALL ON public.saved_locations TO service_role;

DROP TRIGGER IF EXISTS update_saved_locations_updated_at ON public.saved_locations;
CREATE TRIGGER update_saved_locations_updated_at
  BEFORE UPDATE ON public.saved_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.saved_locations IS
  'Private consumer labels and Google Place IDs only; provider coordinates and formatted content are not persisted.';
