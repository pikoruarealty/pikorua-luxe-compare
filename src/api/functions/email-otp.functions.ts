import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

const EMAIL_OTP_COOKIE = "pikorua-email-otp";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

interface EmailOtpSession {
  email: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

const sessionConfig = () => ({
  password: process.env.SESSION_SECRET!,
  name: EMAIL_OTP_COOKIE,
  maxAge: 60 * 15,
  cookie: {
    path: "/",
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
  },
});

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
    text: `Your Pikorua verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e7ea;">
          <tr><td style="padding:32px 32px 8px;">
            <p style="margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#ab853c;font-weight:700;">Pikorua</p>
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
            <p style="margin:18px 0 0;font-size:11.5px;color:#a1a5ae;">Pikorua &middot; Luxury residence comparison</p>
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
      sender: { name: process.env.BREVO_SENDER_NAME || "Pikorua", email: senderEmail },
      to: [{ email }],
      subject: `${code} is your Pikorua verification code`,
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
    const session = await useSession<EmailOtpSession>(sessionConfig());

    // Throttle resends per browser session, so the button can't be used to
    // hammer someone else's inbox.
    const prev = session.data;
    if (prev?.sentAt && prev.email === data.email && Date.now() - prev.sentAt < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - prev.sentAt)) / 1000);
      throw new Error(`Please wait ${waitSeconds}s before requesting another code.`);
    }

    const code = generateCode();
    const { hashOtp } = await import("@/server/verification-token.server");

    await deliver(data.email, code);
    await session.update({
      email: data.email,
      codeHash: await hashOtp(code),
      expiresAt: Date.now() + CODE_TTL_MS,
      sentAt: Date.now(),
      attempts: 0,
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
    const session = await useSession<EmailOtpSession>(sessionConfig());
    // useSession types every field as optional, so pin the shape down once
    // rather than defending against undefined at each check below.
    const stored = session.data as Partial<EmailOtpSession> | undefined;
    if (!stored?.codeHash || !stored.expiresAt || stored.email !== data.email) {
      throw new Error("Request a new code to continue.");
    }
    const pending: EmailOtpSession = {
      email: stored.email,
      codeHash: stored.codeHash,
      expiresAt: stored.expiresAt,
      sentAt: stored.sentAt ?? 0,
      attempts: stored.attempts ?? 0,
    };

    if (Date.now() > pending.expiresAt) {
      await session.clear();
      throw new Error("That code expired. Request a new one.");
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await session.clear();
      throw new Error("Too many incorrect attempts. Request a new code.");
    }

    const { hashOtp, constantTimeStringEqual, signClaim } = await import(
      "@/server/verification-token.server"
    );

    if (!constantTimeStringEqual(await hashOtp(data.otp), pending.codeHash)) {
      await session.update({ ...pending, attempts: pending.attempts + 1 });
      const left = MAX_ATTEMPTS - (pending.attempts + 1);
      throw new Error(
        left > 0 ? "That code didn't match. Try again." : "Too many incorrect attempts.",
      );
    }

    await session.clear();
    return {
      verified: true,
      emailToken: await signClaim({ email: data.email, verifiedAt: Date.now() }),
    };
  });
