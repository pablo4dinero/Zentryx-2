import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { requireAuth, AuthRequest, verifyMfaToken, signToken } from "../lib/auth";
import {
  generateTotpSecret,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
  verifyTotp,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
} from "../lib/totp";
import { sendSmsOtp, sendVoiceOtp, verifySmsOtp, verifyVoiceOtp, maskPhone } from "../lib/sms";

const router = Router();

// Roles that MUST have MFA enrolled before they can complete login.
// Everyone else can opt in via Settings → Security. Post-Phase-1 these
// are: admin / executive / manager. Legacy values are kept for safety
// in case any user predates the role-consolidation migration.
export function mfaRequiredForRole(role: string | null | undefined): boolean {
  // TOTP is mandatory for all users except superadmin (which bypasses
  // this check entirely in the login flow). Any non-null role gets MFA.
  return !!role;
}

// ─── POST /enroll/start ──────────────────────────────────────────────
// Begins MFA enrollment for the currently-authenticated user. Returns
// the QR-code data URL + the manual-entry secret. Frontend shows both,
// then prompts for the first 6-digit code (verified at /enroll/verify).
//
// Idempotent: re-issuing replaces the in-progress secret. The user
// isn't considered enrolled until /enroll/verify succeeds — that's
// when we set `mfa_enrolled_at`.
router.post("/enroll/start", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }

    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, user.email);
    const qrDataUrl = await generateQrCodeDataUrl(uri);

    // Persist the secret IMMEDIATELY (but leave mfa_enrolled_at null
    // until verification confirms the user has it in their app).
    await db.update(usersTable)
      .set({ mfaSecret: secret, mfaEnrolledAt: null })
      .where(eq(usersTable.id, userId));

    res.json({
      qrCode: qrDataUrl,
      manualEntrySecret: secret,
      otpAuthUri: uri,
    });
  } catch (err) {
    console.error("[mfa] enroll/start failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── POST /enroll/verify ─────────────────────────────────────────────
// Confirms the user has the shared secret in their app by checking
// their first 6-digit code. On success, generates and returns 10
// backup codes (shown ONCE — never retrievable again).
router.post("/enroll/verify", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.body as { code?: string };
    if (!code) { res.status(400).json({ error: "BadRequest", message: "Code required" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.mfaSecret) {
      res.status(400).json({ error: "EnrollmentNotStarted", message: "Start enrollment first." });
      return;
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      res.status(400).json({ error: "InvalidCode", message: "That code didn't match. Try again — codes refresh every 30 seconds." });
      return;
    }

    const backup = await generateBackupCodes();
    await db.update(usersTable)
      .set({
        mfaEnrolledAt: new Date(),
        mfaBackupCodes: backup.hashes,
        mfaFailedAttempts: 0,
      })
      .where(eq(usersTable.id, userId));

    res.json({
      ok: true,
      backupCodes: backup.plaintext,
      message: "MFA enrolled successfully. Save the backup codes — they will not be shown again.",
    });
  } catch (err) {
    console.error("[mfa] enroll/verify failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── POST /enroll/regenerate-backup-codes ────────────────────────────
// User requests a fresh batch of 10 backup codes (typically because
// they used most of the previous ones, or suspect they were exposed).
// Old codes are invalidated immediately.
router.post("/enroll/regenerate-backup-codes", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.mfaEnrolledAt) {
      res.status(400).json({ error: "NotEnrolled", message: "Enroll MFA first." });
      return;
    }
    const backup = await generateBackupCodes();
    await db.update(usersTable)
      .set({ mfaBackupCodes: backup.hashes })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, backupCodes: backup.plaintext });
  } catch (err) {
    console.error("[mfa] regenerate failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── POST /totp/challenge ────────────────────────────────────────────
// Called from the LOGIN flow after password validates. Body must
// include the MFA token issued by /auth/login (this proves the user
// passed the password check) AND the 6-digit TOTP code.
//
// On success: returns a full session token, resets failed-attempts.
// On failure: increments mfa_failed_attempts. At 3 the response includes
// `showFallbacks: true` so the frontend reveals the recovery options.
router.post("/totp/challenge", async (req, res) => {
  try {
    const { mfaToken, code } = req.body as { mfaToken?: string; code?: string };
    if (!mfaToken || !code) {
      res.status(400).json({ error: "BadRequest", message: "MFA token and code required" });
      return;
    }
    let mfaPayload;
    try { mfaPayload = verifyMfaToken(mfaToken); }
    catch { res.status(401).json({ error: "InvalidMfaToken" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, mfaPayload.userId)).limit(1);
    if (!user || !user.mfaSecret) {
      res.status(400).json({ error: "NotEnrolled", message: "MFA not enrolled for this user." });
      return;
    }

    if (verifyTotp(user.mfaSecret, code)) {
      // Reset counter on success.
      await db.update(usersTable)
        .set({ mfaFailedAttempts: 0 })
        .where(eq(usersTable.id, user.id));
      const token = signToken({ userId: user.id, email: user.email, role: user.role });
      res.json({
        token,
        user: {
          id: user.id, email: user.email, name: user.name, role: user.role,
          department: user.department, avatar: user.avatar, isActive: user.isActive,
          createdAt: user.createdAt,
        },
      });
      return;
    }

    // Failed attempt — increment counter and decide whether to surface
    // the fallback options.
    const next = (user.mfaFailedAttempts ?? 0) + 1;
    await db.update(usersTable)
      .set({ mfaFailedAttempts: next })
      .where(eq(usersTable.id, user.id));

    res.status(401).json({
      error: "InvalidCode",
      attempts: next,
      showFallbacks: next >= 3,
      message: next >= 3
        ? "Three failed attempts. You can use a backup code, request a code via SMS, ask for a phone call, or request emergency access from an admin."
        : `Incorrect code. ${3 - next} attempts remaining before fallback options are offered.`,
    });
  } catch (err) {
    console.error("[mfa] totp/challenge failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── POST /backup-code/verify ────────────────────────────────────────
// Backup-code fallback. Consumes the code on success (it can never be
// reused). Returns a full session token + remaining backup count so
// the UI can warn the user to regenerate if low.
router.post("/backup-code/verify", async (req, res) => {
  try {
    const { mfaToken, code } = req.body as { mfaToken?: string; code?: string };
    if (!mfaToken || !code) {
      res.status(400).json({ error: "BadRequest" });
      return;
    }
    let mfaPayload;
    try { mfaPayload = verifyMfaToken(mfaToken); }
    catch { res.status(401).json({ error: "InvalidMfaToken" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, mfaPayload.userId)).limit(1);
    if (!user || !user.mfaBackupCodes || user.mfaBackupCodes.length === 0) {
      res.status(400).json({ error: "NoBackupCodes" });
      return;
    }

    const remaining = await verifyAndConsumeBackupCode(user.mfaBackupCodes, code);
    if (!remaining) {
      res.status(401).json({ error: "InvalidCode" });
      return;
    }

    await db.update(usersTable)
      .set({ mfaBackupCodes: remaining, mfaFailedAttempts: 0 })
      .where(eq(usersTable.id, user.id));

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({
      token,
      remainingBackupCodes: remaining.length,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        department: user.department, avatar: user.avatar, isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("[mfa] backup-code/verify failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── POST /reset (admin) ─────────────────────────────────────────────
// Admin clears a user's MFA enrollment — used when they've lost their
// phone AND backup codes. The user will be prompted to re-enroll on
// their next login.
router.post("/reset/:userId", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const targetId = parseInt(String(req.params.userId));
    if (Number.isNaN(targetId)) { res.status(400).json({ error: "BadRequest" }); return; }
    await db.update(usersTable)
      .set({
        mfaSecret: null,
        mfaEnrolledAt: null,
        mfaBackupCodes: null,
        mfaFailedAttempts: 0,
      })
      .where(eq(usersTable.id, targetId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[mfa] reset failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── GET /status ─────────────────────────────────────────────────────
// Tells the frontend whether MFA is enrolled, how many backup codes
// remain, and whether MFA is mandatory for this user's role.
router.get("/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({
      enrolled: !!user.mfaEnrolledAt,
      mandatory: mfaRequiredForRole(user.role),
      enrolledAt: user.mfaEnrolledAt,
      remainingBackupCodes: user.mfaBackupCodes?.length ?? 0,
    });
  } catch (err) {
    console.error("[mfa] status failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Fallback: SMS OTP via Termii ────────────────────────────────────
// Triggered from the totp-challenge screen after 3 failed attempts (or
// by the user explicitly clicking "Send code via SMS"). Sends a fresh
// 6-digit code to the phone on the user's profile.
router.post("/fallback/sms", async (req, res) => {
  try {
    const { mfaToken } = req.body as { mfaToken?: string };
    if (!mfaToken) { res.status(400).json({ error: "BadRequest" }); return; }
    let p;
    try { p = verifyMfaToken(mfaToken); }
    catch { res.status(401).json({ error: "InvalidMfaToken" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (!user || !user.phone) {
      res.status(400).json({ error: "NoPhone", message: "No phone number on file. Try a backup code or request admin approval." });
      return;
    }

    const result = await sendSmsOtp(user.phone);
    res.json({
      ok: true,
      phone: maskPhone(user.phone),
      smsFailed: result.failed ?? false,
      devMode: result.devMode,
      ...(result.devMode ? { code: result.code } : {}),
    });
  } catch (err) {
    console.error("[mfa] fallback/sms failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Fallback: Voice OTP via Termii ──────────────────────────────────
router.post("/fallback/voice", async (req, res) => {
  try {
    const { mfaToken } = req.body as { mfaToken?: string };
    if (!mfaToken) { res.status(400).json({ error: "BadRequest" }); return; }
    let p;
    try { p = verifyMfaToken(mfaToken); }
    catch { res.status(401).json({ error: "InvalidMfaToken" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (!user || !user.phone) {
      res.status(400).json({ error: "NoPhone", message: "No phone number on file. Try a backup code or request admin approval." });
      return;
    }

    const result = await sendVoiceOtp(user.phone);
    res.json({
      ok: true,
      phone: maskPhone(user.phone),
      failed: result.failed ?? false,
      devMode: result.devMode,
    });
  } catch (err) {
    console.error("[mfa] fallback/voice failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Fallback: verify Termii SMS or Voice code ───────────────────────
// Both Termii paths (SMS + Voice) verify through the same helpers; the
// frontend just tells us which mode the user picked. On success returns
// a full session token like a normal login.
router.post("/fallback/verify", async (req, res) => {
  try {
    const { mfaToken, code, isVoice } = req.body as { mfaToken?: string; code?: string; isVoice?: boolean };
    if (!mfaToken || !code) { res.status(400).json({ error: "BadRequest" }); return; }
    let p;
    try { p = verifyMfaToken(mfaToken); }
    catch { res.status(401).json({ error: "InvalidMfaToken" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (!user || !user.phone) { res.status(400).json({ error: "NoPhone" }); return; }

    const ok = isVoice
      ? await verifyVoiceOtp(user.phone, code)
      : verifySmsOtp(user.phone, code);
    if (!ok) {
      res.status(401).json({ error: "InvalidCode" });
      return;
    }

    await db.update(usersTable)
      .set({ mfaFailedAttempts: 0 })
      .where(eq(usersTable.id, user.id));
    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        department: user.department, avatar: user.avatar, isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("[mfa] fallback/verify failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Fallback: request admin emergency login approval ────────────────
// Generates a single-use token (hashed and stored on the user row),
// fires a notification to every admin, returns a request id the user
// can poll. When the admin approves, the user is sent a one-time link
// containing the plaintext token — they trade it for a session via
// /api/auth/emergency-login (added below).
router.post("/fallback/admin-request", async (req, res) => {
  try {
    const { mfaToken, reason } = req.body as { mfaToken?: string; reason?: string };
    if (!mfaToken) { res.status(400).json({ error: "BadRequest" }); return; }
    let p;
    try { p = verifyMfaToken(mfaToken); }
    catch { res.status(401).json({ error: "InvalidMfaToken" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }

    // Generate a 32-byte random token, hash for storage, expire in 1 hour.
    const plain = randomBytes(32).toString("base64url");
    const hash = await bcrypt.hash(plain, 10);
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(usersTable)
      .set({
        emergencyLoginTokenHash: hash,
        emergencyLoginExpires: expires,
      })
      .where(eq(usersTable.id, user.id));

    // Notify every admin. Notification body deliberately doesn't leak
    // the plaintext token — admins approve via the dashboard, which
    // hands them a link to deliver to the user out-of-band (in person,
    // verified phone call, etc).
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map(a => ({
          userId: a.id,
          type: "system" as const,
          title: "Emergency MFA login requested",
          message: `${user.name} (${user.email}) cannot complete MFA${reason ? ` — reason: ${reason}` : ""}. Review and approve from the Admin Dashboard.`,
          isRead: false,
        })),
      );
    }

    res.json({
      ok: true,
      message: "Admin notified. Once approved, an admin will deliver a one-time login link to you out-of-band.",
      expiresAt: expires.toISOString(),
    });
  } catch (err) {
    console.error("[mfa] fallback/admin-request failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Admin: list pending emergency-login requests ────────────────────
router.get("/admin/emergency-requests", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const now = new Date();
    const rows = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      phone: usersTable.phone,
      expires: usersTable.emergencyLoginExpires,
    }).from(usersTable);
    const pending = rows.filter(r => r.expires && r.expires > now);
    res.json(pending);
  } catch (err) {
    console.error("[mfa] admin/emergency-requests failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Admin: approve emergency-login (returns the one-time link) ──────
// The admin receives the plaintext token ONCE, in this response, and
// MUST deliver it to the user out-of-band (verified phone call, in
// person, etc). We rotate the stored hash so the response is the only
// place the plaintext exists at this point.
router.post("/admin/emergency-approve/:userId", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const targetId = parseInt(String(req.params.userId));
    if (Number.isNaN(targetId)) { res.status(400).json({ error: "BadRequest" }); return; }

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (!target || !target.emergencyLoginExpires || target.emergencyLoginExpires < new Date()) {
      res.status(400).json({ error: "NoActiveRequest" });
      return;
    }

    // Generate a fresh plaintext + hash pair — the user's previous
    // request hash gets replaced. This way each "approve" yields a new
    // one-time secret and the prior one is invalidated.
    const plain = randomBytes(32).toString("base64url");
    const hash = await bcrypt.hash(plain, 10);
    const expires = new Date(Date.now() + 30 * 60 * 1000); // shorter window post-approval
    await db.update(usersTable)
      .set({
        emergencyLoginTokenHash: hash,
        emergencyLoginExpires: expires,
      })
      .where(eq(usersTable.id, targetId));

    // Notify the user that admin approved — body still excludes the
    // plaintext (admin delivers it directly).
    await db.insert(notificationsTable).values({
      userId: targetId,
      type: "system" as const,
      title: "Emergency MFA login approved",
      message: `An admin has approved your emergency login. Use the one-time link they share with you. Valid for 30 minutes.`,
      isRead: false,
    });

    res.json({
      ok: true,
      // This token is the ONLY place plaintext appears. Treat carefully.
      oneTimeToken: plain,
      userId: targetId,
      email: target.email,
      expiresAt: expires.toISOString(),
    });
  } catch (err) {
    console.error("[mfa] admin/emergency-approve failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Admin: deny emergency-login ─────────────────────────────────────
router.post("/admin/emergency-deny/:userId", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const targetId = parseInt(String(req.params.userId));
    if (Number.isNaN(targetId)) { res.status(400).json({ error: "BadRequest" }); return; }
    await db.update(usersTable)
      .set({
        emergencyLoginTokenHash: null,
        emergencyLoginExpires: null,
      })
      .where(eq(usersTable.id, targetId));
    await db.insert(notificationsTable).values({
      userId: targetId,
      type: "system" as const,
      title: "Emergency MFA login denied",
      message: "An admin reviewed your emergency login request and could not approve it at this time. Please contact your administrator.",
      isRead: false,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[mfa] admin/emergency-deny failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── User: redeem emergency one-time token ───────────────────────────
// Takes the plaintext token the admin gave them (and their email),
// validates, BURNS the token, wipes their existing MFA enrollment so
// they're forced to re-enroll, and returns a full session.
router.post("/emergency-login", async (req, res) => {
  try {
    const { email, token } = req.body as { email?: string; token?: string };
    if (!email || !token) { res.status(400).json({ error: "BadRequest" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user || !user.emergencyLoginTokenHash || !user.emergencyLoginExpires) {
      res.status(401).json({ error: "InvalidToken" });
      return;
    }
    if (user.emergencyLoginExpires < new Date()) {
      res.status(401).json({ error: "ExpiredToken" });
      return;
    }
    const ok = await bcrypt.compare(token, user.emergencyLoginTokenHash);
    if (!ok) { res.status(401).json({ error: "InvalidToken" }); return; }

    // Burn the token + wipe MFA so the user must re-enroll. Reasoning:
    // if their phone was genuinely lost, the old TOTP secret might be
    // compromised — never reuse it.
    await db.update(usersTable)
      .set({
        emergencyLoginTokenHash: null,
        emergencyLoginExpires: null,
        mfaSecret: null,
        mfaEnrolledAt: null,
        mfaBackupCodes: null,
        mfaFailedAttempts: 0,
      })
      .where(eq(usersTable.id, user.id));

    const sessionToken = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({
      token: sessionToken,
      mustReEnrollMfa: true,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        department: user.department, avatar: user.avatar, isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("[mfa] emergency-login failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
