// Second layer behind the SameSite=Lax cookies.
//
// Lax already stops a cross-site POST carrying the session cookie, so this is
// belt and braces rather than the primary defence. It matters because there is
// no CSRF token anywhere in the app: if the cookie policy is ever loosened
// again — for an embedded preview, say — this is what is left standing.

/** Origins allowed to make state-changing calls, beyond the request's own.
 *  Set APP_ORIGIN when the app is reached through a hostname the server does
 *  not see in its own Host header. Comma-separated. */
function configuredOrigins(): string[] {
  return (process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** The origin this request appears to have arrived at.
 *
 *  Built from the forwarded headers rather than request.url, because behind a
 *  proxy — Vercel now, nginx on the VM later — request.url carries the internal
 *  address, which would never match the browser's Origin. */
function requestOrigin(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Throws when a state-changing request came from another origin.
 *
 *  A missing Origin header is allowed through. Browsers send it on every
 *  cross-origin POST, which is the case being defended against; absent means
 *  same-origin from an older client, or a server-to-server call, and rejecting
 *  those would break more than it protects. */
export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  const allowed = new Set(configuredOrigins());
  const own = requestOrigin(request);
  if (own) allowed.add(own);

  if (!allowed.has(origin)) {
    throw new Error("Cross-origin request refused");
  }
}
