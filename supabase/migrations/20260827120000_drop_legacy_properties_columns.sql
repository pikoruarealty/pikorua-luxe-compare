-- Phase C, step 8 (final step of the V1/V2 property collapse): drop the
-- legacy-only columns from hosted Supabase's public.properties table.
--
-- Confirmed dead 2026-08-27: after this session's V1 code retirement
-- (property-crud.functions.ts, the v2: id-prefix bridge, V1 branches in
-- admin-submissions/developer-properties/customers.functions.ts, all deleted
-- and deployed as commit ba6d935, verified live), a grep across src/** found
-- zero remaining reads or writes to this table anywhere in the live app. The
-- only hits are five one-off historical scripts (republish-with-presentation,
-- migrate-property-images-to-gcs, migrate-properties, diagnose-slug-mismatch,
-- diagnose-shantigram), none invoked at runtime.
--
-- The real V2 catalogue lives on a separate, self-hosted Postgres (the VM's
-- own `db` service) — this table on hosted Supabase is the old V1 store,
-- kept only as a historical record until Supabase itself is decommissioned.
--
-- All 26 current rows were snapshotted to a local JSON file before this ran.
-- Columns kept untouched even though also unused (out of scope, lower risk
-- to leave alone): id, slug, name, category, configurations, price_summary,
-- is_published, created_by, current_publication_version_id, created_at,
-- updated_at.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.properties
  DROP COLUMN IF EXISTS developer,
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS size,
  DROP COLUMN IF EXISTS size_numeric,
  DROP COLUMN IF EXISTS super_built_up_area,
  DROP COLUMN IF EXISTS carpet_area,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS configuration_summary,
  DROP COLUMN IF EXISTS possession,
  DROP COLUMN IF EXISTS amenities,
  DROP COLUMN IF EXISTS advantages,
  DROP COLUMN IF EXISTS gallery,
  DROP COLUMN IF EXISTS expert_note,
  DROP COLUMN IF EXISTS plot_size,
  DROP COLUMN IF EXISTS total_towers,
  DROP COLUMN IF EXISTS total_floors,
  DROP COLUMN IF EXISTS units_per_floor,
  DROP COLUMN IF EXISTS total_units,
  DROP COLUMN IF EXISTS available_bhk_types,
  DROP COLUMN IF EXISTS rera_id,
  DROP COLUMN IF EXISTS rera_url,
  DROP COLUMN IF EXISTS proposed_start_date_rera,
  DROP COLUMN IF EXISTS parking_levels,
  DROP COLUMN IF EXISTS podium_structure,
  DROP COLUMN IF EXISTS lifts_per_tower,
  DROP COLUMN IF EXISTS open_space,
  DROP COLUMN IF EXISTS geyser_heat_pump_provided,
  DROP COLUMN IF EXISTS vrv_ac_provided,
  DROP COLUMN IF EXISTS window_glazing,
  DROP COLUMN IF EXISTS bath_sanitary_fittings,
  DROP COLUMN IF EXISTS flooring_type,
  DROP COLUMN IF EXISTS units_per_acre,
  DROP COLUMN IF EXISTS construction_quality,
  DROP COLUMN IF EXISTS internal_ceiling_height,
  DROP COLUMN IF EXISTS clubhouse_size,
  DROP COLUMN IF EXISTS developer_background,
  DROP COLUMN IF EXISTS developer_experience_years,
  DROP COLUMN IF EXISTS total_delivered_projects,
  DROP COLUMN IF EXISTS ongoing_projects,
  DROP COLUMN IF EXISTS notable_delivered_projects,
  DROP COLUMN IF EXISTS possession_as_of,
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;
