import nodemailer from "nodemailer";

interface OtpEntry {
  code: string;
  expiresAt: number;
  data?: Record<string, any>;
}

const store = new Map<string, OtpEntry>();

function gc() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}

export function genOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export type OtpPurpose = "signup" | "phone-change" | "forgot-password";

export async function sendOtp(
  email: string,
  purpose: OtpPurpose,
  data?: Record<string, any>
): Promise<{ code: string; devMode: boolean }> {
  gc();
  const code = genOtp();
  store.set(`${email}:${purpose}`, { code, expiresAt: Date.now() + 10 * 60 * 1000, data });

  const devMode = !process.env.SMTP_HOST;
  if (!devMode) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const subjects: Record<OtpPurpose, string> = {
      "signup": "Verify your email — Zentryx",
      "forgot-password": "Reset your password — Zentryx",
      "phone-change": "Confirm your phone number — Zentryx",
    };

    await transporter.sendMail({
      from: `Zentryx <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: subjects[purpose],
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;color:#fff;border-radius:16px">
        <h2 style="color:#7c3aed">Zentryx R&amp;D Intelligence</h2>
        <p style="color:#94a3b8">Your one-time verification code:</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:10px;background:#1e1e2e;padding:24px;border-radius:12px;text-align:center;margin:20px 0">${code}</div>
        <p style="color:#94a3b8;font-size:13px">Expires in 10 minutes. Never share this code.</p>
      </div>`,
    });
  }
  return { code, devMode };
}

export function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): { valid: boolean; data?: Record<string, any> } {
  const entry = store.get(`${email}:${purpose}`);
  if (!entry || entry.expiresAt < Date.now()) { store.delete(`${email}:${purpose}`); return { valid: false }; }
  if (entry.code !== code) return { valid: false };
  const data = entry.data;
  store.delete(`${email}:${purpose}`);
  return { valid: true, data };
}
