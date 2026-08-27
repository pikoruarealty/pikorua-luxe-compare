// The second half of the phone-OTP fix.
//
// Binding the number to the send inside verifyOtp is not sufficient on its own.
// upsertProfileAfterOtp reads the phone from the pending cookie *in preference
// to* the signed claim, and sendOtp now writes a number into that cookie before
// anything has been proven. So the consumer has to distinguish "a code went
// out" from "a code came back" -- otherwise requesting a code for a number
// would be enough to register against it, which is the same takeover through a
// different door.
//
// These cases all fail before any database call, so no database stub is needed.

import { beforeEach, describe, expect, it, vi } from "vitest";

let cookies: Record<string, Record<string, unknown> | undefined> = {};

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

// Two cookies are in play here (pending and session), so the stub keys on the
// name from the config rather than holding a single object like the otp tests.
vi.mock("@tanstack/react-start/server", () => ({
  useSession: async (config: { name: string }) => ({
    get data() {
      return cookies[config.name];
    },
    update: async (next: Record<string, unknown>) => {
      cookies[config.name] = { ...next };
    },
    clear: async () => {
      delete cookies[config.name];
    },
  }),
}));

const PHONE = "919876543210";
const PROFILE = {
  name: "A Buyer",
  email: "buyer@example.com",
  profession: "Doctor",
};

async function call<T = unknown>(fn: unknown, data: unknown): Promise<T> {
  return (fn as (args: { data: unknown }) => Promise<T>)({ data });
}

describe("upsertProfileAfterOtp — pending cookie", () => {
  beforeEach(() => {
    cookies = {};
    vi.stubEnv("SESSION_SECRET", "a-test-secret-long-enough-to-hmac-with");
  });

  it("refuses a number that was only sent a code, never proven", async () => {
    const { upsertProfileAfterOtp } = await import("./profile.functions");

    // Exactly what sendOtp leaves behind: no verifiedAt.
    cookies["pikorua-pending"] = { sessionId: "abcd-1234-efgh-5678", phone: PHONE };

    await expect(call(upsertProfileAfterOtp, PROFILE)).rejects.toThrow(/phone not verified/i);
  });

  it("refuses a proof that has aged past the claim window", async () => {
    const { upsertProfileAfterOtp } = await import("./profile.functions");

    cookies["pikorua-pending"] = {
      sessionId: "abcd-1234-efgh-5678",
      phone: PHONE,
      verifiedAt: Date.now() - 11 * 60 * 1000, // claim TTL is 10 minutes
    };

    await expect(call(upsertProfileAfterOtp, PROFILE)).rejects.toThrow(/phone not verified/i);
  });

  it("refuses when there is no pending cookie and no token at all", async () => {
    const { upsertProfileAfterOtp } = await import("./profile.functions");
    await expect(call(upsertProfileAfterOtp, PROFILE)).rejects.toThrow(/phone not verified/i);
  });

  it("gets past the phone check once the code has been answered", async () => {
    const { upsertProfileAfterOtp } = await import("./profile.functions");

    cookies["pikorua-pending"] = {
      sessionId: "abcd-1234-efgh-5678",
      phone: PHONE,
      verifiedAt: Date.now(),
    };

    // No emailToken is supplied, so this must now fail on the *email* check.
    // Reaching that line is the assertion: the phone was accepted.
    await expect(call(upsertProfileAfterOtp, PROFILE)).rejects.toThrow(/email not verified/i);
  });
});
