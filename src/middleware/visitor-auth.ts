import { createMiddleware } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

import type { VisitorSession } from "@/server/session.server";

export const requireVisitorAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { sessionConfig } = await import("@/server/session.server");
    const session = await useSession<VisitorSession>(sessionConfig());
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Authentication required");
    return next({ context: { profileId } });
  },
);
