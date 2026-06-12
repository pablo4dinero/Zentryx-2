import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { usersTable, loginAttemptsTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, signSuperadminToken, signMfaToken, verifyMfaToken, requireAuth, AuthRequest } from "../lib/auth";
import { mfaRequiredForRole } from "./mfa";
import { sendOtp, verifyOtp } from "../lib/otp";
import { sendSmsOtp, sendVoiceOtp, verifySmsOtp, verifyVoiceOtp, maskPhone } from "../lib/sms";
import { createAccessRequest, getRequest } from "../lib/access-requests";

// Append a row to the login audit trail. Never throws — auth flow must
// not fail because the audit insert failed.
async function logLoginAttempt(req: Request, opts: { userId: number | null; email: string; success: boolean; reason: string }): Promise<void> {
  try {
    const xf = req.headers["x-forwarded-for"];
    const ip = Array.isArray(xf) ? xf[0] : (xf?.toString().split(",")[0].trim() || req.socket.remoteAddress || null);
    const ua = req.headers["user-agent"] || null;
    await db.insert(loginAttemptsTable).values({
      userId: opts.userId,
      email: opts.email,
      success: opts.success,
      reason: opts.reason,
      ipAddress: ip,
      userAgent: ua ? String(ua) : null,
    });
  } catch (err) {
    console.error("[auth] logLoginAttempt failed", err);
  }
}

const router = Router();

// ─── Superadmin (env-backed, fail-loud) ──────────────────────────────────────
//
// Both values come from Render environment variables. There is no
// fallback — if either is missing the server refuses to boot, same
// pattern as JWT_SECRET. The password is stored as a bcrypt HASH, not
// plaintext, so a leaked env var doesn't directly reveal the password.
//
// Generate a fresh hash locally with:
//   node scripts/hash-password.js
// then paste the output into SUPERADMIN_PASSWORD_HASH on Render.

// Superadmin credentials are optional. If not provided, superadmin access
// is disabled until configured via environment variables and server restart.
function validateSuperadminEnv(): { email: string; passwordHash: string } | null {
  const email = process.env.SUPERADMIN_EMAIL;
  const passwordHash = process.env.SUPERADMIN_PASSWORD_HASH;

  // Both must be present or both must be absent
  if (!email || !passwordHash) {
    if (email || passwordHash) {
      console.warn(
        "[auth] Superadmin partially configured: both SUPERADMIN_EMAIL and " +
        "SUPERADMIN_PASSWORD_HASH must be set together. Superadmin access is disabled."
      );
    } else {
      console.warn(
        "[auth] Superadmin credentials not configured. Superadmin access is disabled. " +
        "To enable: set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD_HASH in environment."
      );
    }
    return null;
  }

  // Validate bcrypt hash format
  if (!passwordHash.startsWith("$2")) {
    console.error(
      `[auth] SUPERADMIN_PASSWORD_HASH does not look like a bcrypt hash ` +
      `(should start with "$2a$" or "$2b$"). Did you paste the plaintext by mistake? ` +
      `Superadmin access is disabled.`
    );
    return null;
  }

  return { email: email.toLowerCase(), passwordHash };
}

const SUPERADMIN_CREDS = validateSuperadminEnv();
const SUPERADMIN_EMAIL = SUPERADMIN_CREDS?.email ?? "";
const SUPERADMIN_PASSWORD_HASH = SUPERADMIN_CREDS?.passwordHash ?? "";

async function ensureSuperadmin(): Promise<typeof usersTable.$inferSelect | null> {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(usersTable).values({
    email: SUPERADMIN_EMAIL,
    name: "App Developer",
    passwordHash: SUPERADMIN_PASSWORD_HASH,
    role: "admin",
    isActive: true,
  }).returning();
  return created;
}

