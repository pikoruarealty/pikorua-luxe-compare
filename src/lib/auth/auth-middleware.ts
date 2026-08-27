import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "./auth.server";

// Replaces src/integrations/supabase/auth-middleware.ts's requireSupabaseAuth.
// better-auth issues an httpOnly session cookie (set by auth.handler in
// src/server.ts), so verification here is just asking better-auth to read
// and validate that cookie against the "session" table — no bearer token.
export const requireAuthSession = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const result = await auth.api.getSession({ headers: request.headers });
    if (!result) {
      throw new Error("Unauthorized: No active session");
    }

    return next({
      context: {
        userId: result.user.id,
        session: result,
      },
    });
  },
);
