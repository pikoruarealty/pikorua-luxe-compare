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
    const profileId = session.data?.profileId ?? null;
    // Public tier is SSR'd and crawlable for every visitor; the gated tier is
    // only ever populated for a verified session, so caching must stay
    // session-scoped whenever one exists (D5, Part 2 two-tier flow).
    setResponseHeader("Cache-Control", profileId ? "private, no-store" : "public, max-age=60");
    const { findConsumerComparison } = await import("@/repositories/comparison.repository.server");
    return {
      comparison: await findConsumerComparison(profileId, data.slugs),
      propscoreEnabled: isFeatureEnabled("V2_PROPSCORE"),
    };
  });
