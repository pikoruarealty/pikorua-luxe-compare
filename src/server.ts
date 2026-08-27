import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  // A process-global "last error" can attribute one concurrent request's
  // stack to another request. Log only the response we can prove belongs here.
  const incidentId = crypto.randomUUID();
  console.error(`[ssr-failed] incident=${incidentId}`);
  const { reportServerIncident } = await import("@/server/observability.server");
  await reportServerIncident(incidentId, "ssr");
  return new Response(renderErrorPage(), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-propcompare-incident": incidentId,
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname.startsWith("/api/auth")) {
      const { auth } = await import("@/lib/auth/auth.server");
      return auth.handler(request);
    }
    if (url.pathname === "/readyz") {
      try {
        const { getDatabase } = await import("@/db/client.server");
        const { sql } = await import("drizzle-orm");
        await getDatabase().execute(sql`select 1`);
        return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return Response.json(
          { status: "unavailable" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch {
      const incidentId = crypto.randomUUID();
      console.error(`[server-failed] incident=${incidentId}`);
      const { reportServerIncident } = await import("@/server/observability.server");
      await reportServerIncident(incidentId, "server-entry");
      return new Response(renderErrorPage(), {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-propcompare-incident": incidentId,
        },
      });
    }
  },
};
