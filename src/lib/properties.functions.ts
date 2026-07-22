import { createServerFn } from "@tanstack/react-start";
import type {
  Property,
  PropertyCategory,
  PropertyConfigurations,
  PropertyGallery,
} from "@/types/property";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";

// Columns needed to build a Property. Kept in one place so the public and admin
// readers can't drift apart.
const PROPERTY_COLUMNS =
  "id, slug, name, developer, category, tagline, image_url, size, size_numeric, super_built_up_area, carpet_area, location, state, city, status, configuration_summary, configurations, price_summary, possession, amenities, advantages, gallery, expert_note, is_published";

interface PropertyRow {
  id: string;
  slug: string;
  name: string;
  developer: string | null;
  category: string;
  tagline: string | null;
  image_url: string | null;
  size: string | null;
  size_numeric: number | null;
  super_built_up_area: string | null;
  carpet_area: string | null;
  location: string | null;
  state: string | null;
  city: string | null;
  status: string | null;
  configuration_summary: string | null;
  configurations: unknown;
  price_summary: string | null;
  possession: string | null;
  amenities: string[] | null;
  advantages: string[] | null;
  gallery: unknown;
  expert_note: string | null;
  is_published: boolean;
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
  const gallery = (row.gallery ?? {}) as Partial<PropertyGallery>;
  return {
    id: row.slug,
    name: row.name,
    developer: row.developer ?? "-",
    category: (row.category as PropertyCategory) ?? "Apartment",
    tagline: row.tagline ?? "",
    image: row.image_url ?? "",
    size: row.size ?? "-",
    sizeNumeric: row.size_numeric ?? 0,
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
  };
}

function toAdminProperty(row: PropertyRow): AdminProperty {
  return { ...toProperty(row), rowId: row.id, isPublished: row.is_published };
}

/** Public: every published property, ordered for stable rendering. */
export const getProperties = createServerFn({ method: "GET" }).handler(
  async (): Promise<Property[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .eq("is_published", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as PropertyRow[]).map(toProperty);
  },
);

/** Owner-only: all properties including unpublished, for the admin list. */
export const getAllPropertiesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<AdminProperty[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as PropertyRow[]).map(toAdminProperty);
  });
