import { beforeEach, describe, expect, it, vi } from "vitest";

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
  POLICIES: { LOGIN: {} },
}));

vi.mock("@/server/verification-token.server", () => ({
  signClaim: vi.fn(async () => "signed"),
}));

async function call(fn: unknown, data: unknown) {
  return (fn as (args: { data: unknown }) => Promise<unknown>)({ data });
}

describe("Google identity token validation", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "our-client");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          aud: "our-client",
          azp: "another-client",
          iss: "https://accounts.google.com",
          email: "person@example.com",
          email_verified: true,
          exp: String(Math.floor(Date.now() / 1000) + 600),
        }),
      })),
    );
  });

  it("rejects a multi-audience token issued to another authorized party", async () => {
    const { verifyGoogleCredential } = await import("./google-auth.functions");
    await expect(
      call(verifyGoogleCredential, { credential: "header.payload.signature" }),
    ).rejects.toThrow(/issued|verified|app/i);
  });
});
