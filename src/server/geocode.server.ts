interface GeoPoint {
  lat: number;
  lon: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const SPELLING_FIXES: [RegExp, string][] = [[/\biskon\b/gi, "Iskcon"]];

let requestQueue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function normalizeAddress(address: string): string {
  return SPELLING_FIXES.reduce((value, [pattern, fix]) => value.replace(pattern, fix), address);
}

/** Serializes requests within the process so concurrent handlers cannot race
 * past Nominatim's one-request-per-second public usage limit. */
async function throttledFetch(url: string): Promise<Response> {
  const request = requestQueue.then(async () => {
    const wait = Math.max(0, lastCallAt + 1100 - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return fetch(url, {
      headers: { "User-Agent": "PropCompare/1.0 (distance-estimate feature)" },
    });
  });
  requestQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

export async function geocodeAddress(rawAddress: string): Promise<GeoPoint | null> {
  const address = normalizeAddress(rawAddress);
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(address)}`;
  try {
    const response = await throttledFetch(url);
    if (!response.ok) return null;
    const results = (await response.json()) as { lat: string; lon: string }[];
    if (!results.length) return null;
    const lat = Number.parseFloat(results[0].lat);
    const lon = Number.parseFloat(results[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

export async function searchAddresses(rawQuery: string): Promise<string[]> {
  const query = normalizeAddress(rawQuery);
  const url = `${NOMINATIM_URL}?format=json&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`;
  try {
    const response = await throttledFetch(url);
    if (!response.ok) return [];
    const results = (await response.json()) as { display_name: string }[];
    return [...new Set(results.map((result) => result.display_name))];
  } catch {
    return [];
  }
}
