import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, signMfaToken, verifyMfaToken, requireAuth, AuthRequest } from "../lib/auth";
import { sendOtp, verifyOtp } from "../lib/otp";
import { sendSmsOtp, sendVoiceOtp, verifySmsOtp, verifyVoiceOtp, maskPhone } from "../lib/sms";

const router = Router();

// ─── Superadmin constants ────────────────────────────────────────────────────
const SUPERADMIN_EMAIL = "paulpelumi@gmail.com";
const SUPERADMIN_PASSWORD = "Zetrynx.123@";
const SUPERADMIN_ID = 999999;

async function ensureSuperadmin(): Promise<typeof usersTable.$inferSelect | null> {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
  if (existing) return existing;
  const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
  const [created] = await db.insert(usersTable).values({
    email: SUPERADMIN_EMAIL,
    name: "App Developer",
    passwordHash: hash,
    role: "admin",
    isActive: true,
  }).returning();
  return created;
}

function smsVerifiedRecently(user: typeof usersTable.$inferSelect): boolean {
  if (!user.smsVerifiedAt) return false;
  return (Date.now() - user.smsVerifiedAt.getTime()) < 12 * 60 * 60 * 1000;
}

// ─── Login ───────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "BadRequest", message: "Email and password required" });
      return;
    }

    // Superadmin bypass — direct access, no OTP, no MFA
    if (email.toLowerCase() === SUPERADMIN_EMAIL && password === SUPERADMIN_PASSWORD) {
      const sa = await ensureSuperadmin();
      const token = signToken({ userId: sa!.id, email: SUPERADMIN_EMAIL, role: "admin" });
      res.json({
        token,
        user: { id: sa!.id, email: SUPERADMIN_EMAIL, name: "Admin", role: "admin", department: null, avatar: sa!.avatar, isActive: true, createdAt: sa!.createdAt },
      });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    // SMS MFA check
    if (smsVerifiedRecently(user)) {
      const token = signToken({ userId: user.id, email: user.email, role: user.role });
      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, avatar: user.avatar, isActive: user.isActive, createdAt: user.createdAt },
      });
      return;
    }

    const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });

    if (!user.phone) {
      res.json({ mfaPending: true, requirePhone: true, mfaToken });
      return;
    }

    const result = await sendSmsOtp(user.phone);
    res.json({
      mfaPending: true,
      mfaToken,
      phone: maskPhone(user.phone),
      smsFailed: result.failed ?? false,
      devMode: result.devMode,
      ...(result.devMode ? { code: result.code } : {}),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Login failed" });
  }
});

