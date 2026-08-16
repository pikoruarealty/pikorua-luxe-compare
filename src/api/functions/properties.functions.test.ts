import { describe, expect, it, vi } from "vitest";

let selectedColumns = "";
let mockedRows: unknown[] = [];

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

describe("public property catalogue payload", () => {
  it("does not load residence-only narrative fields in the root catalogue", async () => {
    const { getProperties } = await import("./properties.functions");
    await (getProperties as unknown as () => Promise<unknown>)();
    expect(selectedColumns).toContain("configuration_summary");
    expect(selectedColumns).not.toContain("expert_note");
    expect(selectedColumns).not.toContain("developer_background");
    expect(selectedColumns).not.toContain("notable_delivered_projects");
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
