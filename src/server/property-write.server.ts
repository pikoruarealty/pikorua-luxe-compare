import type { ConfigKey, PropertyCategory, PropertyConfigurations } from "@/types/property";
import { slug } from "@/lib/slug";
import {
  aggregateArea,
  buildPriceSummary,
  normalizePossession,
  parseNumeric,
  summariseConfiguration,
} from "@/lib/property-derivations";
import { CONFIG_BUCKETS, type PropertyFormValues } from "@/lib/property-schema";

const BUCKET_TO_CONFIG_KEY: Record<string, ConfigKey> = {
  bhk3: "3 BHK",
  bhk4: "4 BHK",
  bhk5: "5 BHK",
  penthouse: "Penthouse",
  duplex: "Duplex",
};

/** Drop blank strings so empty form inputs are stored as null, not "". */
const nz = (v: string | null | undefined): string | null => {
  const t = (v ?? "").toString().trim();
  return t.length ? t : null;
};

/** Same, but for integer-column inputs — a text field the admin left blank
 *  or typed something non-numeric into becomes null, not 0 or NaN. */
const nzInt = (v: string | null | undefined): number | null => {
  const t = nz(v);
  if (t === null) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

/** Form bucket arrays → PropertyConfigurations, omitting buckets with no variants. */
export function toConfigurations(configs: PropertyFormValues["configs"]): PropertyConfigurations {
  const out: PropertyConfigurations = {};
  for (const { key } of CONFIG_BUCKETS) {
    const variants = configs[key as keyof typeof configs] ?? [];
    const cleaned = variants
      .map((v) => ({
        ...(nz(v.type) ? { type: nz(v.type) as string } : {}),
        area: nz(v.area),
        carpet: nz(v.carpet),
        builtUpArea: nz(v.builtUpArea),
        price: nz(v.price),
        rate: nz(v.rate),
        bathrooms: nz(v.bathrooms),
        balconies: nz(v.balconies),
        servantRoom: nz(v.servantRoom),
        livingArea: nz(v.livingArea),
        kitchen: nz(v.kitchen),
        bedroom1: nz(v.bedroom1),
        bedroom2: nz(v.bedroom2),
        bedroom3: nz(v.bedroom3),
        bedroom4: nz(v.bedroom4),
        bedroom5: nz(v.bedroom5),
      }))
      // A variant with nothing filled in is noise — don't persist it.
      .filter((v) => Object.values(v).some((x) => x !== null && x !== ""));
    if (cleaned.length) out[BUCKET_TO_CONFIG_KEY[key]] = cleaned;
  }
  return out;
}

/** PropertyConfigurations → form bucket arrays (inverse of toConfigurations). */
export function toFormConfigs(configurations: PropertyConfigurations) {
  const out = {
    bhk3: [],
    bhk4: [],
    bhk5: [],
    penthouse: [],
    duplex: [],
  } as PropertyFormValues["configs"];
  for (const { key } of CONFIG_BUCKETS) {
    const variants = configurations[BUCKET_TO_CONFIG_KEY[key]] ?? [];
    out[key as keyof typeof out] = variants.map((v) => ({
      type: v.type ?? "",
      area: v.area ?? null,
      carpet: v.carpet ?? null,
      builtUpArea: v.builtUpArea ?? null,
      price: v.price ?? null,
      rate: v.rate ?? null,
      bathrooms: v.bathrooms ?? null,
      balconies: v.balconies ?? null,
      servantRoom: v.servantRoom ?? null,
      livingArea: v.livingArea ?? null,
      kitchen: v.kitchen ?? null,
      bedroom1: v.bedroom1 ?? null,
      bedroom2: v.bedroom2 ?? null,
      bedroom3: v.bedroom3 ?? null,
      bedroom4: v.bedroom4 ?? null,
      bedroom5: v.bedroom5 ?? null,
    }));
  }
  return out;
}

export interface PropertyRowInsert {
  slug: string;
  name: string;
  developer: string | null;
  category: string;
  tagline: string | null;
  image_url: string | null;
  size: string | null;
  size_numeric: number;
  super_built_up_area: string | null;
  carpet_area: string | null;
  location: string | null;
  state: string | null;
  city: string | null;
  status: string | null;
  configuration_summary: string;
  configurations: PropertyConfigurations;
  price_summary: string;
  possession: string;
  amenities: string[];
  advantages: string[];
  gallery: Record<string, string>;
  expert_note: string | null;
  is_published: boolean;
  plot_size: string | null;
  total_towers: number | null;
  total_floors: number | null;
  units_per_floor: number | null;
  total_units: number | null;
  available_bhk_types: string | null;
  rera_id: string | null;
  rera_url: string | null;
  proposed_start_date_rera: string | null;
  parking_levels: number | null;
  podium_structure: string | null;
  lifts_per_tower: number | null;
  open_space: string | null;
  geyser_heat_pump_provided: string | null;
  vrv_ac_provided: string | null;
  window_glazing: string | null;
  bath_sanitary_fittings: string | null;
  flooring_type: string | null;
  units_per_acre: string | null;
  construction_quality: string | null;
  internal_ceiling_height: string | null;
  clubhouse_size: string | null;
  developer_background: string | null;
  developer_experience_years: number | null;
  total_delivered_projects: number | null;
  ongoing_projects: number | null;
  notable_delivered_projects: string[];
  possession_as_of: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Property coordinates are derived from trusted form fields at write time.
 * A geocoder outage must not prevent an owner from saving a property. */
export async function addPropertyCoordinates(
  row: PropertyRowInsert,
  input: PropertyFormValues,
): Promise<PropertyRowInsert> {
  const address = [input.location, input.city, input.state]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  if (address.length < 3) return { ...row, latitude: null, longitude: null };

  const { geocodeAddress } = await import("@/server/geocode.server");
  const point = await geocodeAddress(address);
  return {
    ...row,
    latitude: point?.lat ?? null,
    longitude: point?.lon ?? null,
  };
}

/**
 * The ONE place a properties row is built from admin input. Recomputes every
 * derived display field so owner-direct edits and approved developer
 * submissions can never diverge in behaviour.
 */
export function buildPropertyRow(
  input: PropertyFormValues,
  slugOverride?: string,
): PropertyRowInsert {
  const configurations = toConfigurations(input.configs);
  const category = input.category as PropertyCategory;
  const isPlot = category === "Plots" || category === "Bungalow";

  const superBuiltUpArea = isPlot
    ? nz(input.plotSuperArea)
      ? `${nz(input.plotSuperArea)} Plot`
      : "-"
    : aggregateArea(configurations, "area");
  const carpetArea = isPlot
    ? nz(input.plotCarpetArea)
      ? `${nz(input.plotCarpetArea)} Built-up`
      : "-"
    : aggregateArea(configurations, "carpet");
  const sizeDisplay = superBuiltUpArea !== "-" ? superBuiltUpArea : carpetArea;

  return {
    slug: slugOverride ?? slug(input.name),
    name: input.name.trim(),
    developer: nz(input.developer) ?? "-",
    category,
    tagline: nz(input.tagline),
    image_url: nz(input.imageUrl),
    size: sizeDisplay,
    size_numeric: parseNumeric(superBuiltUpArea),
    super_built_up_area: superBuiltUpArea,
    carpet_area: carpetArea,
    location: nz(input.location) ?? "-",
    state: nz(input.state) ?? "",
    city: nz(input.city) ?? "",
    status: nz(input.status) ?? "-",
    configuration_summary: summariseConfiguration(configurations, category),
    configurations,
    price_summary: buildPriceSummary(configurations),
    possession: normalizePossession(input.possession),
    amenities: input.amenities.map((a) => a.trim()).filter(Boolean),
    advantages: input.advantages.map((a) => a.trim()).filter(Boolean),
    gallery: {
      livingRoom: input.gallery?.livingRoom ?? "",
      pool: input.gallery?.pool ?? "",
      clubhouse: input.gallery?.clubhouse ?? "",
      masterBedroom: input.gallery?.masterBedroom ?? "",
    },
    expert_note: nz(input.expertNote),
    is_published: input.isPublished,
    plot_size: nz(input.plotSize),
    total_towers: nzInt(input.totalTowers),
    total_floors: nzInt(input.totalFloors),
    units_per_floor: nzInt(input.unitsPerFloor),
    total_units: nzInt(input.totalUnits),
    available_bhk_types: nz(input.availableBhkTypes),
    rera_id: nz(input.reraId),
    rera_url: nz(input.reraUrl),
    proposed_start_date_rera: nz(input.proposedStartDateRera),
    parking_levels: nzInt(input.parkingLevels),
    podium_structure: nz(input.podiumStructure),
    lifts_per_tower: nzInt(input.liftsPerTower),
    open_space: nz(input.openSpace),
    geyser_heat_pump_provided: nz(input.geyserHeatPumpProvided),
    vrv_ac_provided: nz(input.vrvAcProvided),
    window_glazing: nz(input.windowGlazing),
    bath_sanitary_fittings: nz(input.bathSanitaryFittings),
    flooring_type: nz(input.flooringType),
    units_per_acre: nz(input.unitsPerAcre),
    construction_quality: nz(input.constructionQuality),
    internal_ceiling_height: nz(input.internalCeilingHeight),
    clubhouse_size: nz(input.clubhouseSize),
    developer_background: nz(input.developerBackground),
    developer_experience_years: nzInt(input.developerExperienceYears),
    total_delivered_projects: nzInt(input.totalDeliveredProjects),
    ongoing_projects: nzInt(input.ongoingProjects),
    notable_delivered_projects: input.notableDeliveredProjects.map((s) => s.trim()).filter(Boolean),
    possession_as_of: nz(input.possessionAsOf),
    latitude: null,
    longitude: null,
  };
}
