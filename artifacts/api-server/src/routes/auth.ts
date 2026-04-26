import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth, AuthRequest } from "../lib/auth";
import { sendOtp, verifyOtp } from "../lib/otp";

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

// ─── Login ───────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "BadRequest", message: "Email and password required" });
      return;
    }

    // Superadmin bypass — direct access, no OTP, no anything
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
    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, avatar: user.avatar, isActive: user.isActive, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "InternalServerError", message: "Login failed" });
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

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, isActive: user.isActive, createdAt: user.createdAt },
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
