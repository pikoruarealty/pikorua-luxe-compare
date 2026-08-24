/**
 * Scroll an anchor into view beneath the fixed SiteHeader.
 *
 * The 96px offset is the header's tallest state plus breathing room; it was
 * duplicated in routes/index.tsx and needed a second copy for the V2 catalogue
 * page, so it lives here instead. Pair it with `scroll-mt-28` on the target for
 * native anchor navigation from SiteHeader's `/#suite` / `/#collection` links.
 */
export const HEADER_SCROLL_OFFSET = 96;

export function scrollToId(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  const top = element.getBoundingClientRect().top + window.scrollY - HEADER_SCROLL_OFFSET;
  window.scrollTo({ top, behavior: "smooth" });
}
