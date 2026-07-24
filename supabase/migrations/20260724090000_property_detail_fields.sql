-- Adds the property-detail comparison fields built on the frontend this
-- session (Project Structure, RERA, Construction & Amenities, Developer,
-- and the possession-countdown anchor date). All nullable/optional so
-- existing rows keep working unchanged until admins fill them in.

ALTER TABLE public.properties
  -- Project structure
  ADD COLUMN IF NOT EXISTS plot_size text,
  ADD COLUMN IF NOT EXISTS total_towers integer,
  ADD COLUMN IF NOT EXISTS total_floors integer,
  ADD COLUMN IF NOT EXISTS units_per_floor integer,
  ADD COLUMN IF NOT EXISTS total_units integer,
  ADD COLUMN IF NOT EXISTS available_bhk_types text,

  -- RERA registration
  ADD COLUMN IF NOT EXISTS rera_id text,
  ADD COLUMN IF NOT EXISTS rera_url text,
  ADD COLUMN IF NOT EXISTS proposed_start_date_rera text,

  -- Construction & amenities
  ADD COLUMN IF NOT EXISTS parking_levels integer,
  ADD COLUMN IF NOT EXISTS podium_structure text,
  ADD COLUMN IF NOT EXISTS lifts_per_tower integer,
  ADD COLUMN IF NOT EXISTS open_space text,
  ADD COLUMN IF NOT EXISTS geyser_heat_pump_provided text,
  ADD COLUMN IF NOT EXISTS vrv_ac_provided text,
  ADD COLUMN IF NOT EXISTS window_glazing text,
  ADD COLUMN IF NOT EXISTS bath_sanitary_fittings text,
  ADD COLUMN IF NOT EXISTS flooring_type text,
  ADD COLUMN IF NOT EXISTS units_per_acre text,
  ADD COLUMN IF NOT EXISTS construction_quality text,
  ADD COLUMN IF NOT EXISTS internal_ceiling_height text,
  ADD COLUMN IF NOT EXISTS clubhouse_size text,

  -- Developer track record
  ADD COLUMN IF NOT EXISTS developer_background text,
  ADD COLUMN IF NOT EXISTS developer_experience_years integer,
  ADD COLUMN IF NOT EXISTS total_delivered_projects integer,
  ADD COLUMN IF NOT EXISTS ongoing_projects integer,
  ADD COLUMN IF NOT EXISTS notable_delivered_projects text[] NOT NULL DEFAULT '{}',

  -- Possession-countdown anchor: the date the `possession` duration
  -- ("1 Year", "9 Months") was last confirmed accurate.
  ADD COLUMN IF NOT EXISTS possession_as_of date;
