import { randomInt } from "crypto";

const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID || "Zentryx";
const TERMII_CHANNEL = process.env.TERMII_CHANNEL || "dnd";

// ─── OTP stores ──────────────────────────────────────────────────────────────
interface OtpEntry { code: string; expiresAt: number; }
const smsStore = new Map<string, OtpEntry>();
const voicePinStore = new Map<string, string>(); // phone → Termii pinId

function smsKey(phone: string) { return `sms:${phone}`; }

// ─── Send SMS OTP ─────────────────────────────────────────────────────────────
export async function sendSmsOtp(phone: string): Promise<{ devMode: boolean; code?: string; failed?: boolean }> {
  const code = String(randomInt(100000, 999999));
  smsStore.set(smsKey(phone), { code, expiresAt: Date.now() + 10 * 60 * 1000 });

  if (!TERMII_API_KEY) {
    console.log(`[DEV] SMS OTP for ${phone}: ${code}`);
    return { devMode: true, code };
  }

  try {
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
    if (!r.ok) throw new Error(body.message || "Termii SMS failed");
    return { devMode: false };
  } catch (err) {
    console.error("Termii SMS send failed:", err);
    // Code is still stored — user can still verify if they receive it, or try voice
    return { devMode: false, failed: true };
  }
}

// ─── Send Voice OTP ───────────────────────────────────────────────────────────
export async function sendVoiceOtp(phone: string): Promise<{ devMode: boolean; failed?: boolean }> {
  if (!TERMII_API_KEY) {
    // Dev: reuse the existing stored code (or generate one if none)
    if (!smsStore.has(smsKey(phone))) {
      const code = String(randomInt(100000, 999999));
      smsStore.set(smsKey(phone), { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    }
    console.log(`[DEV] Voice OTP for ${phone}: ${smsStore.get(smsKey(phone))!.code}`);
    return { devMode: true };
  }

  try {
    const r = await fetch("https://api.ng.termii.com/api/sms/otp/send/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        phone_number: phone,
        pin_attempts: 3,
        pin_time_to_live: 10,
        pin_length: 6,
      }),
    });
    const body = await r.json().catch(() => ({})) as { pinId?: string; message?: string };
    if (!r.ok || !body.pinId) throw new Error(body.message || "Voice call failed");
    voicePinStore.set(phone, body.pinId);
    return { devMode: false };
  } catch (err) {
    console.error("Termii voice OTP failed:", err);
    return { devMode: false, failed: true };
  }
}

// ─── Verify SMS OTP (local store) ─────────────────────────────────────────────
export function verifySmsOtp(phone: string, code: string): boolean {
  const entry = smsStore.get(smsKey(phone));
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { smsStore.delete(smsKey(phone)); return false; }
  if (entry.code !== code) return false;
  smsStore.delete(smsKey(phone));
  return true;
}

// ─── Verify Voice OTP (Termii API, falls back to local in dev) ────────────────
export async function verifyVoiceOtp(phone: string, code: string): Promise<boolean> {
  const pinId = voicePinStore.get(phone);

  // Dev mode or no pinId — fall back to local store (works in dev)
  if (!TERMII_API_KEY || !pinId) {
    return verifySmsOtp(phone, code);
  }

  try {
    const r = await fetch("https://api.ng.termii.com/api/sms/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TERMII_API_KEY, pin_id: pinId, pin: code }),
    });
    const body = await r.json().catch(() => ({})) as { verified?: string | boolean };
    const ok = body.verified === "True" || body.verified === true;
    if (ok) voicePinStore.delete(phone);
    return ok;
  } catch {
    return false;
  }
}

// ─── Mask phone ───────────────────────────────────────────────────────────────
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, -4).replace(/\d/g, "*") + phone.slice(-4);
}
