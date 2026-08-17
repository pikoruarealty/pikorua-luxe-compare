import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireReviewerAuth } from "@/integrations/supabase/admin-auth-middleware";

const uuid = z.string().uuid();
const placeId = z.string().trim().min(5).max(300);
const landmarkCategories = [
  "airport",
  "transit",
  "business_district",
  "hospital",
  "school",
  "shopping",
  "highway_access",
] as const;

export const searchCuratedLandmarks = createServerFn({ method: "GET" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ query: z.string().trim().min(3).max(200) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { searchAddressPlaces } = await import("@/server/geocode.server");
    return searchAddressPlaces(data.query);
  });

export const saveCuratedLandmark = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        marketId: uuid,
        category: z.enum(landmarkCategories),
        displayName: z.string().trim().min(1).max(200),
        googlePlaceId: placeId,
        sortOrder: z.number().int().min(0).max(100),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_PROPSCORE");
    const repository = await import("@/repositories/connectivity.repository.server");
    return repository.saveMarketLandmark(data, context.adminProfile.id);
  });

export const verifyPublicationLocation = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: unknown) =>
    z.object({ publicationVersionId: uuid, googlePlaceId: placeId }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_PROPSCORE");
    const { geocodePlaceId } = await import("@/server/geocode.server");
    const point = await geocodePlaceId(data.googlePlaceId);
    if (!point) throw new Error("Google could not resolve that project location");
    const repository = await import("@/repositories/connectivity.repository.server");
    return repository.verifyPropertyLocation(
      {
        publicationVersionId: data.publicationVersionId,
        googlePlaceId: data.googlePlaceId,
        latitude: point.lat,
        longitude: point.lon,
      },
      context.adminProfile.id,
    );
  });

export const refreshPublicationConnectivity = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: unknown) => z.object({ publicationVersionId: uuid }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_PROPSCORE");
    const repository = await import("@/repositories/connectivity.repository.server");
    return repository.refreshConnectivitySnapshots(
      data.publicationVersionId,
      context.adminProfile.id,
    );
  });
