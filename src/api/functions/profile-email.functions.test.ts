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
// checkAccountExists resolves to an exact-equality Drizzle lookup (findProfilesByEmail /
// findProfilesByPhone, both `eq()` under the hood) — this test guards that no wildcard-style
// pattern match (e.g. ilike) is ever reachable from a caller-supplied identity.
vi.mock("@/repositories/profile.repository.server", () => ({
  findProfilesByEmail: async (value: string) => {
    lookupMethod = "email";
    lookupValue = value;
    return [];
  },
  findProfilesByPhone: async (value: string) => {
    lookupMethod = "phone";
    lookupValue = value;
    return [];
  },
}));
vi.mock("@/repositories/customer-activity.repository.server", () => ({
  recordActivity: async () => {},
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
    expect(lookupMethod).toBe("email");
    expect(lookupValue).toBe("buyer@example.com");
  });
});
