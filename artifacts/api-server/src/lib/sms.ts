import { randomInt } from "crypto";

const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID || "Zentryx";
const TERMII_CHANNEL = process.env.TERMII_CHANNEL || "generic";

interface OtpEntry { code: string; expiresAt: number; }
const store = new Map<string, OtpEntry>();

function otpKey(phone: string) { return `sms:${phone}`; }

export async function sendSmsOtp(phone: string): Promise<{ devMode: boolean; code?: string }> {
  const code = String(randomInt(100000, 999999));
  store.set(otpKey(phone), { code, expiresAt: Date.now() + 10 * 60 * 1000 });

  if (!TERMII_API_KEY) {
    console.log(`[DEV] SMS OTP for ${phone}: ${code}`);
    return { devMode: true, code };
  }

  const r = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone,
      from: TERMII_SENDER_ID,
      sms: `Your Zentryx verification code is: ${code}. Valid for 10 minutes. Do not share.`,
      type: "plain",
      channel: TERMII_CHANNEL,
      api_key: TERMII_API_KEY,
    }),
  });
  const body = await r.json().catch(() => ({})) as { message?: string };
  if (!r.ok) throw new Error(body.message || "Failed to send SMS");
  return { devMode: false };
}

export function verifySmsOtp(phone: string, code: string): boolean {
  const entry = store.get(otpKey(phone));
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { store.delete(otpKey(phone)); return false; }
  if (entry.code !== code) return false;
  store.delete(otpKey(phone));
  return true;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, -4).replace(/\d/g, "*") + phone.slice(-4);
}
