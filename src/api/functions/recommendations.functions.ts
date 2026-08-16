import { createServerFn } from "@tanstack/react-start";

import { recommendationRequestSchema } from "@/contracts/consumer";

export const getRecommendations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => recommendationRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");

    const { clientIp, enforce, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.RECOMMENDATION, `ip:${await clientIp()}`);

    const { findRecommendations } = await import("@/repositories/recommendation.repository.server");
    return findRecommendations(data);
  });
