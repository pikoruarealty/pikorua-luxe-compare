// Regression cover for the phone-OTP takeover.
//
// The flaw: sendOtp kept no record of which number a 2Factor sessionId belonged
// to, and verifyOtp accepted `phone` from the caller and signed it into the
// verification claim. So anyone could have a code texted to their own handset,
// answer it while naming somebody else's number, and receive a signed claim for
// that number -- which completeLogin then exchanged for the victim's session.
//
// These tests drive the real validators and the real handlers. Only the two
// things the handlers reach outside themselves are stubbed: the sealed cookie
// and the call to 2Factor.

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stands in for the sealed `pikorua-pending` cookie. One object per test,
 *  shared across useSession calls -- which is how h3 behaves inside a request. */
let cookie: Record<string, unknown> | undefined;

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

// Throttling is covered in rate-limit.server.test.ts. Stubbed out here so these
// tests speak only about which number a code is bound to — and so the 1-per-60s
// send limit does not fail a test that legitimately sends twice.
vi.mock("@/server/rate-limit.server", () => ({
  enforce: async () => {},
  clientIp: async () => "test-ip",
  POLICIES: { OTP_SEND: {}, OTP_ATTEMPT: {} },
}));

vi.mock("@tanstack/react-start/server", () => ({
  useSession: async () => ({
    get data() {
      return cookie;
    },
    update: async (next: Record<string, unknown>) => {
      cookie = { ...next };
    },
    clear: async () => {
      cookie = undefined;
    },
  }),
}));

const SESSION_ID = "d3b07384-d9a0-4c9b-b1f2-8a7c6e5d4f30";
const ATTACKER = "919000000001";
const VICTIM = "919876543210";

/** The mocked createServerFn erases the real call signature, so tests reach the
 *  handlers through one deliberately loose helper rather than casting at every
 *  call. `data` is typed `unknown` on purpose: half the point is to send fields
 *  the input type no longer admits. */
async function call<T = Record<string, unknown>>(fn: unknown, data: unknown): Promise<T> {
  return (fn as (args: { data: unknown }) => Promise<T>)({ data });
}

function stub2Factor(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => body }) as unknown as Response),
  );
}

async function claimFor(token: string) {
  const { readClaim } = await import("@/server/verification-token.server");
  return readClaim<{ phone: string; verifiedAt: number }>(token, 10 * 60 * 1000);
}

describe("phone OTP verification", () => {
  beforeEach(() => {
    cookie = undefined;
    vi.stubEnv("TWO_FACTOR_API_KEY", "test-api-key");
    vi.stubEnv("SESSION_SECRET", "a-test-secret-long-enough-to-hmac-with");
    stub2Factor({ Status: "Success", Details: SESSION_ID });
  });

  it("signs the claim for the number the code was texted to, not the one supplied", async () => {
    const { sendOtp, verifyOtp } = await import("./otp.functions");

    // The attacker requests a code for their own handset and reads the SMS.
    await call(sendOtp, { phone: ATTACKER });

    // Then answers it while naming the victim's number. This is the exploit.
    const res = await call<{ verificationToken: string }>(verifyOtp, {
      sessionId: SESSION_ID,
      otp: "123456",
      phone: VICTIM,
    });

    const claim = await claimFor(res.verificationToken);
    expect(claim?.phone).toBe(ATTACKER);
    expect(claim?.phone).not.toBe(VICTIM);
  });

  it("sends the stored number to 2Factor, so a forged phone cannot redirect the check", async () => {
    const { sendOtp, verifyOtp } = await import("./otp.functions");
    await call(sendOtp, { phone: ATTACKER });

    await call(verifyOtp, { sessionId: SESSION_ID, otp: "123456", phone: VICTIM });

    const urls = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map(
      (args) => args[0],
    );
    expect(urls.some((url) => url.includes(VICTIM))).toBe(false);
  });

  it("refuses a code when none is outstanding", async () => {
    const { verifyOtp } = await import("./otp.functions");
    await expect(call(verifyOtp, { sessionId: SESSION_ID, otp: "123456" })).rejects.toThrow(
      /request a new code/i,
    );
  });

  it("refuses a code from an earlier send", async () => {
    const { sendOtp, verifyOtp } = await import("./otp.functions");
    await call(sendOtp, { phone: ATTACKER });

    // A second request for a different number supersedes the first; the older
    // code is still sitting on the first handset.
    const newer = "11111111-2222-3333-4444-555555555555";
    stub2Factor({ Status: "Success", Details: newer });
    await call(sendOtp, { phone: VICTIM });

    await expect(call(verifyOtp, { sessionId: SESSION_ID, otp: "123456" })).rejects.toThrow(
      /most recent/i,
    );
  });

  it("leaves the number unproven until the code comes back", async () => {
    const { sendOtp } = await import("./otp.functions");
    await call(sendOtp, { phone: ATTACKER });

    // upsertProfileAfterOtp trusts `phone` from this cookie only when
    // `verifiedAt` is present. If sending alone set it, requesting a code for
    // any number would be enough to claim that number's account.
    expect(cookie).toEqual({ sessionId: SESSION_ID, phone: ATTACKER });
    expect(cookie).not.toHaveProperty("verifiedAt");
  });

  it("marks the number proven once the code is accepted", async () => {
    const { sendOtp, verifyOtp } = await import("./otp.functions");
    await call(sendOtp, { phone: ATTACKER });
    await call(verifyOtp, { sessionId: SESSION_ID, otp: "123456" });

    expect(cookie).toMatchObject({ sessionId: SESSION_ID, phone: ATTACKER });
    expect(typeof cookie?.verifiedAt).toBe("number");
  });

  it("does not issue a claim when 2Factor rejects the code", async () => {
    const { sendOtp, verifyOtp } = await import("./otp.functions");
    await call(sendOtp, { phone: ATTACKER });

    stub2Factor({ Status: "Error", Details: "OTP Mismatch" });
    await expect(call(verifyOtp, { sessionId: SESSION_ID, otp: "999999" })).rejects.toThrow(
      /mismatch/i,
    );
    expect(cookie).not.toHaveProperty("verifiedAt");
  });
});
