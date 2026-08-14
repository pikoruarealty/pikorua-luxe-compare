import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import type { EmailOtpSession } from "@/server/session.server";

const CODE_TTL_MS = 10 * 60 * 1000;

// `useSession` is h3's request composable, not a React hook — react-hooks only
// flags it because of the name.
/* eslint-disable react-hooks/rules-of-hooks */
async function emailOtpSession() {
  const { emailOtpConfig } = await import("@/server/session.server");
  return useSession<EmailOtpSession>(emailOtpConfig());
}
/* eslint-enable react-hooks/rules-of-hooks */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a valid email address");
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new Error("Enter a valid email address");
  }
  return email;
}

/** Six digits from the CSPRNG, evenly distributed across 000000-999999. */
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailBody(code: string) {
  const spaced = code.split("").join(" ");
  return {
    text: `Your PropCompare verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e7ea;">
          <tr><td style="padding:32px 32px 8px;">
            <p style="margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#ab853c;font-weight:700;">PropCompare</p>
            <h1 style="margin:14px 0 0;font-size:22px;line-height:1.3;color:#0f1114;font-weight:600;">Confirm your email</h1>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#5c6270;">Enter this code to finish creating your account.</p>
          </td></tr>
          <tr><td style="padding:24px 32px;">
            <div style="background:#faf7f0;border:1px solid #e8dcc0;border-radius:10px;padding:18px;text-align:center;">
              <span style="font-size:30px;letter-spacing:.34em;color:#0f1114;font-weight:700;">${escapeHtml(spaced)}</span>
            </div>
            <p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:#8b909c;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
          </td></tr>
          <tr><td style="padding:0 32px 30px;border-top:1px solid #eeeff1;">
            <p style="margin:18px 0 0;font-size:11.5px;color:#a1a5ae;">PropCompare &middot; Compare. Decide. Confidently.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

async function deliver(email: string, code: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY missing");
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL missing");

  const { text, html } = emailBody(code);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "PropCompare", email: senderEmail },
      to: [{ email }],
      subject: `${code} is your PropCompare verification code`,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Brevo returns a JSON body with `message` / `code` on failure. Log the
    // detail server-side but never surface it — it can name the sender account.
    const detail = await res.text().catch(() => "");
    console.error("[email-otp] Brevo send failed", res.status, detail.slice(0, 500));
    throw new Error("Couldn't send the code right now. Please try again.");
  }
}

/** Emails a fresh 6-digit code and remembers its hash in a sealed cookie. */
export const sendEmailOtp = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => ({ email: normalizeEmail(data?.email) }))
  .handler(async ({ data }) => {
    const session = await emailOtpSession();

    // The old throttle read `sentAt` from the caller's own cookie, so throwing
    // the cookie away bypassed it -- which made the stated purpose, "so the
    // button can't be used to hammer someone else's inbox", the one thing it
    // could not do. Keyed on the address and the caller now, in Redis.
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.EMAIL_SEND, data.email);
    await enforce(POLICIES.EMAIL_SEND, `ip:${await clientIp()}`);

    const code = generateCode();
    const { hashOtp } = await import("@/server/verification-token.server");

    await deliver(data.email, code);
    await session.update({
      email: data.email,
      codeHash: await hashOtp(code),
      expiresAt: Date.now() + CODE_TTL_MS,
      sentAt: Date.now(),
      // Server-chosen, and the only thing tying this cookie to its attempt
      // count. A replayed cookie carries the same id, so it inherits the
      // count rather than resetting it.
      challengeId: crypto.randomUUID(),
    });

    return { sent: true };
  });

/** Checks the code and, on success, returns a signed proof of the address. */
export const verifyEmailOtp = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; otp: string }) => {
    const otp = String(data?.otp ?? "").replace(/[^0-9]/g, "");
    if (otp.length !== 6) throw new Error("Enter the 6-digit code");
    return { email: normalizeEmail(data?.email), otp };
  })
  .handler(async ({ data }) => {
    const session = await emailOtpSession();
    // useSession types every field as optional, so pin the shape down once
    // rather than defending against undefined at each check below.
    const stored = session.data as Partial<EmailOtpSession> | undefined;
    if (!stored?.codeHash || !stored.expiresAt || !stored.challengeId) {
      throw new Error("Request a new code to continue.");
    }
    if (stored.email !== data.email) {
      throw new Error("Request a new code to continue.");
    }

    if (Date.now() > stored.expiresAt) {
      await session.clear();
      throw new Error("That code expired. Request a new one.");
    }

    // Counted server-side against the challenge id, before the comparison
    // rather than after it. The count used to live in this cookie next to the
    // hash, where replaying an untouched copy reset it on every guess.
    const { enforce, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.OTP_ATTEMPT, stored.challengeId);

    const { hashOtp, constantTimeStringEqual, signClaim } =
      await import("@/server/verification-token.server");

    if (!constantTimeStringEqual(await hashOtp(data.otp), stored.codeHash)) {
      throw new Error("That code didn't match. Try again.");
    }

    await session.clear();
    return {
      verified: true,
      emailToken: await signClaim("email", { email: data.email, verifiedAt: Date.now() }),
    };
  });
