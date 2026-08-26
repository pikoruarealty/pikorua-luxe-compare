import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import type {
  Property,
  PropertyCategory,
  PropertyConfigurations,
  PropertyGallery,
} from "@/types/property";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
import { parseNumeric } from "@/lib/property-derivations";

import maruti360View from "@/assets/maruti-360-view.jpg";
import maruti360Bedroom from "@/assets/maruti-360-bedroom.png";
import maruti360Pool from "@/assets/maruti-360-pool.png";
import maruti360PlayArea from "@/assets/maruti-360-play-area.png";
import fallbackPropertyImage from "@/assets/property-1.jpg";

const PROPERTY_COLUMNS =
  "id, slug, name, developer, category, tagline, image_url, size, size_numeric, super_built_up_area, carpet_area, location, state, city, status, configuration_summary, configurations, price_summary, possession, amenities, advantages, gallery, expert_note, is_published, plot_size, total_towers, total_floors, units_per_floor, total_units, available_bhk_types, rera_id, rera_url, proposed_start_date_rera, parking_levels, podium_structure, lifts_per_tower, open_space, geyser_heat_pump_provided, vrv_ac_provided, window_glazing, bath_sanitary_fittings, flooring_type, units_per_acre, construction_quality, internal_ceiling_height, clubhouse_size, developer_background, developer_experience_years, total_delivered_projects, ongoing_projects, notable_delivered_projects, possession_as_of";

interface PropertyRow {
  id: string;
  slug: string;
  name: string;
  developer?: string | null;
  category: string;
  tagline?: string | null;
  image_url?: string | null;
  size?: string | null;
  size_numeric?: number | null;
  super_built_up_area?: string | null;
  carpet_area?: string | null;
  location?: string | null;
  state?: string | null;
  city?: string | null;
  status?: string | null;
  configuration_summary?: string | null;
  configurations?: unknown;
  price_summary?: string | null;
  possession?: string | null;
  amenities?: string[] | null;
  advantages?: string[] | null;
  gallery?: unknown;
  expert_note?: string | null;
  is_published?: boolean;
  plot_size?: string | null;
  total_towers?: number | null;
  total_floors?: number | null;
  units_per_floor?: number | null;
  total_units?: number | null;
  available_bhk_types?: string | null;
  rera_id?: string | null;
  rera_url?: string | null;
  proposed_start_date_rera?: string | null;
  parking_levels?: number | null;
  podium_structure?: string | null;
  lifts_per_tower?: number | null;
  open_space?: string | null;
  geyser_heat_pump_provided?: string | null;
  vrv_ac_provided?: string | null;
  window_glazing?: string | null;
  bath_sanitary_fittings?: string | null;
  flooring_type?: string | null;
  units_per_acre?: string | null;
  construction_quality?: string | null;
  internal_ceiling_height?: string | null;
  clubhouse_size?: string | null;
  developer_background?: string | null;
  developer_experience_years?: number | null;
  total_delivered_projects?: number | null;
  ongoing_projects?: number | null;
  notable_delivered_projects?: string[] | null;
  possession_as_of?: string | null;
}

/** Admin-facing shape: the public Property plus row metadata the admin list needs. */
export interface AdminProperty extends Property {
  rowId: string;
  isPublished: boolean;
}

const EMPTY_GALLERY: PropertyGallery = {
  livingRoom: "",
  pool: "",
  clubhouse: "",
  masterBedroom: "",
};

