import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireVisitorAuth } from "@/middleware/visitor-auth";

const comparisonRequestSchema = z
  .object({
    slugs: z
      .array(z.string().regex(/^[a-z0-9-]{1,200}$/))
      .min(2)
      .max(3)
      .transform((slugs) => [...new Set(slugs)]),
  })
  .strict()
  .refine((data) => data.slugs.length >= 2, "Select at least two different properties");

export const getConsumerComparison = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => comparisonRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_COMPARISON");
    setResponseHeader("Cache-Control", "private, no-store");

    const { findConsumerComparison } = await import("@/repositories/comparison.repository.server");
    return findConsumerComparison(context.profileId, data.slugs);
  });
