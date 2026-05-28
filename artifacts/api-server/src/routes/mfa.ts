import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest, verifyMfaToken, signToken } from "../lib/auth";
import {
  generateTotpSecret,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
  verifyTotp,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
} from "../lib/totp";

const router = Router();

// Roles that MUST have MFA enrolled before they can complete login.
// Everyone else can opt in via Settings → Security. The role list here
// is the new consolidated set — legacy values that fall under these
// tiers (e.g. ceo → executive) are also covered.
const MFA_REQUIRED_ROLES = new Set([
  "admin",
  "executive",
  "manager",
  // Legacy aliases still in use until the role-consolidation migration runs
  "ceo",
  "managing_director",
  "head_of_product_development",
  "head_of_department",
]);

export function mfaRequiredForRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return MFA_REQUIRED_ROLES.has(role.toLowerCase());
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

export default router;