// The public site keeps using the slug as `id` (URLs like /residence/ikebana and
// ?ids=<slug> predate the DB and must keep working).
function toProperty(row: PropertyRow): Property {
  const isMaruti =
    row.slug === "maruti-360" || (row.name && row.name.toLowerCase().includes("maruti 360"));
  let coverImg = row.image_url?.trim() || fallbackPropertyImage;
  if (isMaruti || coverImg.includes("maruti-360-exterior")) {
    coverImg = maruti360View;
  }

  const rawGallery = (row.gallery ?? {}) as Record<string, string>;
  const gallery: PropertyGallery = isMaruti
    ? {
        livingRoom: maruti360Bedroom,
        masterBedroom: maruti360Pool,
        pool: maruti360PlayArea,
        clubhouse: maruti360View,
      }
    : {
        livingRoom: rawGallery.livingRoom?.includes("maruti-360-exterior")
          ? maruti360Bedroom
          : (rawGallery.livingRoom ?? ""),
        masterBedroom: rawGallery.masterBedroom?.includes("maruti-360-exterior")
          ? maruti360Pool
          : (rawGallery.masterBedroom ?? ""),
        pool: rawGallery.pool?.includes("maruti-360-exterior")
          ? maruti360PlayArea
          : (rawGallery.pool ?? ""),
        clubhouse: rawGallery.clubhouse?.includes("maruti-360-exterior")
          ? maruti360View
          : (rawGallery.clubhouse ?? ""),
      };

  return {
    id: row.slug,
    name: row.name,
    developer: row.developer ?? "-",
    category: (row.category as PropertyCategory) ?? "Apartment",
    tagline: row.tagline ?? "",
    image: coverImg,
    size: row.size ?? "-",
    // Recompute from the area string rather than trusting the stored column:
    // rows written before the parseNumeric comma fix hold collapsed values
    // (a 3,200 sq ft home stored as 3), so deriving it on read heals them
    // without a data migration.
    sizeNumeric: parseNumeric(row.super_built_up_area ?? row.size) || (row.size_numeric ?? 0),
    superBuiltUpArea: row.super_built_up_area ?? "-",
    carpetArea: row.carpet_area ?? "-",
    location: row.location ?? "-",
    state: row.state ?? "",
    city: row.city ?? "",
    status: row.status ?? "-",
    configuration: row.configuration_summary ?? "",
    configurations: (row.configurations ?? {}) as PropertyConfigurations,
    pricePerSqft: row.price_summary ?? "Price on Request",
    possession: row.possession ?? "-",
    amenities: row.amenities ?? [],
    advantages: row.advantages ?? [],
    gallery: { ...EMPTY_GALLERY, ...gallery },
    expertNote: row.expert_note ?? "",
    plotSize: row.plot_size,
    totalTowers: row.total_towers,
    totalFloors: row.total_floors,
    unitsPerFloor: row.units_per_floor,
    totalUnits: row.total_units,
    availableBhkTypes: row.available_bhk_types,
    reraId: row.rera_id,
    reraUrl: row.rera_url,
    parkingLevels: row.parking_levels,
    podiumStructure: row.podium_structure,
    liftsPerTower: row.lifts_per_tower,
    openSpace: row.open_space,
    geyserHeatPumpProvided: row.geyser_heat_pump_provided,
    vrvAcProvided: row.vrv_ac_provided,
    windowGlazing: row.window_glazing,
    bathSanitaryFittings: row.bath_sanitary_fittings,
    flooringType: row.flooring_type,
    unitsPerAcre: row.units_per_acre,
    constructionQuality: row.construction_quality,
    internalCeilingHeight: row.internal_ceiling_height,
    clubhouseSize: row.clubhouse_size,
    proposedStartDateRera: row.proposed_start_date_rera,
    possessionAsOf: row.possession_as_of,
    developerBackground: row.developer_background,
    developerExperienceYears: row.developer_experience_years,
    totalDeliveredProjects: row.total_delivered_projects,
    ongoingProjects: row.ongoing_projects,
    notableDeliveredProjects: row.notable_delivered_projects,
  };
}

function toAdminProperty(row: PropertyRow): AdminProperty {
  return { ...toProperty(row), rowId: row.id, isPublished: Boolean(row.is_published) };
}

/** Owner-only: all properties including unpublished, for the admin list.
 *
 *  This is the last surviving V1 read in this module — the public/gated
 *  catalogue and residence-detail reads moved to V2 in Phase C5a. It stays
 *  because V1 remains the only property-creation path (see
 *  `property-crud.functions.ts`) until Phase C builds a V2-native create
 *  flow; the admin list has to keep showing what admins can still edit. */
export const getAllPropertiesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<AdminProperty[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .order("created_at", { ascending: true });
    if (error) throwSafeError("getAllPropertiesForAdmin", error, "Could not load properties");
    return (data as PropertyRow[]).map(toAdminProperty);
  });
