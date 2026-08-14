import { describe, expect, it, vi } from "vitest";

let selectedColumns = "";

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
          eq: () => ({ order: async () => ({ data: [], error: null }) }),
          order: async () => ({ data: [], error: null }),
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
});
