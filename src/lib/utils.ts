import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns the URL only when it is a safe http(s) link, otherwise null. Blocks
 *  `javascript:`, `data:`, and other script-capable schemes from ever reaching
 *  an `href` — the values it guards (e.g. a developer-submitted RERA link) are
 *  user-controlled and rendered on the public site, so an unguarded href would
 *  be a stored-XSS sink. Scheme-less input (no `http(s)://`) is rejected too. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    const protocol = new URL(trimmed).protocol;
    return protocol === "http:" || protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
