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
  store.set(`${email}:${purpose}`, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    data,
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

export function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): { valid: boolean; data?: Record<string, any> } {
  const entry = store.get(`${email}:${purpose}`);
  if (!entry || entry.expiresAt < Date.now()) {
    store.delete(`${email}:${purpose}`);
    return { valid: false };
  }
  if (entry.code !== code) return { valid: false };
  const data = entry.data;
  store.delete(`${email}:${purpose}`);
  return { valid: true, data };
}