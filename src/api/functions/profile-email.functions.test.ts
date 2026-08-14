import { beforeEach, describe, expect, it, vi } from "vitest";

let lookupMethod = "";
let lookupValue = "";

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

vi.mock("@tanstack/react-start/server", () => ({ useSession: async () => ({ data: {} }) }));
vi.mock("@/server/rate-limit.server", () => ({
  enforce: async () => {},
  clientIp: async () => "test-ip",
  POLICIES: { ACCOUNT_LOOKUP: {}, LOGIN: {} },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: async (_column: string, value: string) => {
          lookupMethod = "eq";
          lookupValue = value;
          return { data: [], error: null };
        },
        ilike: async (_column: string, value: string) => {
          lookupMethod = "ilike";
          lookupValue = value;
          return { data: [], error: null };
        },
      }),
    }),
  },
}));

async function call(data: unknown) {
  const { checkAccountExists } = await import("./profile.functions");
  return (checkAccountExists as unknown as (args: { data: unknown }) => Promise<unknown>)({ data });
}

describe("exact email identity lookup", () => {
  beforeEach(() => {
    lookupMethod = "";
    lookupValue = "";
  });

  it("rejects SQL LIKE wildcard characters in an email identity", async () => {
    await expect(call({ channel: "email", identity: "%@%.%" })).rejects.toThrow(/valid email/i);
  });

  it("uses an exact lookup for a normalized address", async () => {
    await call({ channel: "email", identity: "Buyer@Example.com" });
    expect(lookupMethod).toBe("eq");
    expect(lookupValue).toBe("buyer@example.com");
  });
});
