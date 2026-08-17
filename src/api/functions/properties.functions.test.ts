import { beforeEach, describe, expect, it, vi } from "vitest";

let selectedColumns = "";
let mockedRows: unknown[] = [];
let mockedProfileId: string | null = null;

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware() {
        return builder;
      },
      inputValidator() {
        return builder;
      },
      handler(fn: (ctx: { data: unknown }) => unknown) {
        return async (args?: { data?: unknown }) => fn({ data: args?.data });
      },
    };
    return builder;
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  useSession: async () => ({ data: mockedProfileId ? { profileId: mockedProfileId } : {} }),
  setResponseHeader: () => {},
}));

vi.mock("@/server/session.server", () => ({ sessionConfig: () => ({}) }));

vi.mock("@/integrations/supabase/admin-auth-middleware", () => ({ requireOwnerAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select(columns: string) {
        selectedColumns = columns;
        return {
          eq: () => ({ order: async () => ({ data: mockedRows, error: null }) }),
          order: async () => ({ data: mockedRows, error: null }),
        };
      },
    }),
  },
}));

const DEEP_ROW = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "sentinel-home",
  name: "Sentinel Home",
  category: "Apartment",
  carpet_area: "2,000 sq ft",
  configurations: {
    "4 BHK": [
      {
        type: "Type A",
        area: "3200",
        carpet: "2000",
        builtUpArea: "2600",
        price: "9.87654321 Cr",
        rate: "30864",
        bathrooms: "5",
        servantRoom: "Yes",
        bedroom1: "16 x 14",
      },
    ],
  },
  price_summary: "9.87654321 Cr onwards",
  advantages: ["Fabricated advantage"],
  expert_note: "Fabricated verdict",
};

describe("public property catalogue payload", () => {
  beforeEach(() => {
    mockedProfileId = null;
    mockedRows = [];
  });

  it("does not load residence-only narrative fields in the root catalogue", async () => {
    const { getProperties } = await import("./properties.functions");
    await (getProperties as unknown as () => Promise<unknown>)();
    expect(selectedColumns).toContain("configuration_summary");
    expect(selectedColumns).not.toContain("expert_note");
    expect(selectedColumns).not.toContain("developer_background");
    expect(selectedColumns).not.toContain("notable_delivered_projects");
  });

  it("keeps carpet area out of the public shell projection entirely", async () => {
    const { getProperties } = await import("./properties.functions");
    await (getProperties as unknown as () => Promise<unknown>)();
    expect(selectedColumns).toContain("super_built_up_area");
    expect(selectedColumns).not.toContain("carpet_area");
  });

  it("withholds every gated per-variant field from the public shell", async () => {
    mockedRows = [DEEP_ROW];
    const { getProperties } = await import("./properties.functions");
    const result = await (
      getProperties as unknown as () => Promise<
        Array<{
          carpetArea: string;
          configurations: Record<string, Array<Record<string, unknown>>>;
        }>
      >
    )();
    const variant = result[0].configurations["4 BHK"][0];
    // Absent keys, not null ones — the gated fields must not be in the object.
    expect(Object.keys(variant).sort()).toEqual(["area", "carpet", "price", "rate", "type"]);
    expect(variant.carpet).toBeNull();
    expect(result[0].carpetArea).toBe("-");
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("2000");
    expect(serialised).not.toContain("16 x 14");
    expect(serialised).not.toContain("9.87654321");
  });

  it("rejects an unauthenticated call for the gated tier", async () => {
    const { getDetailedProperties } = await import("./properties.functions");
    await expect(
      (getDetailedProperties as unknown as () => Promise<unknown>)(),
    ).rejects.toThrowError("Authentication required");
  });

  it("serves the shell to anonymous callers and the depth to a session", async () => {
    mockedRows = [DEEP_ROW];
    const { getWorkspaceCatalogue } = await import("./properties.functions");
    const call = getWorkspaceCatalogue as unknown as () => Promise<{
      tier: string;
      properties: Array<{ configurations: Record<string, Array<Record<string, unknown>>> }>;
    }>;

    const anonymous = await call();
    expect(anonymous.tier).toBe("public");
    expect(anonymous.properties[0].configurations["4 BHK"][0].carpet).toBeNull();

    mockedProfileId = "00000000-0000-4000-8000-0000000000aa";
    const signedIn = await call();
    expect(signedIn.tier).toBe("gated");
    expect(signedIn.properties[0].configurations["4 BHK"][0].carpet).toBe("2000");
    // Even the gated tier never carries a commercial value (D1).
    expect(JSON.stringify(signedIn)).not.toContain("9.87654321");
  });

  it("removes all legacy commercial and synthetic editorial values server-side", async () => {
    mockedRows = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        slug: "sentinel-home",
        name: "Sentinel Home",
        category: "Apartment",
        configurations: {
          "4 BHK": [{ area: "3200", carpet: "2000", price: "9.87654321 Cr", rate: "30864" }],
        },
        price_summary: "9.87654321 Cr onwards",
        advantages: ["Fabricated advantage"],
        expert_note: "Fabricated verdict",
      },
    ];
    const { getProperties } = await import("./properties.functions");
    const result = await (
      getProperties as unknown as () => Promise<
        Array<{
          pricePerSqft: string;
          configurations: Record<string, Array<{ price: string | null; rate: string | null }>>;
          advantages: string[];
          expertNote: string;
        }>
      >
    )();
    expect(result[0].pricePerSqft).toBe("Price on Request");
    expect(result[0].configurations["4 BHK"][0]).toMatchObject({ price: null, rate: null });
    expect(result[0].advantages).toEqual([]);
    expect(result[0].expertNote).toBe("");
    expect(JSON.stringify(result)).not.toContain("9.87654321");
  });
});
