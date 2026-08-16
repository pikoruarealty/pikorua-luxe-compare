import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const incidentId = crypto.randomUUID();
    console.error(`[request-failed] incident=${incidentId}`);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-propcompare-incident": incidentId,
      },
    });
  }
});

// The app sent no security headers at all: no CSP, no HSTS, nothing stopping
// it being framed or its content types sniffed.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const { securityHeaders } = await import("@/server/security-headers.server");
  const response = result.response;
  if (response instanceof Response) {
    for (const [name, value] of Object.entries(securityHeaders())) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
  }
  return result;
});

// Every server function is a POST the browser can be made to send from another
// site. SameSite=Lax on the session cookies is the real defence; this catches
// the case where that policy is ever loosened again, since the app carries no
// CSRF token of its own.
const originMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { assertSameOrigin } = await import("@/server/origin-check.server");
  assertSameOrigin(getRequest());
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, originMiddleware],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));
