-- Phase 1 — the canonical dictionary. Closes issues #3-#7 from the phased plan (Part 3).
-- Purely additive: no existing column is dropped, renamed, or repointed. Nothing in
-- src/ writes to any of these new tables/columns yet (that wiring is Phase 2) — this
-- migration only establishes the shape, matching "one additive PR against
-- schemas/property.v1.json + one migration" from Part 6.
--
-- Deviation from the plan's literal wording, documented: Part 3.1 says the existing
-- configuration_variants.area_value/area_basis/area_unit/area_state columns should
-- become "a generated view over basis = 'super_built_up'" for one release. Postgres has
-- no mechanism for a stored column to become a computed view within the same table, and
-- nothing reads those columns as a view today — publishWorkflow() still writes them
-- directly and no Phase 2 wiring exists yet. They are left untouched, writable columns;
-- repointing them is Phase 2's job once configuration_variant_areas has a real writer.

-- Widen area_unit so plot size / project-structure area fields can express acre and
-- gaj alongside the existing sq_ft/sq_m/sq_yd, per Part 3.5's canonical unit list.
-- Not used elsewhere in this transaction, so this is safe under PG12+ MVCC rules for
-- ALTER TYPE ... ADD VALUE inside a transaction block.
ALTER TYPE public.area_unit ADD VALUE IF NOT EXISTS 'acre';
ALTER TYPE public.area_unit ADD VALUE IF NOT EXISTS 'gaj';

DO $$ BEGIN
  CREATE TYPE public.ceiling_height_basis AS ENUM ('clear', 'slab_to_slab', 'not_stated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3.1 — a variant can hold one area per basis (override O5). Existing scalar columns
-- on configuration_variants stay as-is; see deviation note above.
-- Column is named variant_id (not configuration_variant_id) to match the plan's literal
-- pseudo-schema in Part 3.1 and the raw SQL Phase 5 already wrote against it dark
-- (src/repositories/propscore.repository.server.ts: "JOIN configuration_variant_areas cva
-- ON cva.variant_id = cv.id"). Keep these in sync if either side changes this table.
CREATE TABLE IF NOT EXISTS public.configuration_variant_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.configuration_variants (id) ON DELETE CASCADE,
  basis public.area_basis NOT NULL,
  value numeric(14, 3) CHECK (value >= 0),
  unit public.area_unit,
  raw_text text,
  state public.field_state NOT NULL DEFAULT 'not_stated',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, basis)
);

CREATE INDEX IF NOT EXISTS configuration_variant_areas_variant_idx
  ON public.configuration_variant_areas (variant_id);

