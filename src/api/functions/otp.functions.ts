import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import type { PendingSession } from "@/server/session.server";

export const sendOtp = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => {
    if (!data || typeof data.phone !== "string") throw new Error("Invalid phone number");
    const phone = data.phone.replace(/[^0-9]/g, "");
    if (phone.length < 6 || phone.length > 15) throw new Error("Invalid phone number");
    return { phone };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) throw new Error("TWO_FACTOR_API_KEY missing");

    // Public, unauthenticated, and every call sends a real SMS billed to the
    // 2Factor account -- so without this it doubles as a way to flood any
    // Indian mobile number with texts carrying this brand, and to empty the
    // SMS balance. Keyed on the number *and* the caller: the number alone
    // would let one attacker walk a list, the IP alone would let a botnet
    // hammer one victim.
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.OTP_SEND, data.phone);
    await enforce(POLICIES.OTP_SEND, `ip:${await clientIp()}`);

    const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/${encodeURIComponent(data.phone)}/AUTOGEN`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const json: { Status?: string; Details?: string } = await res.json();
    if (json.Status !== "Success" || !json.Details) {
      throw new Error("Failed to send OTP");
    }

    // Record which number this code went to, sealed server-side. verifyOtp reads
    // the phone from here rather than from its own request body -- that binding
    // is the whole point, and without it verification proves only that the
    // caller can read some inbox, not that it is the one they are claiming.
    //
    // No verifiedAt: a code has gone out, nothing has come back yet.
    const { pendingConfig } = await import("@/server/session.server");
    const session = await useSession<PendingSession>(pendingConfig());
    await session.update({ sessionId: json.Details, phone: data.phone });

    return { sessionId: json.Details };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; otp: string }) => {
    if (!data || typeof data.sessionId !== "string" || typeof data.otp !== "string") {
      throw new Error("Invalid input");
    }
    // Strict allowlist: 2Factor session IDs are UUIDs. Reject anything that
    // could alter the upstream URL path (slashes, dots, query chars, etc.).
    if (!/^[A-Za-z0-9-]{8,64}$/.test(data.sessionId)) {
      throw new Error("Invalid session id");
    }
    const otp = data.otp.replace(/[^0-9]/g, "");
    if (otp.length < 4 || otp.length > 8) throw new Error("Invalid OTP");
    // Note there is no `phone` here on purpose. It used to be accepted from the
    // caller and then signed into the verification claim verbatim, which let
    // anyone verify their own number and walk away with a claim for someone
    // else's. The number now comes from the sealed cookie sendOtp wrote.
    return { sessionId: data.sessionId, otp };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) throw new Error("TWO_FACTOR_API_KEY missing");

    const { pendingConfig } = await import("@/server/session.server");
    const session = await useSession<PendingSession>(pendingConfig());
    const stored = session.data;

    if (!stored?.sessionId || !stored.phone) {
      throw new Error("Please request a new code.");
    }
    // Requesting a second code for a different number leaves the first one
    // outstanding on the handset. Pinning the attempt to the latest send stops
    // that older code being answered against the newer number.
    if (stored.sessionId !== data.sessionId) {
      throw new Error("That code has expired. Please use the most recent one.");
    }

    // The phone path had no attempt counter at all -- a four-digit code and
    // unlimited guesses. Keyed on the 2Factor session, which the server chose,
    // so discarding the cookie starts a new send rather than a fresh budget.
    const { enforce, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.OTP_ATTEMPT, stored.sessionId);

    const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/VERIFY/${encodeURIComponent(stored.sessionId)}/${encodeURIComponent(data.otp)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const json: { Status?: string; Details?: string } = await res.json();
    if (json.Status !== "Success") {
      throw new Error("OTP mismatch");
    }

    // Both the cookie and the claim carry the stored number, never an input.
    const verifiedAt = Date.now();
    await session.update({ ...stored, verifiedAt });
    const { signClaim } = await import("@/server/verification-token.server");
    const verificationToken = await signClaim({ phone: stored.phone, verifiedAt });
    return { verified: true, verificationToken };
  });
