// Response headers the app shipped without entirely — no CSP, no HSTS, no
// frame or sniffing protection.
//
// The one that earns its place is the CSP. Admin and developer Supabase access
// tokens live in localStorage, readable by any script on the origin, and the
// admin portal renders content developers submitted. No XSS was found — no
// dangerouslySetInnerHTML, no eval, and the one developer-controlled href goes
// through safeHttpUrl — but the blast radius if one ever appears is a
// service-role-adjacent takeover, so a script allowlist is worth having in
// front of it.
//
// Set through Nitro rather than vercel.json so it survives the move to the GCP
// VM. Nothing here depends on the host.

const SELF = "'self'";

/** Where the app legitimately loads things from.
 *
 *  `unsafe-inline` for styles is not optional: Tailwind, the Google Fonts
 *  stylesheet and React's own style attributes all rely on it. Scripts do not
 *  get the same latitude — that is the part protecting the admin token. */
function contentSecurityPolicy(supabaseOrigin: string | null): string {
  const connect = [SELF, "https://accounts.google.com"];
  if (supabaseOrigin) connect.push(supabaseOrigin, supabaseOrigin.replace("https://", "wss://"));

  return [
    `default-src ${SELF}`,
    // Google Identity Services injects its button script.
    `script-src ${SELF} 'unsafe-inline' https://accounts.google.com https://apis.google.com`,
    `style-src ${SELF} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src ${SELF} https://fonts.gstatic.com data:`,
    // Supabase storage serves property images; brochure previews come from the
    // OCR service, whose origin is configured per environment.
    `img-src ${SELF} data: blob: https:`,
    `connect-src ${connect.join(" ")}`,
    `frame-src https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `base-uri ${SELF}`,
    `form-action ${SELF}`,
    `object-src 'none'`,
  ].join("; ");
}

function supabaseOrigin(): string | null {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Report-only until CSP_ENFORCE=1.
 *
 *  A CSP that breaks the page gets removed rather than fixed, so it goes out
 *  in report-only first: violations show in the browser console, nothing is
 *  blocked, and the policy can be tightened against real traffic before it
 *  starts refusing anything. */
export function securityHeaders(): Record<string, string> {
  const enforce = process.env.CSP_ENFORCE === "1" || process.env.NODE_ENV === "production";
  const policy = contentSecurityPolicy(supabaseOrigin());

  return {
    [enforce ? "content-security-policy" : "content-security-policy-report-only"]: policy,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    // Only meaningful over HTTPS; browsers ignore it on plain HTTP, so it is
    // safe to send in local development too.
    "strict-transport-security": "max-age=31536000; includeSubDomains",
  };
}
