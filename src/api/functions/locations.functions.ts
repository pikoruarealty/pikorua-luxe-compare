import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireVisitorAuth } from "@/middleware/visitor-auth";

const placeId = z.string().trim().min(5).max(300);

export const searchGoogleLocations = createServerFn({ method: "GET" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ query: z.string().trim().min(3).max(200) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.GEOCODE, `ip:${await clientIp()}`);
    const { searchAddressPlaces } = await import("@/server/geocode.server");
    return searchAddressPlaces(data.query);
  });

export const getSavedLocations = createServerFn({ method: "GET" })
  .middleware([requireVisitorAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/locations.repository.server");
    return repository.listSavedLocations(context.profileId);
  });

export const saveGoogleLocation = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ label: z.string().trim().min(1).max(200), placeId })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const repository = await import("@/repositories/locations.repository.server");
    return repository.saveLocation(context.profileId, data.label, data.placeId);
  });

export const deleteSavedLocation = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const repository = await import("@/repositories/locations.repository.server");
    return repository.deleteLocation(context.profileId, data.id);
  });

export const calculateV2Distances = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        placeId,
        slugs: z
          .array(z.string().regex(/^[a-z0-9-]{1,200}$/))
          .min(2)
          .max(3),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.GEOCODE, `ip:${await clientIp()}`);
    const { geocodeAddress, geocodePlaceId } = await import("@/server/geocode.server");
    const origin = await geocodePlaceId(data.placeId);
    if (!origin) return { distancesKm: {} as Record<string, number | null> };
    const repository = await import("@/repositories/locations.repository.server");
    const addresses = await repository.propertyAddressInputs(data.slugs);
    const distancesKm: Record<string, number | null> = {};
    for (const property of addresses) {
      const destination = property.address ? await geocodeAddress(property.address) : null;
      distancesKm[property.slug] = destination
        ? Math.round(haversineKm(origin, destination) * 10) / 10
        : null;
    }
    return { distancesKm };
  });

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}