// ─── Verify SMS / Voice / Email OTP ──────────────────────────────────────────
router.post("/verify-sms", async (req, res) => {
  try {
    const { mfaToken, otpCode, isVoice, isEmail } = req.body;
    if (!mfaToken || !otpCode) {
      res.status(400).json({ error: "BadRequest", message: "mfaToken and otpCode required" });
      return;
    }

    let payload;
    try { payload = verifyMfaToken(mfaToken); } catch {
      res.status(401).json({ error: "InvalidToken", message: "Session expired, please sign in again" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }

    // Phone required for SMS/voice but not when verifying via email fallback
    if (!isEmail && !user.phone) {
      res.status(400).json({ error: "NoPhone", message: "No phone number on file" });
      return;
    }

    let valid: boolean;
    if (isEmail) {
      ({ valid } = verifyOtp(payload.email, "mfa-email", otpCode));
    } else if (isVoice) {
      valid = await verifyVoiceOtp(user.phone!, otpCode);
    } else {
      valid = verifySmsOtp(user.phone!, otpCode);
    }

    if (!valid) {
      res.status(400).json({ error: "InvalidOTP", message: "Invalid or expired code" });
      return;
    }

    await db.update(usersTable).set({ smsVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, avatar: user.avatar, isActive: user.isActive, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("verify-sms error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Verification failed" });
  }
});

// ─── Request voice call OTP ───────────────────────────────────────────────────
router.post("/call-otp", async (req, res) => {
  try {
    const { mfaToken } = req.body;
    if (!mfaToken) { res.status(400).json({ error: "BadRequest", message: "mfaToken required" }); return; }

    let payload;
    try { payload = verifyMfaToken(mfaToken); } catch {
      res.status(401).json({ error: "InvalidToken", message: "Session expired, please sign in again" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user?.phone) { res.status(400).json({ error: "NoPhone" }); return; }

    const result = await sendVoiceOtp(user.phone);
    res.json({ called: true, failed: result.failed ?? false, devMode: result.devMode });
  } catch (err) {
    console.error("call-otp error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed to initiate call" });
  }
});

// ─── Email OTP fallback for MFA ───────────────────────────────────────────────
router.post("/mfa/email-otp", async (req, res) => {
  try {
    const { mfaToken } = req.body;
    if (!mfaToken) { res.status(400).json({ error: "BadRequest", message: "mfaToken required" }); return; }

    let payload;
    try { payload = verifyMfaToken(mfaToken); } catch {
      res.status(401).json({ error: "InvalidToken", message: "Session expired, please sign in again" });
      return;
    }

    const result = await sendOtp(payload.email, "mfa-email");
    res.json({ sent: true, devMode: result.devMode, ...(result.devMode ? { code: result.code } : {}) });
  } catch (err) {
    console.error("mfa/email-otp error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed to send email OTP" });
  }
});

// ─── Resend SMS OTP ───────────────────────────────────────────────────────────
router.post("/resend-sms", async (req, res) => {
  try {
    const { mfaToken } = req.body;
    if (!mfaToken) { res.status(400).json({ error: "BadRequest", message: "mfaToken required" }); return; }

    let payload;
    try { payload = verifyMfaToken(mfaToken); } catch {
      res.status(401).json({ error: "InvalidToken", message: "Session expired, please sign in again" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user?.phone) { res.status(400).json({ error: "NoPhone" }); return; }

    const result = await sendSmsOtp(user.phone);
    res.json({ sent: true, failed: result.failed ?? false, devMode: result.devMode, ...(result.devMode ? { code: result.code } : {}) });
  } catch (err) {
    console.error("resend-sms error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed to resend code" });
  }
});

// ─── Add phone then send SMS ──────────────────────────────────────────────────
router.post("/mfa/add-phone", async (req, res) => {
  try {
    const { mfaToken, phone } = req.body;
    if (!mfaToken || !phone) { res.status(400).json({ error: "BadRequest", message: "mfaToken and phone required" }); return; }

    let payload;
    try { payload = verifyMfaToken(mfaToken); } catch {
      res.status(401).json({ error: "InvalidToken", message: "Session expired, please sign in again" });
      return;
    }

    await db.update(usersTable).set({ phone, updatedAt: new Date() }).where(eq(usersTable.id, payload.userId));

    const result = await sendSmsOtp(phone);
    res.json({
      sent: true,
      phone: maskPhone(phone),
      devMode: result.devMode,
      ...(result.devMode ? { code: result.code } : {}),
    });
  } catch (err) {
    console.error("mfa/add-phone error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed" });
  }
});

// ─── Send OTP ────────────────────────────────────────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const { email, purpose, data } = req.body;
    if (!email || !purpose) {
      res.status(400).json({ error: "BadRequest", message: "email and purpose required" });
      return;
    }

    // For forgot-password: check that user with this email exists
    if (purpose === "forgot-password") {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
      if (!user) {
        // Don't reveal whether email exists — return 200 anyway
        res.json({ sent: true });
        return;
      }
    }

    const result = await sendOtp(email.toLowerCase(), purpose, data);

    // In dev mode (no SMTP), return the code so the UI can display it
    res.json({ sent: true, devMode: result.devMode, ...(result.devMode ? { code: result.code } : {}) });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed to send OTP" });
  }
});

// ─── Register with OTP verification ──────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone, otpCode } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "BadRequest", message: "Name, email, and password required" });
      return;
    }

    // Verify OTP
    if (!otpCode) {
      res.status(400).json({ error: "OTPRequired", message: "Verification code required" });
      return;
    }
    const { valid } = verifyOtp(email.toLowerCase(), "signup", otpCode);
    if (!valid) {
      res.status(400).json({ error: "InvalidOTP", message: "Invalid or expired verification code" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Conflict", message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(), name, passwordHash,
      role: "viewer",
      phone: phone || null,
      isActive: true,
    }).returning();

    // New accounts go straight to SMS MFA on first login — no bypass here
    const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });
    if (!user.phone) {
      res.status(201).json({ mfaPending: true, requirePhone: true, mfaToken });
      return;
    }
    const result = await sendSmsOtp(user.phone);
    res.status(201).json({
      mfaPending: true,
      mfaToken,
      phone: maskPhone(user.phone),
      smsFailed: result.failed ?? false,
      devMode: result.devMode,
      ...(result.devMode ? { code: result.code } : {}),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Registration failed" });
  }
});

