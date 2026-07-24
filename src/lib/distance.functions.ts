import { createServerFn } from "@tanstack/react-start";

interface GeoPoint {
  lat: number;
  lon: number;
}

// Swap this cache for a stored lat/lng column once properties have real
// coordinates — until then this avoids re-geocoding the same property's
// address on every distance request within this server's lifetime.
const propertyGeoCache = new Map<string, GeoPoint | null>();

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Nominatim's usage policy caps free requests at ~1/sec and requires a
// descriptive User-Agent identifying the calling app — this throttle and
// header keep us inside that policy.
let lastCallAt = 0;
async function throttledFetch(url: string): Promise<Response> {
  const wait = Math.max(0, lastCallAt + 1100 - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
  return fetch(url, {
    headers: { "User-Agent": "PikoruaLuxuryCompare/1.0 (distance-estimate feature)" },
  });
}

// Common informal spellings in local address text that OpenStreetMap's index
// doesn't recognise — add to this as more come up rather than leaving a
// property to silently fail to geocode over one word.
const SPELLING_FIXES: [RegExp, string][] = [[/\biskon\b/gi, "Iskcon"]];

function normalizeAddress(address: string): string {
  return SPELLING_FIXES.reduce((s, [pattern, fix]) => s.replace(pattern, fix), address);
}

async function geocode(rawAddress: string): Promise<GeoPoint | null> {
  const address = normalizeAddress(rawAddress);
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(address)}`;
  try {
    const res = await throttledFetch(url);
    if (!res.ok) return null;
    const results = (await res.json()) as { lat: string; lon: string }[];
    if (!results.length) return null;
    const lat = parseFloat(results[0].lat);
    const lon = parseFloat(results[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

async function geocodeProperty(id: string, address: string): Promise<GeoPoint | null> {
  if (propertyGeoCache.has(id)) return propertyGeoCache.get(id) ?? null;
  const point = await geocode(address);
  propertyGeoCache.set(id, point);
  return point;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface DistanceInput {
  address: string;
  properties: { id: string; address: string }[];
}

/** Distance result per property id — null means that property's address
 *  couldn't be geocoded; "unlocated" (not per-property, applied to all) means
 *  the visitor's own address couldn't be found. */
export type DistanceResult =
  { ok: true; distancesKm: Record<string, number | null> } | { ok: false; reason: "unlocated" };

/** Server-only: geocodes the visitor's address and each compared property's
 *  address, then returns straight-line distances in km. Coordinates never
 *  reach the client — only the resulting numbers — so no map or exact
 *  location is ever exposed. */
export const calculatePropertyDistances = createServerFn({ method: "POST" })
  .inputValidator((data: DistanceInput) => {
    if (!data || typeof data.address !== "string" || data.address.trim().length < 3) {
      throw new Error("Enter a more complete address");
    }
    if (!Array.isArray(data.properties) || data.properties.length === 0) {
      throw new Error("No properties to compare");
    }
    return {
      address: data.address.trim().slice(0, 200),
      properties: data.properties.slice(0, 3).map((p) => ({ id: p.id, address: p.address })),
    };
  })
  .handler(async ({ data }): Promise<DistanceResult> => {
    const origin = await geocode(data.address);
    if (!origin) return { ok: false, reason: "unlocated" };

    const distancesKm: Record<string, number | null> = {};
    for (const p of data.properties) {
      const point = await geocodeProperty(p.id, p.address);
      distancesKm[p.id] = point ? Math.round(haversineKm(origin, point) * 10) / 10 : null;
    }
    return { ok: true, distancesKm };
  });
