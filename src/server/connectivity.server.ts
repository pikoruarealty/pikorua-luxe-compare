export interface DrivingRouteSnapshot {
  distanceMeters: number;
  durationSeconds: number;
}

interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
}

export async function calculateDrivingRoute(
  originPlaceId: string,
  destinationPlaceId: string,
): Promise<DrivingRouteSnapshot | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { placeId: originPlaceId },
        destination: { placeId: destinationPlaceId },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "en-IN",
        units: "METRIC",
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { routes?: GoogleRoute[] };
    const route = payload.routes?.[0];
    const duration = route?.duration?.match(/^(\d+(?:\.\d+)?)s$/)?.[1];
    if (!Number.isFinite(route?.distanceMeters) || !duration) return null;
    return {
      distanceMeters: Math.round(route!.distanceMeters!),
      durationSeconds: Math.round(Number(duration)),
    };
  } catch {
    return null;
  }
}
