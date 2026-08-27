import { beforeEach, describe, expect, it, vi } from "vitest";

let insertedMetadata: unknown;

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

vi.mock("@tanstack/react-start/server", () => ({
  useSession: async () => ({ data: { profileId: "profile-1" } }),
}));
vi.mock("@/server/rate-limit.server", () => ({
  enforce: async () => {},
  clientIp: async () => "test-ip",
  POLICIES: { ACTIVITY: {} },
}));
vi.mock("@/server/session.server", () => ({ sessionConfig: () => ({}) }));

async function call<T>(fn: unknown, data: unknown): Promise<T> {
  return (fn as (args: { data: unknown }) => Promise<T>)({ data });
}

describe("public JSON input validation", () => {
  beforeEach(() => {
    insertedMetadata = undefined;
  });

  it("rejects quiz answers with the wrong shape", async () => {
    const { saveQuizAnswers } = await import("./profile.functions");
    await expect(
      call(saveQuizAnswers, {
        answers: { bhk: "4 BHK", propertyType: [], budgetRange: "", budgetSub: "" },
      }),
    ).rejects.toThrow(/invalid|array|expected/i);
  });

  it("rejects deeply nested activity metadata", async () => {
    const { logActivity } = await import("./activity.functions");
    const metadata = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
    await expect(call(logActivity, { event: "property_view", metadata })).rejects.toThrow(
      /metadata|deep|invalid/i,
    );
    expect(insertedMetadata).toBeUndefined();
  });
});
