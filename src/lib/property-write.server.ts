import type { ConfigKey, PropertyCategory, PropertyConfigurations } from "@/types/property";
import { slug } from "./slug";
import {
  aggregateArea,
  buildPriceSummary,
  normalizePossession,
  parseNumeric,
  summariseConfiguration,
} from "./property-derivations";
import { CONFIG_BUCKETS, type PropertyFormValues } from "./property-schema";

const BUCKET_TO_CONFIG_KEY: Record<string, ConfigKey> = {
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
        price: nz(v.price),
        rate: nz(v.rate),
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
  const out = { bhk4: [], bhk5: [], penthouse: [], duplex: [] } as PropertyFormValues["configs"];
  for (const { key } of CONFIG_BUCKETS) {
    const variants = configurations[BUCKET_TO_CONFIG_KEY[key]] ?? [];
    out[key as keyof typeof out] = variants.map((v) => ({
      type: v.type ?? "",
      area: v.area ?? null,
      carpet: v.carpet ?? null,
      price: v.price ?? null,
      rate: v.rate ?? null,
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
  };
}
