import { createMiddleware } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

import type { VisitorSession } from "@/server/session.server";

export const requireVisitorAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { sessionConfig } = await import("@/server/session.server");
    const session = await useSession<VisitorSession>(sessionConfig());
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Authentication required");
    const { getDatabase } = await import("@/db/client.server");
    const { profiles } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [profile] = await getDatabase()
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    if (!profile) {
      await session.clear();
      throw new Error("Authentication required");
    }
    return next({ context: { profileId } });
  },
);
