-- Persist trusted property coordinates so anonymous distance calculations do
-- not geocode addresses supplied by callers. Existing rows remain nullable
-- and will receive coordinates the next time an owner saves them.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.properties'::regclass
      AND conname = 'properties_latitude_range'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_latitude_range
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.properties'::regclass
      AND conname = 'properties_longitude_range'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_longitude_range
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;
END
$$;
