import { createServerFn } from "@tanstack/react-start";

/** What the browser gets back from Google, once we've checked it is genuine. */
export interface GoogleIdentity {
  email: string;
  name: string | null;
  /** Signed proof of the address, interchangeable with the email-OTP token —
   *  Google having verified the inbox is equivalent to us mailing a code. */
  emailToken: string;
}

interface TokenInfo {
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  exp?: string;
}

const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/** Exchanges the credential Google Identity Services hands the browser for a
 *  verified email.
 *
 *  Validation is delegated to Google's own tokeninfo endpoint rather than
 *  hand-rolling RS256 + JWKS handling here: getting signature verification
 *  subtly wrong is the classic way this integration becomes an auth bypass.
 *  We still check the audience ourselves — a token minted for a *different*
 *  Google app is perfectly valid, just not valid for us. */
export const verifyGoogleCredential = createServerFn({ method: "POST" })
  .inputValidator((data: { credential: string }) => {
    const credential = String(data?.credential ?? "");
    // A JWT, and nothing that could smuggle characters into the query string.
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential)) {
      throw new Error("Invalid Google sign-in response");
    }
    return { credential };
  })
  .handler(async ({ data }): Promise<GoogleIdentity> => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Google sign-in isn't configured (GOOGLE_CLIENT_ID missing)");

    let res: Response;
    try {
      res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(data.credential)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
    } catch {
      throw new Error("Couldn't reach Google to confirm your sign-in. Try again.");
    }
    if (!res.ok) throw new Error("That Google sign-in couldn't be verified. Please try again.");

    const info = (await res.json()) as TokenInfo;

    if (info.aud !== clientId) throw new Error("That Google sign-in wasn't issued for this app.");
    if (!info.iss || !VALID_ISSUERS.has(info.iss)) {
      throw new Error("That Google sign-in couldn't be verified.");
    }
    // tokeninfo rejects expired tokens, but check ourselves so a change in its
    // behaviour can't silently let stale credentials through.
    if (info.exp && Number(info.exp) * 1000 < Date.now()) {
      throw new Error("That Google sign-in expired. Please try again.");
    }
    if (info.email_verified !== true && info.email_verified !== "true") {
      throw new Error("Your Google account's email isn't verified.");
    }
    const email = info.email?.trim().toLowerCase();
    if (!email) throw new Error("Google didn't share an email address.");

    const { signClaim } = await import("@/server/verification-token.server");
    return {
      email,
      name: info.name?.trim() || null,
      emailToken: await signClaim({ email, verifiedAt: Date.now() }),
    };
  });
