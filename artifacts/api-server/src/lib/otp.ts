import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { db } from "@workspace/db";
import { otpCodesTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";

const MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60 * 1000;

// 6-digit OTP generated with crypto.randomInt — cryptographically secure.
// `Math.random()` is a PRNG seeded predictably and is NOT safe for any
// authentication token, however short-lived.
export function genOtp() {
  return randomInt(100000, 1000000).toString();
}

export type OtpPurpose = "signup" | "phone-change" | "forgot-password" | "mfa-email";

// Periodic GC sweep — purge expired rows. Cheap because expires_at is
// indexed via the primary key clustering, and we only sweep on send.
async function gc() {
  try {
    await db.delete(otpCodesTable).where(lt(otpCodesTable.expiresAt, new Date()));
  } catch (err) {
    console.warn("[otp] gc failed", err);
  }
}

export async function sendOtp(
  email: string,
  purpose: OtpPurpose,
  data?: Record<string, any>
): Promise<{ code: string; devMode: boolean }> {
  await gc();
  const code = genOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Upsert — replace any existing pending OTP for this (email, purpose) pair.
  // Re-sending an OTP voids the previous code so the user can't combine attempts
  // from a stale code with the new one.
  await db.delete(otpCodesTable)
    .where(and(eq(otpCodesTable.email, email), eq(otpCodesTable.purpose, purpose)));
  await db.insert(otpCodesTable).values({
    email,
    purpose,
    code,
    data: data ?? null,
    attempts: 0,
    expiresAt,
  });

  const resendApiKey = process.env.RESEND_API_KEY;
  const devMode = !resendApiKey;

  if (!devMode) {
    const transporter = nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: {
        user: "resend",
        pass: resendApiKey,
      },
    });

    const subjects: Record<OtpPurpose, string> = {
      "signup": "Verify your email — Zentryx",
      "forgot-password": "Reset your password — Zentryx",
      "phone-change": "Confirm your phone number — Zentryx",
      "mfa-email": "Your Zentryx sign-in code",
    };

    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

    await transporter.sendMail({
      from: `Zentryx <${fromEmail}>`,
      to: email,
      subject: subjects[purpose],
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;color:#fff;border-radius:16px">
          <h2 style="color:#7c3aed;margin-bottom:8px">Zentryx R&D Intelligence</h2>
          <p style="color:#94a3b8;margin-bottom:24px">
            ${purpose === "signup" ? "Welcome! Please verify your email address to complete your registration." : ""}
            ${purpose === "forgot-password" ? "You requested a password reset. Use the code below." : ""}
            ${purpose === "phone-change" ? "Please confirm your new phone number." : ""}
          </p>
          <p style="color:#94a3b8">Your one-time verification code:</p>
          <div style="font-size:40px;font-weight:700;letter-spacing:10px;background:#1e1e2e;padding:24px;border-radius:12px;text-align:center;margin:20px 0;color:#7c3aed">
            ${code}
          </div>
          <p style="color:#94a3b8;font-size:13px">This code expires in <strong style="color:#fff">10 minutes</strong>.</p>
          <p style="color:#94a3b8;font-size:13px">Never share this code with anyone.</p>
          <hr style="border:none;border-top:1px solid #1e1e2e;margin:24px 0"/>
          <p style="color:#4b5563;font-size:12px">Zentryx R&D Intelligence Suite</p>
        </div>
      `,
    });
  }

  return { code, devMode };
}

export async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<{ valid: boolean; data?: Record<string, any>; reason?: "expired" | "locked" | "mismatch" }> {
  const [row] = await db.select().from(otpCodesTable)
    .where(and(eq(otpCodesTable.email, email), eq(otpCodesTable.purpose, purpose)))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await db.delete(otpCodesTable).where(eq(otpCodesTable.id, row.id));
    return { valid: false, reason: "expired" };
  }

  // Lock-out after MAX_ATTEMPTS failures — kills any chance of brute-forcing
  // the 6-digit space within the 10-minute window.
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.delete(otpCodesTable).where(eq(otpCodesTable.id, row.id));
    return { valid: false, reason: "locked" };
  }

  if (row.code !== code) {
    await db.update(otpCodesTable)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpCodesTable.id, row.id));
    return { valid: false, reason: "mismatch" };
  }

  const data = (row.data ?? undefined) as Record<string, any> | undefined;
  await db.delete(otpCodesTable).where(eq(otpCodesTable.id, row.id));
  return { valid: true, data };
}
