export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface PlaceSuggestion {
  label: string;
  placeId: string;
}

interface LocationProvider {
  autocomplete(query: string): Promise<PlaceSuggestion[]>;
  geocodeAddress(address: string): Promise<GeoPoint | null>;
  geocodePlaceId(placeId: string): Promise<GeoPoint | null>;
}

const SPELLING_FIXES: [RegExp, string][] = [[/\biskon\b/gi, "Iskcon"]];
const normalizeAddress = (address: string) =>
  SPELLING_FIXES.reduce((value, [pattern, fix]) => value.replace(pattern, fix), address.trim());

class GoogleLocationProvider implements LocationProvider {
  constructor(private readonly apiKey: string) {}

  async autocomplete(rawQuery: string): Promise<PlaceSuggestion[]> {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: normalizeAddress(rawQuery),
        includedRegionCodes: ["in"],
        languageCode: "en",
        regionCode: "IN",
      }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      suggestions?: Array<{
        placePrediction?: { placeId?: string; text?: { text?: string } };
      }>;
    };
    return (payload.suggestions ?? [])
      .map((item) => ({
        placeId: item.placePrediction?.placeId ?? "",
        label: item.placePrediction?.text?.text ?? "",
      }))
      .filter((item) => item.placeId && item.label)
      .slice(0, 5);
  }

  async geocodeAddress(rawAddress: string): Promise<GeoPoint | null> {
    return this.geocode({ address: normalizeAddress(rawAddress), components: "country:IN" });
  }

  async geocodePlaceId(placeId: string): Promise<GeoPoint | null> {
    return this.geocode({ place_id: placeId });
  }

  private async geocode(parameters: Record<string, string>): Promise<GeoPoint | null> {
    const query = new URLSearchParams({ ...parameters, region: "in", key: this.apiKey });
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`,
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
      };
      const location = payload.results?.[0]?.geometry?.location;
      return location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
        ? { lat: location.lat as number, lon: location.lng as number }
        : null;
    } catch {
      return null;
    }
  }
}

function provider(): LocationProvider | null {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  return apiKey ? new GoogleLocationProvider(apiKey) : null;
}

export async function geocodeAddress(rawAddress: string): Promise<GeoPoint | null> {
  return provider()?.geocodeAddress(rawAddress) ?? null;
}

export async function geocodePlaceId(placeId: string): Promise<GeoPoint | null> {
  return provider()?.geocodePlaceId(placeId) ?? null;
}

export async function searchAddressPlaces(rawQuery: string): Promise<PlaceSuggestion[]> {
  return provider()?.autocomplete(rawQuery) ?? [];
}

/** Backward-compatible labels for the legacy comparison input. New saved
 * location flows use searchAddressPlaces and retain only label + Place ID. */
export async function searchAddresses(rawQuery: string): Promise<string[]> {
  return (await searchAddressPlaces(rawQuery)).map((suggestion) => suggestion.label);
}
