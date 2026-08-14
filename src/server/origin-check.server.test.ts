import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin } from "./origin-check.server";
import { sessionConfig, pendingConfig, emailOtpConfig } from "./session.server";

function request(
  method: string,
  headers: Record<string, string>,
  url = "https://propcompare.example/_serverFn/x",
) {
  return new Request(url, { method, headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertSameOrigin", () => {
  it("allows a same-origin POST", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "propcompare.example",
          "x-forwarded-proto": "https",
          origin: "https://propcompare.example",
        }),
      ),
    ).not.toThrow();
  });

  it("allows local HTTP when no proxy protocol header is present", () => {
    expect(() =>
      assertSameOrigin(
        request(
          "POST",
          { host: "localhost:5173", origin: "http://localhost:5173" },
          "http://localhost:5173/_serverFn/x",
        ),
      ),
    ).not.toThrow();
  });

  it("refuses a POST from another origin", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "propcompare.example",
          "x-forwarded-proto": "https",
          origin: "https://evil.example",
        }),
      ),
    ).toThrow(/cross-origin/i);
  });

  it("is not fooled by an origin that merely starts with ours", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "propcompare.example",
          "x-forwarded-proto": "https",
          origin: "https://propcompare.example.evil.tld",
        }),
      ),
    ).toThrow(/cross-origin/i);
  });

  it("leaves reads alone", () => {
    expect(() =>
      assertSameOrigin(
        request("GET", { host: "propcompare.example", origin: "https://evil.example" }),
      ),
    ).not.toThrow();
  });

  it("allows a POST with no Origin header at all", () => {
    // Browsers send Origin on every cross-origin POST, so absent means
    // same-origin from an older client or a server-to-server call. Rejecting
    // those breaks more than it protects; SameSite=Lax is the real defence.
    expect(() => assertSameOrigin(request("POST", { host: "propcompare.example" }))).not.toThrow();
  });

  it("honours an explicitly configured origin", () => {
    vi.stubEnv("APP_ORIGIN", "https://www.propcompare.example");
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "internal-1.local",
          origin: "https://www.propcompare.example",
        }),
      ),
    ).not.toThrow();
  });

  it("prefers x-forwarded-host, since behind a proxy Host is the internal name", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "internal-1.local",
          "x-forwarded-host": "propcompare.example",
          "x-forwarded-proto": "https",
          origin: "https://propcompare.example",
        }),
      ),
    ).not.toThrow();
  });
});

describe("session cookies", () => {
  it("are not sent on cross-site requests", () => {
    // These were sameSite "none", which hands the browser's own CSRF
    // protection away — and there is no token behind it. A regression here is
    // silent and total, so it is worth an assertion.
    vi.stubEnv("SESSION_SECRET", "test-secret");
    for (const config of [sessionConfig(), pendingConfig(), emailOtpConfig()]) {
      expect(config.cookie.sameSite).toBe("lax");
      expect(config.cookie.httpOnly).toBe(true);
      expect(config.cookie.secure).toBe(true);
    }
  });

  it("refuse to seal without a secret rather than sealing with undefined", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => sessionConfig()).toThrow(/SESSION_SECRET/);
  });
});
