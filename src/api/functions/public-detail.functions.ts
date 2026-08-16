import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getV2PublicPropertyDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({
    slug: z
      .string()
      .regex(/^[a-z0-9-]{1,200}$/)
      .parse(data?.slug),
  }))
  .handler(async ({ data }) => {
    const { isFeatureEnabled, requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { findPublicPropertyDetail } =
      await import("@/repositories/public-detail.repository.server");
    const detail = await findPublicPropertyDetail(data.slug);
    return detail
      ? {
          ...detail,
          reviewsEnabled: isFeatureEnabled("V2_REVIEWS"),
          enquiriesEnabled: isFeatureEnabled("V2_ENQUIRIES"),
        }
      : null;
  });
