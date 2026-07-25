import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

const PENDING_COOKIE = "pikorua-pending";
const sessionConfig = () => ({
  password: process.env.SESSION_SECRET!,
  name: PENDING_COOKIE,
  maxAge: 60 * 10, // 10 minutes
  cookie: {
    path: "/",
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
  },
});

const encoder = new TextEncoder();

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signOtpToken(phone: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  const payload = JSON.stringify({ phone, verifiedAt: Date.now() });
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${base64UrlEncode(payload)}.${base64UrlEncode(signature)}`;
}

export const sendOtp = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => {
    if (!data || typeof data.phone !== "string" || data.phone.length < 6) {
      throw new Error("Invalid phone number");
    }
    return { phone: data.phone.replace(/[^0-9]/g, "") };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) throw new Error("TWO_FACTOR_API_KEY missing");
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${data.phone}/AUTOGEN`;
    const res = await fetch(url);
    const json: { Status?: string; Details?: string } = await res.json();
    if (json.Status !== "Success" || !json.Details) {
      throw new Error("Failed to send OTP");
    }
    return { sessionId: json.Details };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; otp: string; phone: string }) => {
    if (
      !data ||
      typeof data.sessionId !== "string" ||
      typeof data.otp !== "string" ||
      typeof data.phone !== "string"
    ) {
      throw new Error("Invalid input");
    }
    // Strict allowlist: 2Factor session IDs are UUIDs. Reject anything that
    // could alter the upstream URL path (slashes, dots, query chars, etc.).
    if (!/^[A-Za-z0-9-]{8,64}$/.test(data.sessionId)) {
      throw new Error("Invalid session id");
    }
    const otp = data.otp.replace(/[^0-9]/g, "");
    const phone = data.phone.replace(/[^0-9]/g, "");
    if (otp.length < 4 || otp.length > 8) throw new Error("Invalid OTP");
    if (phone.length < 6 || phone.length > 15) throw new Error("Invalid phone");
    return {
      sessionId: data.sessionId,
      otp,
      phone,
    };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) throw new Error("TWO_FACTOR_API_KEY missing");
    const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/VERIFY/${encodeURIComponent(data.sessionId)}/${encodeURIComponent(data.otp)}`;
    const res = await fetch(url);
    const json: { Status?: string; Details?: string } = await res.json();
    if (json.Status !== "Success") {
      throw new Error("OTP mismatch");
    }
    // Mark phone as verified for ~10 min so the next step can write the profile.
    const session = await useSession<{ phone: string; verifiedAt: number }>(sessionConfig());
    await session.update({ phone: data.phone, verifiedAt: Date.now() });
    const verificationToken = await signOtpToken(data.phone);
    return { verified: true, verificationToken };
  });
