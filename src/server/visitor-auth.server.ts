import { createMiddleware } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

import type { VisitorSession } from "./session.server";

export const requireVisitorAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { sessionConfig } = await import("./session.server");
    // `useSession` is TanStack Start's request composable, not a React hook.
    const session = await useSession<VisitorSession>(sessionConfig());
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Authentication required");
    return next({ context: { profileId } });
  },
);
