import { createServerFn } from "@tanstack/react-start";

import { recommendationRequestSchema } from "@/contracts/consumer";
import { requireVisitorAuth } from "@/middleware/visitor-auth";

export const saveConfirmedPreferences = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => recommendationRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const repository = await import("@/repositories/preferences.repository.server");
    return repository.saveConfirmedPreferences(context.profileId, data);
  });