-- 3.2 — widen the dictionary: project structure, construction, developer, timeline.
-- One row per publication version. Every scalar field carries its own field_state so a
-- gap in one field never blanks the whole block (same pattern as bathrooms/balconies on
-- configuration_variants).
CREATE TABLE IF NOT EXISTS public.property_publication_details (
  publication_version_id uuid PRIMARY KEY REFERENCES public.property_publication_versions (id) ON DELETE CASCADE,

  -- Project structure
  plot_size_value numeric(14, 3) CHECK (plot_size_value >= 0),
  plot_size_unit public.area_unit,
  plot_size_state public.field_state NOT NULL DEFAULT 'not_stated',
  total_towers integer CHECK (total_towers >= 0),
  total_towers_state public.field_state NOT NULL DEFAULT 'not_stated',
  total_floors integer CHECK (total_floors >= 0),
  total_floors_state public.field_state NOT NULL DEFAULT 'not_stated',
  units_per_floor integer CHECK (units_per_floor >= 0),
  units_per_floor_state public.field_state NOT NULL DEFAULT 'not_stated',
  total_units integer CHECK (total_units >= 0),
  total_units_state public.field_state NOT NULL DEFAULT 'not_stated',
  units_per_acre numeric(10, 3) CHECK (units_per_acre >= 0),
  units_per_acre_state public.field_state NOT NULL DEFAULT 'not_stated',
  open_space_percent numeric(5, 2) CHECK (open_space_percent >= 0),
  open_space_percent_state public.field_state NOT NULL DEFAULT 'not_stated',
  parking_levels integer CHECK (parking_levels >= 0),
  parking_levels_state public.field_state NOT NULL DEFAULT 'not_stated',
  podium_structure text,
  podium_structure_state public.field_state NOT NULL DEFAULT 'not_stated',
  lifts_per_tower integer CHECK (lifts_per_tower >= 0),
  lifts_per_tower_state public.field_state NOT NULL DEFAULT 'not_stated',
  clubhouse_size_sq_ft numeric(12, 2) CHECK (clubhouse_size_sq_ft >= 0),
  clubhouse_size_sq_ft_state public.field_state NOT NULL DEFAULT 'not_stated',

  -- Construction (issue #7 — ceilingHeightBasis)
  internal_ceiling_height_ft numeric(5, 2) CHECK (internal_ceiling_height_ft >= 0),
  ceiling_height_basis public.ceiling_height_basis NOT NULL DEFAULT 'not_stated',
  ceiling_height_state public.field_state NOT NULL DEFAULT 'not_stated',
  construction_quality text,
  construction_quality_state public.field_state NOT NULL DEFAULT 'not_stated',
  flooring_type text,
  flooring_type_state public.field_state NOT NULL DEFAULT 'not_stated',
  window_glazing text,
  window_glazing_state public.field_state NOT NULL DEFAULT 'not_stated',
  bath_sanitary_fittings text,
  bath_sanitary_fittings_state public.field_state NOT NULL DEFAULT 'not_stated',
  vrv_ac_provision text,
  vrv_ac_provision_state public.field_state NOT NULL DEFAULT 'not_stated',
  geyser_provision text,
  geyser_provision_state public.field_state NOT NULL DEFAULT 'not_stated',

  -- Developer
  experience_years integer CHECK (experience_years >= 0),
  experience_years_state public.field_state NOT NULL DEFAULT 'not_stated',
  delivered_projects integer CHECK (delivered_projects >= 0),
  delivered_projects_state public.field_state NOT NULL DEFAULT 'not_stated',
  ongoing_projects integer CHECK (ongoing_projects >= 0),
  ongoing_projects_state public.field_state NOT NULL DEFAULT 'not_stated',
  notable_delivered_projects text[] NOT NULL DEFAULT '{}',
  notable_delivered_projects_state public.field_state NOT NULL DEFAULT 'not_stated',
  background text,
  background_state public.field_state NOT NULL DEFAULT 'not_stated',

  -- Timeline
  proposed_start_date_rera date,
  proposed_start_date_rera_state public.field_state NOT NULL DEFAULT 'not_stated',
  possession_confirmed_as_of date,
  possession_confirmed_as_of_state public.field_state NOT NULL DEFAULT 'not_stated',

  -- 3.3 — amenities beyond the catalog: displayed but never compared/scored.
  amenities_other text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-variant additions (servant room, floor plan page). Room dimensions get their own
-- child table below since a variant has several rooms.
ALTER TABLE public.configuration_variants
  ADD COLUMN IF NOT EXISTS servant_room_present boolean,
  ADD COLUMN IF NOT EXISTS servant_room_state public.field_state NOT NULL DEFAULT 'not_stated',
  ADD COLUMN IF NOT EXISTS floor_plan_page integer,
  ADD COLUMN IF NOT EXISTS floor_plan_page_state public.field_state NOT NULL DEFAULT 'not_stated';

ALTER TABLE public.configuration_variants
  DROP CONSTRAINT IF EXISTS configuration_variants_floor_plan_page_check;
ALTER TABLE public.configuration_variants
  ADD CONSTRAINT configuration_variants_floor_plan_page_check CHECK (floor_plan_page > 0) NOT VALID;
ALTER TABLE public.configuration_variants
  VALIDATE CONSTRAINT configuration_variants_floor_plan_page_check;

CREATE TABLE IF NOT EXISTS public.configuration_variant_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_variant_id uuid NOT NULL REFERENCES public.configuration_variants (id) ON DELETE CASCADE,
  room_type text NOT NULL,
  dimension_raw text,
  area_value numeric(10, 2) CHECK (area_value >= 0),
  area_unit public.area_unit,
  room_state public.field_state NOT NULL DEFAULT 'not_stated',
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS configuration_variant_rooms_variant_idx
  ON public.configuration_variant_rooms (configuration_variant_id);

-- 3.3 — amenity vocabulary (override O4). ~40 codes across 8 groups, per Part 3.3.
CREATE TABLE IF NOT EXISTS public.amenity_catalog (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  group_name text NOT NULL,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.amenity_catalog (code, display_name, group_name, sort_order) VALUES
  ('gym', 'Gymnasium', 'wellness', 10),
  ('yoga_deck', 'Yoga Deck', 'wellness', 20),
  ('spa', 'Spa', 'wellness', 30),
  ('salon', 'Salon', 'wellness', 40),
  ('steam_sauna', 'Steam & Sauna', 'wellness', 50),
  ('swimming_pool', 'Swimming Pool', 'water', 60),
  ('kids_pool', 'Kids Pool', 'water', 70),
  ('temperature_controlled_pool', 'Temperature-Controlled Pool', 'water', 80),
  ('jacuzzi', 'Jacuzzi', 'water', 90),
  ('indoor_games', 'Indoor Games', 'sports', 100),
  ('squash', 'Squash Court', 'sports', 110),
  ('tennis', 'Tennis Court', 'sports', 120),
  ('badminton', 'Badminton Court', 'sports', 130),
  ('cricket_net', 'Cricket Net', 'sports', 140),
  ('golf_simulator', 'Golf Simulator', 'sports', 150),
  ('skating_rink', 'Skating Rink', 'sports', 160),
  ('banquet_hall', 'Banquet Hall', 'social', 170),
  ('party_lawn', 'Party Lawn', 'social', 180),
  ('amphitheatre', 'Amphitheatre', 'social', 190),
  ('cafe', 'Cafe', 'social', 200),
  ('library', 'Library', 'social', 210),
  ('co_working', 'Co-working Space', 'social', 220),
  ('guest_rooms', 'Guest Rooms', 'social', 230),
  ('mini_theatre', 'Mini Theatre', 'social', 240),
  ('kids_play_area', 'Kids Play Area', 'family', 250),
  ('creche', 'Creche', 'family', 260),
  ('senior_citizen_zone', 'Senior Citizen Zone', 'family', 270),
  ('pet_zone', 'Pet Zone', 'family', 280),
  ('jogging_track', 'Jogging Track', 'outdoor', 290),
  ('landscaped_garden', 'Landscaped Garden', 'outdoor', 300),
  ('terrace_garden', 'Terrace Garden', 'outdoor', 310),
  ('ev_charging', 'EV Charging', 'outdoor', 320),
  ('cctv', 'CCTV', 'safety', 330),
  ('multi_tier_security', 'Multi-Tier Security', 'safety', 340),
  ('video_door_phone', 'Video Door Phone', 'safety', 350),
  ('fire_fighting', 'Fire Fighting System', 'safety', 360),
  ('gated_entry', 'Gated Entry', 'safety', 370),
  ('power_backup', 'Power Backup', 'building_services', 380),
  ('stp', 'Sewage Treatment Plant', 'building_services', 390),
  ('rainwater_harvesting', 'Rainwater Harvesting', 'building_services', 400),
  ('waste_management', 'Waste Management', 'building_services', 410),
  ('service_lift', 'Service Lift', 'building_services', 420),
  ('visitor_parking', 'Visitor Parking', 'building_services', 430)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order;

-- Zero producers write property_amenities today (confirmed against src/), so adding
-- this FK is safe with no backfill.
ALTER TABLE public.property_amenities
  DROP CONSTRAINT IF EXISTS property_amenities_amenity_code_fk;
ALTER TABLE public.property_amenities
  ADD CONSTRAINT property_amenities_amenity_code_fk
  FOREIGN KEY (amenity_code) REFERENCES public.amenity_catalog (code) ON DELETE RESTRICT;

-- 3.4 — specification vocabulary (override O4), seeded from §3.2's Construction block.
CREATE TABLE IF NOT EXISTS public.specification_catalog (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  group_name text NOT NULL,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.specification_catalog (code, display_name, group_name, sort_order) VALUES
  ('construction_quality', 'Construction Quality', 'construction', 10),
  ('flooring_type', 'Flooring Type', 'construction', 20),
  ('window_glazing', 'Window Glazing', 'construction', 30),
  ('bath_sanitary_fittings', 'Bath & Sanitary Fittings', 'construction', 40),
  ('vrv_ac_provision', 'VRV/AC Provision', 'construction', 50),
  ('geyser_provision', 'Geyser Provision', 'construction', 60)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order;

-- Zero producers write property_specifications today, same as amenities above.
ALTER TABLE public.property_specifications
  DROP CONSTRAINT IF EXISTS property_specifications_specification_code_fk;
ALTER TABLE public.property_specifications
  ADD CONSTRAINT property_specifications_specification_code_fk
  FOREIGN KEY (specification_code) REFERENCES public.specification_catalog (code) ON DELETE RESTRICT;

-- 3.5 — synonym table, explicit and testable (not implicit in prompt descriptions).
CREATE TABLE IF NOT EXISTS public.field_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_field text NOT NULL,
  synonym text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_field, synonym)
);

INSERT INTO public.field_synonyms (canonical_field, synonym) VALUES
  ('super_built_up', 'Saleable'),
  ('super_built_up', 'Sellable'),
  ('super_built_up', 'Super Area'),
  ('super_built_up', 'SBA'),
  ('super_built_up', 'Chargeable'),
  ('carpet', 'RERA Carpet'),
  ('carpet', 'Net Usable'),
  ('rate', 'Basic Rate'),
  ('rate', 'Base Rate'),
  ('rate', 'BSP'),
  ('total_units', 'No. of Apartments'),
  ('total_units', 'Total Homes'),
  ('total_floors', 'Storeys'),
  ('total_floors', 'Levels'),
  ('total_floors', 'G+N'),
  ('open_space', 'Open Area'),
  ('open_space', 'Green Cover'),
  ('plot_size', 'Land Parcel'),
  ('plot_size', 'Site Area')
ON CONFLICT (canonical_field, synonym) DO NOTHING;

-- Server-only, deny-by-default RLS, matching every other v2 table.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'configuration_variant_areas', 'property_publication_details',
    'configuration_variant_rooms', 'amenity_catalog', 'specification_catalog',
    'field_synonyms'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS update_property_publication_details_updated_at
  ON public.property_publication_details;
CREATE TRIGGER update_property_publication_details_updated_at
  BEFORE UPDATE ON public.property_publication_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