// ─── Forgot password — send OTP ───────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: "BadRequest", message: "Email required" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) { res.json({ sent: true }); return; } // don't reveal existence

    const result = await sendOtp(email.toLowerCase(), "forgot-password");
    res.json({ sent: true, devMode: result.devMode, ...(result.devMode ? { code: result.code } : {}) });
  } catch (err) {
    console.error("forgot-password error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed" });
  }
});

// ─── Reset password via OTP ───────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otpCode, newPassword } = req.body;
    if (!email || !otpCode || !newPassword) {
      res.status(400).json({ error: "BadRequest", message: "email, otpCode, newPassword required" });
      return;
    }
    const { valid } = verifyOtp(email.toLowerCase(), "forgot-password", otpCode);
    if (!valid) {
      res.status(400).json({ error: "InvalidOTP", message: "Invalid or expired code" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [user] = await db.update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.email, email.toLowerCase()))
      .returning();
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("reset-password error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Failed" });
  }
});

// ─── OAuth helpers ───────────────────────────────────────────────────────────
function getBaseUrl(req: Request): string {
  return process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
}

async function upsertOAuthUser(email: string, name: string, avatar?: string | null) {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    const placeholder = await bcrypt.hash(randomUUID(), 10);
    [user] = await db.insert(usersTable).values({
      email, name,
      passwordHash: placeholder,
      role: "viewer",
      isActive: true,
      avatar: avatar || null,
    }).returning();
  }
  return user;
}

async function oauthFinish(req: Request, res: import("express").Response, user: typeof usersTable.$inferSelect) {
  const base = getBaseUrl(req);

  // Superadmin has unconditional access — no MFA ever
  if (user.email === SUPERADMIN_EMAIL) {
    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.redirect(`${base}/login?oauth_token=${token}`);
    return;
  }

  if (smsVerifiedRecently(user)) {
    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.redirect(`${base}/login?oauth_token=${token}`);
    return;
  }

  const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });

  if (!user.phone) {
    res.redirect(`${base}/login?mfa_token=${mfaToken}&require_phone=true`);
    return;
  }

  const result = await sendSmsOtp(user.phone);
  const params = new URLSearchParams({
    mfa_token: mfaToken,
    phone: maskPhone(user.phone),
  });
  if (result.failed) params.set("sms_failed", "true");
  if (result.devMode && result.code) params.set("sms_code", result.code);
  res.redirect(`${base}/login?${params}`);
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
router.get("/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) { res.status(503).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID env var." }); return; }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getBaseUrl(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query as { code?: string; error?: string };
  const base = getBaseUrl(req);
  if (error || !code) { res.redirect(`${base}/login?oauth_error=cancelled`); return; }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${base}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("No access token returned");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json() as { email?: string; name?: string; picture?: string };
    const email = profile.email?.toLowerCase();
    if (!email) throw new Error("Google did not return an email");

    const user = await upsertOAuthUser(email, profile.name || email, profile.picture);
    await oauthFinish(req, res, user);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect(`${getBaseUrl(req)}/login?oauth_error=failed`);
  }
});

// ─── Microsoft / Outlook OAuth ────────────────────────────────────────────────
router.get("/microsoft", (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) { res.status(503).json({ error: "Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID env var." }); return; }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getBaseUrl(req)}/api/auth/microsoft/callback`,
    response_type: "code",
    scope: "openid email profile User.Read",
    response_mode: "query",
    prompt: "select_account",
  });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});

router.get("/microsoft/callback", async (req, res) => {
  const { code, error } = req.query as { code?: string; error?: string };
  const base = getBaseUrl(req);
  if (error || !code) { res.redirect(`${base}/login?oauth_error=cancelled`); return; }
  try {
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: `${base}/api/auth/microsoft/callback`,
        grant_type: "authorization_code",
        scope: "openid email profile User.Read",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("No access token returned");

    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json() as { displayName?: string; mail?: string; userPrincipalName?: string };
    const email = (profile.mail || profile.userPrincipalName)?.toLowerCase();
    if (!email) throw new Error("Microsoft did not return an email");

    const user = await upsertOAuthUser(email, profile.displayName || email);
    await oauthFinish(req, res, user);
  } catch (err) {
    console.error("Microsoft OAuth error:", err);
    res.redirect(`${getBaseUrl(req)}/login?oauth_error=failed`);
  }
});

// ─── Me ───────────────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound", message: "User not found" }); return; }
    res.json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      department: user.department, jobPosition: user.jobPosition,
      phone: user.phone, country: user.country, avatar: user.avatar,
      isActive: user.isActive, createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "InternalServerError", message: "Failed to get user" });
  }
});

export { SUPERADMIN_EMAIL };
export default router;
