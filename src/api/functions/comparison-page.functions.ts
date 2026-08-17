import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, useSession } from "@tanstack/react-start/server";
import { z } from "zod";

import type { VisitorSession } from "@/server/session.server";

const inputSchema = z
  .object({
    slugs: z
      .array(z.string().regex(/^[a-z0-9-]{1,200}$/))
      .min(1)
      .max(3),
  })
  .strict();

export const getV2ComparisonPage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { isFeatureEnabled, requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_COMPARISON");
    const { sessionConfig } = await import("@/server/session.server");
    const session = await useSession<VisitorSession>(sessionConfig());
    if (!session.data?.profileId) {
      const { findSafeComparisonIdentities } =
        await import("@/repositories/comparison-page.repository.server");
      return {
        authRequired: true as const,
        projects: await findSafeComparisonIdentities(data.slugs),
      };
    }
    setResponseHeader("Cache-Control", "private, no-store");
    const { findConsumerComparison } = await import("@/repositories/comparison.repository.server");
    return {
      authRequired: false as const,
      comparison: await findConsumerComparison(session.data.profileId, data.slugs),
      propscoreEnabled: isFeatureEnabled("V2_PROPSCORE"),
    };
  });