// ─── Login ───────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "BadRequest", message: "Email and password required" });
      return;
    }

    // Superadmin bypass — direct access, no OTP, no MFA. Password is
    // checked with bcrypt.compare against the hash from env, not string
    // equality on a hardcoded plaintext. Only enabled if credentials are configured.
    if (SUPERADMIN_CREDS && email.toLowerCase() === SUPERADMIN_CREDS.email) {
      const ok = await bcrypt.compare(password, SUPERADMIN_CREDS.passwordHash);
      if (ok) {
        const sa = await ensureSuperadmin();
        // Superadmin gets a noExpiry token — exempt from 6h idle / 12h absolute.
        const token = signSuperadminToken({ userId: sa!.id, email: SUPERADMIN_CREDS.email, role: "admin" });
        await logLoginAttempt(req, { userId: sa!.id, email: SUPERADMIN_CREDS.email, success: true, reason: "ok_superadmin" });
        res.json({
          token,
          user: { id: sa!.id, email: SUPERADMIN_CREDS.email, name: "Admin", role: "admin", department: null, avatar: sa!.avatar, isActive: true, createdAt: sa!.createdAt },
        });
        return;
      }
      // Wrong password for the superadmin email — log it and fall through
      // to the standard "invalid credentials" response below by NOT
      // returning. We don't drop into the normal user-lookup branch
      // because we don't want the DB-hash fallback to also accept this
      // email; env hash is the only valid credential for the superadmin.
      await logLoginAttempt(req, { userId: null, email, success: false, reason: "invalid_superadmin_password" });
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      await logLoginAttempt(req, { userId: null, email, success: false, reason: "user_not_found" });
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }
    if (!user.isActive) {
      await logLoginAttempt(req, { userId: user.id, email, success: false, reason: "user_inactive" });
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await logLoginAttempt(req, { userId: user.id, email, success: false, reason: "invalid_password" });
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    // ── Phase 1 first-time admin approval gate ──────────────────────
    // Block login if the user's approval_status is anything other than
    // 'approved'. Existing users were backfilled to 'approved' so the
    // change is non-breaking for everyone in the system pre-Phase-1.
    if (user.approvalStatus === "pending") {
      await logLoginAttempt(req, { userId: user.id, email, success: false, reason: "approval_pending" });
      res.status(403).json({
        error: "ApprovalPending",
        message: "Your account is awaiting administrator approval. You'll receive an email when access is granted.",
      });
      return;
    }
    if (user.approvalStatus === "denied") {
      await logLoginAttempt(req, { userId: user.id, email, success: false, reason: "approval_denied" });
      res.status(403).json({
        error: "ApprovalDenied",
        message: user.deniedReason
          ? `Access denied: ${user.deniedReason}. Contact your administrator if you believe this is in error.`
          : "Access denied. Contact your administrator if you believe this is in error.",
      });
      return;
    }

    // ── Phase 1 MFA branching ─────────────────────────────────────────
    //
    // 1. User has TOTP enrolled    → issue mfaToken + mfaType "totp",
    //                                frontend prompts for the 6-digit code.
    // 2. Role mandates MFA but not yet enrolled → issue mfaToken +
    //    mustEnrollMfa, frontend redirects to enrollment screen.
    // 3. Optional-MFA role, not enrolled → log in directly. They can
    //    opt into TOTP via Settings later.
    //
    // The legacy "smsVerifiedRecently" 12-hour shortcut is gone — TOTP
    // is the only routine second factor going forward. SMS is reduced
    // to a fallback after 3 failed TOTP attempts (wired in chunk 3).

    const mfaEnrolled = !!user.mfaSecret && !!user.mfaEnrolledAt;
    const mfaMandatory = mfaRequiredForRole(user.role);

    if (mfaEnrolled) {
      await logLoginAttempt(req, { userId: user.id, email: user.email, success: true, reason: "password_ok_totp_required" });
      const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });
      res.json({ mfaPending: true, mfaType: "totp", mfaToken });
      return;
    }

    if (mfaMandatory) {
      await logLoginAttempt(req, { userId: user.id, email: user.email, success: true, reason: "password_ok_must_enroll_mfa" });
      const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });
      res.json({ mfaPending: true, mustEnrollMfa: true, mfaToken });
      return;
    }

    // Optional-MFA role, not enrolled — straight to a full session.
    await logLoginAttempt(req, { userId: user.id, email: user.email, success: true, reason: "ok" });
    const token = signToken({ userId: user.id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, avatar: user.avatar, isActive: user.isActive, createdAt: user.createdAt },
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
      ({ valid } = await verifyOtp(payload.email, "mfa-email", otpCode));
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

    const token = signToken({ userId: user.id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 });
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

// ─── Request admin access ─────────────────────────────────────────────────────
router.post("/request-access", async (req, res) => {
  try {
    const { mfaToken } = req.body;
    if (!mfaToken) { res.status(400).json({ error: "BadRequest", message: "mfaToken required" }); return; }

    let payload;
    try { payload = verifyMfaToken(mfaToken); } catch {
      res.status(401).json({ error: "InvalidToken", message: "Session expired, please sign in again" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }

    const request = createAccessRequest(user.id, user.email, user.name);
    res.json({ requestId: request.id });
  } catch (err) {
    console.error("request-access error:", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Poll access request status ───────────────────────────────────────────────
router.get("/access-request-status", async (req, res) => {
  try {
    const { requestId } = req.query as { requestId?: string };
    if (!requestId) { res.status(400).json({ error: "BadRequest" }); return; }

    const request = getRequest(requestId);
    if (!request) { res.json({ status: "expired" }); return; }

    if (request.status === "approved" && request.approvedToken) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, request.userId)).limit(1);
      res.json({
        status: "approved",
        token: request.approvedToken,
        user: user ? { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, avatar: user.avatar, isActive: user.isActive, createdAt: user.createdAt } : null,
      });
      return;
    }

    res.json({ status: request.status });
  } catch (err) {
    console.error("access-request-status error:", err);
    res.status(500).json({ error: "InternalServerError" });
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
    const { valid } = await verifyOtp(email.toLowerCase(), "signup", otpCode);
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
    // New password-registered accounts also land as `pending` — first-
    // time admin approval is unified across OAuth + password signup.
    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(), name, passwordHash,
      role: "viewer",
      phone: phone || null,
      isActive: true,
      approvalStatus: "pending",
    }).returning();

    // Notify all admins that a new account is awaiting approval.
    try {
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
      if (admins.length > 0) {
        await db.insert(notificationsTable).values(
          admins.map(a => ({
            userId: a.id,
            type: "system" as const,
            title: "New account awaiting approval",
            message: `${name} (${email}) just registered. Review and approve from the Admin Dashboard.`,
            isRead: false,
          })),
        );
      }
    } catch { /* silent — notification failure must not break signup */ }

    // Return a pending status — frontend will show the "awaiting
    // approval" screen until an admin approves them. No MFA token issued
    // because the user can't log in yet.
    res.status(201).json({ approvalPending: true });
    return;

    // Legacy SMS MFA branch below is no longer reachable (kept as a
    // reference until the next cleanup pass).
    // eslint-disable-next-line no-unreachable
    const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });
    // This SMS branch is unreachable legacy code; TS skips flow-narrowing in
    // unreachable blocks, so coerce phone to a definite string up front.
    const userPhone = user.phone ?? "";
    if (!userPhone) {
      res.status(201).json({ mfaPending: true, requirePhone: true, mfaToken });
      return;
    }
    const result = await sendSmsOtp(userPhone);
    res.status(201).json({
      mfaPending: true,
      mfaToken,
      phone: maskPhone(userPhone),
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
    const { valid } = await verifyOtp(email.toLowerCase(), "forgot-password", otpCode);
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

// Defense-in-depth domain restriction for OAuth sign-in.
// In production, ALLOWED_EMAIL_DOMAINS must be a comma-separated list of
// permitted email domains (e.g. "freddyhirsch.co.za,zentryx.dev"). Any
// OAuth callback whose email doesn't match one of these domains is
// rejected before any user record is touched. In development this is
// optional (empty list means "any domain") for convenience.
//
// Note: this is independent of the Microsoft OAuth `/common/` endpoint
// — the tenant restriction would be enforced by Microsoft. This check
// runs after-the-fact on whichever email the IdP returned, so it catches
// personal Hotmail accounts, non-tenant Google accounts, etc.
function emailDomainAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS || "";
  const allowed = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) {
    // In production we treat missing config as "block everything" — fail-
    // loud rather than silently permitting anyone in.
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const lower = email.toLowerCase();
  return allowed.some(d => lower.endsWith(`@${d}`));
}

async function upsertOAuthUser(email: string, name: string, avatar?: string | null) {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    const placeholder = await bcrypt.hash(randomUUID(), 10);
    // New OAuth signups land as `pending` — the first-time admin
    // approval gate. The user can complete Microsoft OAuth successfully
    // but won't get a session token until an admin approves them.
    [user] = await db.insert(usersTable).values({
      email, name,
      passwordHash: placeholder,
      role: "viewer",
      isActive: true,
      avatar: avatar || null,
      approvalStatus: "pending",
    }).returning();
  }
  return user;
}

async function oauthFinish(req: Request, res: import("express").Response, user: typeof usersTable.$inferSelect) {
  const base = getBaseUrl(req);

  // Superadmin has unconditional access — no MFA, no approval gate, no
  // session expiry. Always lets through.
  if (user.email === SUPERADMIN_EMAIL) {
    const token = signSuperadminToken({ userId: user.id, email: user.email, role: user.role });
    res.redirect(`${base}/login?oauth_token=${token}`);
    return;
  }

  // First-time admin approval gate — applies to OAuth too. Pending /
  // denied users bounce back to the login screen with a clear message
  // surfaced via the `oauth_error` query string.
  if (user.approvalStatus === "pending") {
    res.redirect(`${base}/login?oauth_error=approval_pending`);
    return;
  }
  if (user.approvalStatus === "denied") {
    res.redirect(`${base}/login?oauth_error=approval_denied`);
    return;
  }

  // ── TOTP-first MFA, identical policy to password login ─────────────
  // Once a user has enrolled an authenticator they complete the TOTP
  // challenge on EVERY login — including OAuth — with no 12-hour
  // shortcut. The old smsVerifiedRecently bypass is gone.
  const mfaEnrolled = !!user.mfaSecret && !!user.mfaEnrolledAt;
  const mfaMandatory = mfaRequiredForRole(user.role);

  if (mfaEnrolled) {
    const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });
    res.redirect(`${base}/login?mfa_token=${mfaToken}&mfa_type=totp`);
    return;
  }

  // Role mandates MFA but the user hasn't enrolled yet → force them
  // into authenticator enrollment before a session is issued.
  if (mfaMandatory) {
    const mfaToken = signMfaToken({ userId: user.id, email: user.email, role: user.role });
    res.redirect(`${base}/login?mfa_token=${mfaToken}&must_enroll_mfa=true`);
    return;
  }

  // Optional-MFA role, not enrolled → straight to a full session.
  const token = signToken({ userId: user.id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 });
  res.redirect(`${base}/login?oauth_token=${token}`);
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// Google sign-in is intentionally disabled. Phase 1 standardises on
// Microsoft (Entra ID) since Freddy Hirsch is on Microsoft 365.
// To re-enable: set ENABLE_GOOGLE_OAUTH=true in env and ensure
// GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are present.
router.get("/google", (req, res) => {
  if (process.env.ENABLE_GOOGLE_OAUTH !== "true") {
    res.status(503).json({
      error: "GoogleSignInDisabled",
      message: "Google sign-in is currently disabled. Please use Microsoft sign-in.",
    });
    return;
  }
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

    // Defense-in-depth: only @-allowed-domain emails proceed. Bounces any
    // gmail.com / personal-domain Google account before a Zentryx user
    // record is created.
    if (!emailDomainAllowed(email)) {
      console.warn(`[oauth/google] domain not allowed: ${email}`);
      res.redirect(`${getBaseUrl(req)}/login?oauth_error=domain_not_allowed`);
      return;
    }

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

    // Defense-in-depth: only @-allowed-domain emails proceed. Bounces
    // personal Microsoft accounts (Hotmail, Outlook.com) and any other
    // tenant's users at this gate, never creating a Zentryx user record.
    if (!emailDomainAllowed(email)) {
      console.warn(`[oauth/microsoft] domain not allowed: ${email}`);
      res.redirect(`${base}/login?oauth_error=domain_not_allowed`);
      return;
    }

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
