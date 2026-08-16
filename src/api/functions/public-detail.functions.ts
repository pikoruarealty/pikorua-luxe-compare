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
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { findPublicPropertyDetail } =
      await import("@/repositories/public-detail.repository.server");
    return findPublicPropertyDetail(data.slug);
  });
