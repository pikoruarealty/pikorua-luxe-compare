import { useEffect } from "react";

/**
 * Prewarms a list of image URLs into the browser cache once on mount so
 * subsequent slide transitions render instantly with no fetch delay.
 * Safe to call with duplicates — the browser dedupes network requests.
 */
export function useImagePrewarm(urls: (string | undefined | null)[]) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Set<string>();
    for (const u of urls) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = u;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join("|")]);
}
