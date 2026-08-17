import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateDrivingRoute } from "./connectivity.server";

describe("calculateDrivingRoute", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a reproducible distance and duration snapshot", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ routes: [{ distanceMeters: 12540, duration: "1234s" }] }),
      })),
    );
    await expect(calculateDrivingRoute("project", "landmark")).resolves.toEqual({
      distanceMeters: 12540,
      durationSeconds: 1234,
    });
  });

  it("returns unavailable instead of inventing a route", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
    await expect(calculateDrivingRoute("project", "landmark")).resolves.toBeNull();
  });
});
