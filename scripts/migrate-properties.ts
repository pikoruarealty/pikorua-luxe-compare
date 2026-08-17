/**
 * One-time migration: seed public.properties from src/data/_raw.json and upload
 * the currently-bundled images to the `property-images` Storage bucket.
 *
 * Run once (idempotent — upserts on slug):  bun scripts/migrate-properties.ts
 *
 * Runs OUTSIDE Vite, so it cannot use `@/assets/*` imports. Image files are
 * resolved as plain filenames from src/assets via fs. Derivation logic is the
 * shared src/lib/property-derivations.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Property, PropertyCategory, PropertyConfigurations } from "../src/types/property";
import { CONFIG_KEYS } from "../src/types/property";
import { slug } from "../src/lib/slug";
import {
  type RawRow,
  DEFAULT_CITY,
  DEFAULT_STATE,
  summariseConfiguration,
  normalizePossession,
  parseNumeric,
  aggregateArea,
  buildPriceSummary,
} from "../src/lib/property-derivations";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "src", "assets");
const BUCKET = "property-images";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Shared gallery defaults (used when a property has no per-slot override).
const SHARED_GALLERY = {
  livingRoom: "gallery-living.jpg",
  pool: "gallery-pool.jpg",
  clubhouse: "gallery-clubhouse.jpg",
  masterBedroom: "gallery-bedroom.jpg",
};
const FALLBACK_COVERS = ["property-1.jpg", "property-2.jpg", "property-3.jpg", "property-4.jpg"];

type Slot = "livingRoom" | "pool" | "clubhouse" | "masterBedroom";
interface ImageOverride {
  cover: string;
  gallery: Partial<Record<Slot, string>>;
}

// Per-slug image filenames (plain filenames instead of Vite asset imports).
const IMAGE_MAP: Record<string, ImageOverride> = {
  anamika: {
    cover: "anamika-cover.jpg",
    gallery: {
      livingRoom: "anamika-hall.png",
      masterBedroom: "anamika-bedroom.jpg",
      pool: "anamika-exterior.jpg",
      clubhouse: "anamika-cover.jpg",
    },
  },
  anurita: {
    cover: "anurita-cover.jpg",
    gallery: {
      livingRoom: "anurita-living.jpg",
      masterBedroom: "anurita-bedroom.jpg",
      pool: "anurita-exterior.jpg",
      clubhouse: "anurita-cover.jpg",
    },
  },
  atman: {
    cover: "atman-exterior.jpg",
    gallery: {
      livingRoom: "atman-lobby.jpg",
      masterBedroom: "atman-lobby.jpg",
      pool: "atman-exterior.jpg",
      clubhouse: "atman-lobby.jpg",
    },
  },
  avant: {
    cover: "avant-exterior.png",
    gallery: {
      livingRoom: "avant-hall.jpg",
      masterBedroom: "avant-hall.jpg",
      pool: "avant-park.avif",
      clubhouse: "avant-park.avif",
    },
  },
  belagio: {
    cover: "belagio-exterior.jpg",
    gallery: {
      livingRoom: "belagio-library.jpg",
      masterBedroom: "belagio-tower.jpg",
      pool: "belagio-pool.jpg",
      clubhouse: "belagio-library.jpg",
    },
  },
  belrosa: {
    cover: "belrosa-exterior.jpg",
    gallery: {
      livingRoom: "belrosa-hall.jpg",
      masterBedroom: "belrosa-dining.jpg",
      pool: "belrosa-view.jpg",
      clubhouse: "belrosa-view.jpg",
    },
  },
  capstone: {
    cover: "capstone-aerial.jpg",
    gallery: {
      livingRoom: "capstone-living.jpg",
      masterBedroom: "capstone-courtyard.jpg",
      pool: "capstone-courtyard.jpg",
      clubhouse: "capstone-gameroom.jpg",
    },
  },
  "eminence-96": {
    cover: "eminence-96-exterior.png",
    gallery: {
      livingRoom: "eminence-96-lounge.webp",
      masterBedroom: "eminence-96-lounge.webp",
      pool: "eminence-96-pool.webp",
      clubhouse: "eminence-96-gym.webp",
    },
  },
  ikebana: {
    cover: "ikebana-exterior.png",
    gallery: {
      livingRoom: "ikebana-living.png",
      masterBedroom: "ikebana-bedroom.png",
      pool: "ikebana-exterior.png",
      clubhouse: "ikebana-wardrobe.png",
    },
  },
  "goyal-riviera-select": {
    cover: "goyal-riviera-exterior.jpeg",
    gallery: {
      livingRoom: "goyal-riviera-balcony.jpeg",
      masterBedroom: "goyal-riviera-balcony.jpeg",
      pool: "goyal-riviera-balcony.jpeg",
      clubhouse: "goyal-riviera-exterior.jpeg",
    },
  },
  amaris: {
    cover: "amaris-clubhouse.jpeg",
    gallery: {
      livingRoom: "amaris-balcony.jpeg",
      masterBedroom: "amaris-balcony.jpeg",
      pool: "amaris-aerial.jpeg",
      clubhouse: "amaris-clubhouse.jpeg",
    },
  },
  "satyamev-luxor": {
    cover: "satyamev-luxor-towers.jpeg",
    gallery: {
      livingRoom: "satyamev-luxor-courtyard.jpeg",
      masterBedroom: "satyamev-luxor-courtyard.jpeg",
      pool: "satyamev-luxor-firepit.jpeg",
      clubhouse: "satyamev-luxor-kids.jpeg",
    },
  },
  "the-park": {
    cover: "the-park-tower-dusk.jpeg",
    gallery: {
      livingRoom: "the-park-living.jpeg",
      masterBedroom: "the-park-living.jpeg",
      pool: "the-park-exterior.jpeg",
      clubhouse: "the-park-exterior.jpeg",
    },
  },
  rashmi: {
    cover: "rashmi-exterior.jpeg",
    gallery: {
      livingRoom: "rashmi-living.jpeg",
      masterBedroom: "rashmi-living.jpeg",
      pool: "rashmi-balcony.jpeg",
      clubhouse: "rashmi-balcony.jpeg",
    },
  },
  "kalrav-alpines": {
    cover: "kalrav-alpines-exterior.jpg",
    gallery: {
      pool: "kalrav-alpines-exterior.jpg",
      clubhouse: "kalrav-alpines-exterior.jpg",
    },
  },
  kimana: {
    cover: "kimana-towers.jpg",
    gallery: {
      livingRoom: "kimana-lobby.jpg",
      masterBedroom: "kimana-tower-dusk.jpg",
      pool: "kimana-towers.jpg",
      clubhouse: "kimana-lobby.jpg",
    },
  },
  "maruti-360": {
    cover: "maruti-360-exterior.jpeg",
    gallery: {
      livingRoom: "maruti-360-view.jpg",
      masterBedroom: "maruti-360-bedroom.png",
      pool: "maruti-360-pool.png",
      clubhouse: "maruti-360-play-area.png",
    },
  },
  "venus-universe": {
    cover: "venus-universe-1.jpeg",
    gallery: {
      livingRoom: "venus-universe-3.jpeg",
      masterBedroom: "venus-universe-3.jpeg",
      pool: "venus-universe-2.jpeg",
      clubhouse: "venus-universe-4.jpeg",
    },
  },
  northpark: {
    cover: "northpark-exterior.jpg",
    gallery: {
      livingRoom: "northpark-hall.jpg",
      masterBedroom: "northpark-bedroom.jpg",
      pool: "northpark-bungalow.jpg",
      clubhouse: "northpark-dining.jpg",
    },
  },
  pashmina: {
    cover: "pashmina-cover.jpg",
    gallery: {
      livingRoom: "pashmina-living.png",
      masterBedroom: "pashmina-bedroom.jpeg",
      pool: "pashmina-dining.jpg",
      clubhouse: "pashmina-dining.jpg",
    },
  },
  "shaligram-luxuria": {
    cover: "shaligram-luxuria-1.jpg",
    gallery: {
      livingRoom: "shaligram-luxuria-1.jpg",
      masterBedroom: "shaligram-luxuria-2-gym.jpg",
      pool: "shaligram-luxuria-3.jpg",
      clubhouse: "shaligram-luxuria-2-gym.jpg",
    },
  },
  "swati-senor": {
    cover: "swati-senor-gallery.jpg",
    gallery: {
      livingRoom: "swati-senor-hall.jpg",
      masterBedroom: "swati-senor-bedroom.jpg",
      pool: "swati-senor-pool.jpg",
      clubhouse: "swati-senor-dining.jpg",
    },
  },
  "triveni-84": {
    cover: "triveni-84-exterior.jpg",
    gallery: {
      livingRoom: "triveni-84-banquet.jpeg",
      masterBedroom: "triveni-84-yoga.jpeg",
      pool: "triveni-84-gym.jpeg",
      clubhouse: "triveni-84-kids.jpeg",
    },
  },
  vaikunth: {
    cover: "vaikunth-exterior.png",
    gallery: {
      livingRoom: "vaikunth-bungalow.png",
      masterBedroom: "vaikunth-bungalow.png",
      pool: "vaikunth-pool.png",
      clubhouse: "vaikunth-pool.png",
    },
  },
  "godrej-altus": {
    cover: "godrej-altus-facade.jpg",
    gallery: {
      livingRoom: "godrej-altus-balcony.jpg",
      masterBedroom: "godrej-altus-balcony.jpg",
      pool: "godrej-altus-pool.jpg",
      clubhouse: "godrej-altus-facade.jpg",
    },
  },
  westpark: {
    cover: "westpark-villa.jpeg",
    gallery: {
      livingRoom: "westpark-bungalow.jpg",
      masterBedroom: "westpark-bungalow.jpg",
      pool: "westpark-villa.jpeg",
      clubhouse: "westpark-bungalow.jpg",
    },
  },
};

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const missingFiles: string[] = [];

/** Upload one bundled asset file into the property's Storage folder; return its public URL. */
async function uploadImage(slugId: string, filename: string): Promise<string | null> {
  const abs = path.join(ASSETS, filename);
  if (!fs.existsSync(abs)) {
    missingFiles.push(filename);
    return null;
  }
  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const buffer = fs.readFileSync(abs);
  const objectPath = `${slugId}/${filename}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true });
  if (error) {
    console.warn(`  ! upload failed for ${objectPath}: ${error.message}`);
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

/** Build the Property object for the DB row. */
function deriveProperty(r: RawRow, index: number): { slugId: string; property: Property } {
  const cfgs: PropertyConfigurations = {};
  for (const k of CONFIG_KEYS) {
    const c = r.configs[k];
    if (c) cfgs[k] = c;
  }
  const category = (r.type as PropertyCategory) || "Apartment";
  const isPlot = category === "Plots" || category === "Bungalow";

  const superBuiltUpArea = isPlot
    ? r.plotSuper
      ? `${r.plotSuper} Plot`
      : "-"
    : aggregateArea(cfgs, "area");
  const carpetArea = isPlot
    ? r.plotCarpet
      ? `${r.plotCarpet} Built-up`
      : "-"
    : aggregateArea(cfgs, "carpet");
  const sizeDisplay = superBuiltUpArea !== "-" ? superBuiltUpArea : carpetArea;

  const slugId = slug(r.name);

  const property: Property = {
    id: slugId, // placeholder; DB row uses a real uuid, slug column keeps this value
    name: r.name,
    developer: r.developer || "-",
    category,
    // No brochure source for a marketing tagline or an expert take, so these
    // stay blank instead of being invented — a gap publishes as not_stated,
    // never inferred. `amenities`/`advantages` keep real per-project data
    // from the brochure (r.amenities / r.highlights) where present.
    tagline: "",
    image: FALLBACK_COVERS[index % FALLBACK_COVERS.length],
    size: sizeDisplay,
    sizeNumeric: parseNumeric(superBuiltUpArea),
    superBuiltUpArea,
    carpetArea,
    location: r.location || "-",
    city: r.city?.trim() || DEFAULT_CITY,
    state: r.state?.trim() || DEFAULT_STATE,
    status: r.status || "-",
    configuration: summariseConfiguration(cfgs, category),
    configurations: cfgs,
    pricePerSqft: buildPriceSummary(cfgs),
    possession: normalizePossession(r.possession),
    amenities: r.amenities?.length ? r.amenities : [],
    advantages: r.highlights?.length ? r.highlights : [],
    gallery: { livingRoom: "", pool: "", clubhouse: "", masterBedroom: "" },
    expertNote: "",
  };
  return { slugId, property };
}

async function main() {
  const rawPath = path.join(ROOT, "src", "data", "_raw.json");
  const rows = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawRow[];
  console.log(`Read ${rows.length} properties from _raw.json\n`);

  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const { slugId, property } = deriveProperty(r, i);
    process.stdout.write(`[${i + 1}/${rows.length}] ${property.name} (${slugId}) … `);

    // Resolve image filenames (override → shared default fallback).
    const ov = IMAGE_MAP[slugId];
    const coverFile = ov?.cover ?? FALLBACK_COVERS[i % FALLBACK_COVERS.length];
    const gallerySlots: Record<Slot, string> = {
      livingRoom: ov?.gallery.livingRoom ?? SHARED_GALLERY.livingRoom,
      pool: ov?.gallery.pool ?? SHARED_GALLERY.pool,
      clubhouse: ov?.gallery.clubhouse ?? SHARED_GALLERY.clubhouse,
      masterBedroom: ov?.gallery.masterBedroom ?? SHARED_GALLERY.masterBedroom,
    };

    // Upload cover + gallery, capture public URLs.
    const imageUrl = await uploadImage(slugId, coverFile);
    const galleryUrls: Record<Slot, string> = {
      livingRoom: (await uploadImage(slugId, gallerySlots.livingRoom)) ?? "",
      pool: (await uploadImage(slugId, gallerySlots.pool)) ?? "",
      clubhouse: (await uploadImage(slugId, gallerySlots.clubhouse)) ?? "",
      masterBedroom: (await uploadImage(slugId, gallerySlots.masterBedroom)) ?? "",
    };

    const dbRow = {
      id: crypto.randomUUID(),
      slug: slugId,
      name: property.name,
      developer: property.developer,
      category: property.category,
      tagline: property.tagline,
      image_url: imageUrl,
      size: property.size,
      size_numeric: property.sizeNumeric,
      super_built_up_area: property.superBuiltUpArea,
      carpet_area: property.carpetArea,
      location: property.location,
      state: property.state,
      city: property.city,
      status: property.status,
      configuration_summary: property.configuration,
      configurations: property.configurations,
      price_summary: property.pricePerSqft,
      possession: property.possession,
      amenities: property.amenities,
      advantages: property.advantages,
      gallery: galleryUrls,
      expert_note: property.expertNote,
      is_published: true,
    };

    const { error } = await supabase
      .from("properties")
      .upsert(dbRow, { onConflict: "slug", ignoreDuplicates: false });
    if (error) {
      console.log(`FAILED: ${error.message}`);
    } else {
      inserted++;
      console.log("ok");
    }
  }

  console.log(`\nDone. Upserted ${inserted}/${rows.length} properties.`);
  if (missingFiles.length) {
    console.warn(`\nMissing image files (skipped): ${[...new Set(missingFiles)].join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
