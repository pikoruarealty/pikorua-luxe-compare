// Short-lived signed proof that a channel (phone or email) was verified by OTP.
//
// The claim travels back to the client between steps so the final "create my
// profile" call can prove both channels were confirmed, without keeping
// server-side state alive across the whole multi-step sign-up.
//
// Claims carry `typ`, and readers must say which type they expect. Before that,
// a phone claim and an email claim were the same envelope, told apart only by
// which key the reader happened to look at — and Google sign-in minted a claim
// interchangeable with an email-OTP one. Nothing exploitable fell out of that,
// because each reader only ever looked for its own field, but it held by the
// shape of the JSON rather than by anything checking.
//
// This does invalidate claims issued by the previous build. They live ten
// minutes, so the blast radius is one sign-up flow having to start again.

const encoder = new TextEncoder();

function base64UrlEncode(value: string | ArrayBuffer | Uint8Array): string {
  const bytes =
    typeof value === "string"
      ? encoder.encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET missing");
  return value;
}

async function hmac(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** Which channel a claim attests to. Part of the signed bytes. */
export type ClaimType = "phone" | "email";

/** `<base64url(json)>.<base64url(hmac)>` */
export async function signClaim(typ: ClaimType, payload: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify({ typ, ...payload });
  return `${base64UrlEncode(json)}.${base64UrlEncode(await hmac(json))}`;
}

/** Returns the payload only if the signature checks out, the type is the one
 *  asked for, and it is still fresh. */
export async function readClaim<T extends { verifiedAt: number }>(
  typ: ClaimType,
  token: string | null | undefined,
  maxAgeMs: number,
): Promise<T | null> {
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  let json: string;
  let provided: Uint8Array;
  try {
    json = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    // Decoded inside the guard too: atob throws on a malformed signature
    // segment, and that used to escape this function as a 500 rather than
    // returning null like every other rejection here.
    provided = base64UrlToBytes(signaturePart);
  } catch {
    return null;
  }

  if (!timingSafeEqual(provided, await hmac(json))) return null;

  try {
    const parsed = JSON.parse(json) as T & { typ?: string };
    if (parsed?.typ !== typ) return null;
    if (typeof parsed?.verifiedAt !== "number") return null;
    if (Date.now() - parsed.verifiedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** One-way digest of an OTP, so a leaked cookie never reveals the live code. */
export async function hashOtp(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${code}:${secret()}`));
  return base64UrlEncode(digest);
}

export function constantTimeStringEqual(a: string, b: string): boolean {
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}
