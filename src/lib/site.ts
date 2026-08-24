/**
 * The canonical public origin.
 *
 * Hardcoded rather than read from the environment because `Route.head()` runs
 * on both the server and the client, so it cannot see `process.env`, and a
 * missing `VITE_*` variable would degrade silently into unshareable pages —
 * `og:image` and `og:url` are ignored by every scraper unless absolute.
 */
export const SITE_URL = "https://propcompare.in";

/** Absolute URL for a file served out of `public/`. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
