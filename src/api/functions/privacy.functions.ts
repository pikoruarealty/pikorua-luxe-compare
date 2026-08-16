import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireVisitorAuth } from "@/middleware/visitor-auth";

export const getPrivacyPreferences = createServerFn({ method: "GET" })
  .middleware([requireVisitorAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/privacy.repository.server");
    return repository.getPrivacyPreferences(context.profileId);
  });

export const updateAnalyticsPreference = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => z.object({ optedOut: z.boolean() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const repository = await import("@/repositories/privacy.repository.server");
    return repository.setAnalyticsOptOut(context.profileId, data.optedOut);
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ confirmation: z.literal("DELETE") })
      .strict()
      .parse(data),
  )
  .handler(async ({ context }) => {
    const repository = await import("@/repositories/privacy.repository.server");
    const result = await repository.deleteConsumerAccount(context.profileId);
    const { useSession } = await import("@tanstack/react-start/server");
    const { sessionConfig } = await import("@/server/session.server");
    const session = await useSession(sessionConfig());
    await session.clear();
    return result;
  });
