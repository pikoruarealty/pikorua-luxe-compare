import { createServerFn } from "@tanstack/react-start";

interface GeoPoint {
  lat: number;
  lon: number;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

/** Server-only address autocomplete. Coordinates are never returned. */
export const suggestAddresses = createServerFn({ method: "GET" })
  .inputValidator((data: { query: string }) => {
    if (!data || typeof data.query !== "string") throw new Error("Missing query");
    return { query: data.query.trim().slice(0, 200) };
  })
  .handler(async ({ data }): Promise<{ suggestions: string[] }> => {
    if (data.query.length < 3) return { suggestions: [] };
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.GEOCODE, `ip:${await clientIp()}`);

    const { searchAddresses } = await import("@/server/geocode.server");
    return { suggestions: await searchAddresses(data.query) };
  });

interface DistanceInput {
  address: string;
  propertyIds: string[];
}

interface PropertyCoordinateRow {
  slug: string;
  latitude: number | null;
  longitude: number | null;
}

const PROPERTY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type DistanceResult =
  | { ok: true; distancesKm: Record<string, number | null> }
  | { ok: false; reason: "unlocated" };

/** Geocodes only the visitor's address and reads trusted property coordinates
 * from the database. Only resulting distances reach the browser. */
export const calculatePropertyDistances = createServerFn({ method: "POST" })
  .inputValidator((data: DistanceInput) => {
    if (!data || typeof data.address !== "string" || data.address.trim().length < 3) {
      throw new Error("Enter a more complete address");
    }
    if (!Array.isArray(data.propertyIds) || data.propertyIds.length === 0) {
      throw new Error("No properties to compare");
    }
    const propertyIds = [...new Set(data.propertyIds.slice(0, 3))];
    if (propertyIds.some((id) => typeof id !== "string" || !PROPERTY_SLUG_RE.test(id))) {
      throw new Error("Invalid property id");
    }
    return { address: data.address.trim().slice(0, 200), propertyIds };
  })
  .handler(async ({ data }): Promise<DistanceResult> => {
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.GEOCODE, `ip:${await clientIp()}`);

    const { geocodeAddress } = await import("@/server/geocode.server");
    const origin = await geocodeAddress(data.address);
    if (!origin) return { ok: false, reason: "unlocated" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rawRows, error } = await supabaseAdmin
      .from("properties")
      .select("slug, latitude, longitude")
      .in("slug", data.propertyIds)
      .eq("is_published", true);
    if (error) throw new Error("Could not load property locations");

    const rows = (rawRows ?? []) as unknown as PropertyCoordinateRow[];
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const distancesKm: Record<string, number | null> = {};
    for (const id of data.propertyIds) {
      const row = bySlug.get(id);
      const point =
        row && Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
          ? { lat: row.latitude as number, lon: row.longitude as number }
          : null;
      distancesKm[id] = point ? Math.round(haversineKm(origin, point) * 10) / 10 : null;
    }
    return { ok: true, distancesKm };
  });
