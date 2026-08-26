/** C7: maps a developer's free-text amenity strings onto `amenity_catalog`
 *  codes. Exact/normalized matching only — real brochure extractions mix
 *  genuine amenities with floor-plan legend noise ("TOILET", "RECEPTION")
 *  and marketing phrases ("3 Reserved Car Parking"), so nothing here should
 *  be tempted to fuzzy-match a code onto text that was never an amenity.
 *  Anything that doesn't match stays visible (see `mergeAmenitiesOther`)
 *  rather than being silently dropped — this is the original plan's own
 *  design: "a 60-amenity brochure collapses into the vector; surplus goes to
 *  amenities_other, displayed but never compared and never scored." */

export interface AmenityCatalogEntry {
  code: string;
  displayName: string;
}

export interface AmenityMatch {
  code: string;
  /** The developer's own printed phrase ("Infinity Pool"), kept as the row's
   *  display text — distinct from the catalog's canonical name ("Swimming
   *  Pool"), which is what actually compares across properties. */
  rawText: string;
}

export interface AmenityMatchResult {
  matched: AmenityMatch[];
  unmatched: string[];
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Hand-written synonyms for the 43 seeded codes, informed by real OCR
 *  extraction samples. Keys are pre-normalized. Deliberately does not try to
 *  cover every possible phrasing — a missed synonym just falls through to
 *  `amenitiesOther`, which loses nothing (see file doc comment). */
const SYNONYMS: Record<string, string> = {
  gym: "gym",
  "yoga zone": "yoga_deck",
  "yoga area": "yoga_deck",
  "meditation zone": "yoga_deck",
  "meditation deck": "yoga_deck",
  "steam room": "steam_sauna",
  "steam and sauna": "steam_sauna",
  "sauna steam": "steam_sauna",
  pool: "swimming_pool",
  "infinity pool": "swimming_pool",
  "swimming pool for adults": "swimming_pool",
  "kid pool": "kids_pool",
  "kids swimming pool": "kids_pool",
  "childrens pool": "kids_pool",
  "children s pool": "kids_pool",
  "toddler pool": "kids_pool",
  "heated pool": "temperature_controlled_pool",
  "temperature controlled swimming pool": "temperature_controlled_pool",
  "indoor games room": "indoor_games",
  "indoor game zone": "indoor_games",
  "indoor games area": "indoor_games",
  squash: "squash",
  tennis: "tennis",
  badminton: "badminton",
  "cricket practice net": "cricket_net",
  "cricket pitch": "cricket_net",
  skating: "skating_rink",
  banquet: "banquet_hall",
  "banquet hall lawn": "banquet_hall",
  "party lawn area": "party_lawn",
  "open air theatre": "amphitheatre",
  amphitheater: "amphitheatre",
  cafe: "cafe",
  "coffee shop": "cafe",
  "reading room": "library",
  "co working space": "co_working",
  "coworking space": "co_working",
  "business center": "co_working",
  "business centre": "co_working",
  "guest suites": "guest_rooms",
  "mini theater": "mini_theatre",
  "home theatre": "mini_theatre",
  "screening room": "mini_theatre",
  "childrens play area": "kids_play_area",
  "children s play area": "kids_play_area",
  "kids play zone": "kids_play_area",
  "tot lot": "kids_play_area",
  "day care": "creche",
  "senior citizen area": "senior_citizen_zone",
  "senior citizen corner": "senior_citizen_zone",
  "elders zone": "senior_citizen_zone",
  "pet park": "pet_zone",
  "pet area": "pet_zone",
  "walking track": "jogging_track",
  "jogging walking track": "jogging_track",
  "jogging and walking track": "jogging_track",
  "landscape garden": "landscaped_garden",
  "sky garden": "terrace_garden",
  "ev charging station": "ev_charging",
  "electric vehicle charging": "ev_charging",
  "electric vehicle charging point": "ev_charging",
  "cctv surveillance": "cctv",
  "24x7 cctv": "cctv",
  "cctv camera": "cctv",
  "3 tier security": "multi_tier_security",
  "multi layered security": "multi_tier_security",
  "multi tier security system": "multi_tier_security",
  vdp: "video_door_phone",
  "fire safety": "fire_fighting",
  "fire fighting system": "fire_fighting",
  "gated community": "gated_entry",
  "dg backup": "power_backup",
  "100 power backup": "power_backup",
  "diesel generator backup": "power_backup",
  "sewage treatment plant": "stp",
  "garbage disposal": "waste_management",
  "solid waste management": "waste_management",
  "service elevator": "service_lift",
  "guest parking": "visitor_parking",
};

export function matchAmenities(
  rawAmenities: readonly string[],
  catalog: readonly AmenityCatalogEntry[],
): AmenityMatchResult {
  const byNormalizedName = new Map<string, string>();
  for (const entry of catalog) {
    byNormalizedName.set(normalize(entry.displayName), entry.code);
  }

  const matched: AmenityMatch[] = [];
  const unmatched: string[] = [];
  const matchedCodes = new Set<string>();
  for (const raw of rawAmenities) {
    const key = normalize(raw);
    const code = byNormalizedName.get(key) ?? SYNONYMS[key];
    if (code) {
      // A brochure often restates one amenity under several phrasings
      // ("Yoga Zone", "Meditation Zone", "YOGA DECK" all mean yoga_deck).
      // `property_amenities` has a UNIQUE (publication_version_id,
      // amenity_code) constraint, so only the first phrasing per code
      // becomes a row — later restatements are redundant, not new data.
      if (matchedCodes.has(code)) continue;
      matchedCodes.add(code);
      matched.push({ code, rawText: raw.trim() });
    } else {
      unmatched.push(raw.trim());
    }
  }
  return { matched, unmatched };
}

/** Folds unmatched amenity surplus into the existing (developer-typed)
 *  `amenitiesOther` free text, deduping case-insensitively against what's
 *  already there so a re-publish doesn't pile up the same overflow twice. */
export function mergeAmenitiesOther(
  existing: string | null,
  unmatched: readonly string[],
): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    parts.push(trimmed);
  };
  if (existing) {
    for (const part of existing.split(/[·\n,]/)) add(part);
  }
  for (const item of unmatched) add(item);
  return parts.length ? parts.join(" · ") : null;
}
