import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = [
  { slug: "alpha", latitude: 19.076, longitude: 72.8777 },
  { slug: "beta", latitude: 18.5204, longitude: 73.8567 },
];

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const builder = {
      inputValidator(fn: (input: unknown) => unknown) {
        validate = fn;
        return builder;
      },
      handler(fn: (ctx: { data: unknown }) => unknown) {
        return async (args?: { data?: unknown }) => fn({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

vi.mock("@/server/rate-limit.server", () => ({
  enforce: vi.fn(async () => undefined),
  clientIp: vi.fn(async () => "127.0.0.1"),
  POLICIES: { GEOCODE: {} },
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  },
}));

async function call(fn: unknown, data: unknown) {
  return (fn as (args: { data: unknown }) => Promise<unknown>)({ data });
}

describe("property distance inputs", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ lat: "19.1136", lon: "72.8697" }],
      })),
    );
  });

  it("uses persisted coordinates selected by slug and geocodes only the visitor", async () => {
    const { calculatePropertyDistances } = await import("./distance.functions");
    const result = await call(calculatePropertyDistances, {
      address: "Andheri East, Mumbai",
      propertyIds: ["alpha", "beta"],
    });

    expect(result).toEqual({
      ok: true,
      distancesKm: { alpha: expect.any(Number), beta: expect.any(Number) },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
