import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, AuthRequest } from "../lib/auth";
import { sendOtp, verifyOtp } from "../lib/otp";
import { SUPERADMIN_EMAIL } from "./auth";

const router = Router();

const canManageUsers = (role: string) =>
  ["admin", "manager", "ceo"].includes(role) || role.includes("head");

const formatUser = (user: typeof usersTable.$inferSelect) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  department: user.department,
  jobPosition: user.jobPosition,
  phone: user.phone,
  country: user.country,
  avatar: user.avatar,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

// ─── List users (exclude superadmin) ─────────────────────────────────────────
router.get("/", requireAuth, async (_req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.name);
    res.json(users.filter(u => u.email !== SUPERADMIN_EMAIL).map(formatUser));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── My profile ───────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Update my profile ────────────────────────────────────────────────────────
router.put("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, department, jobPosition, phone, country, avatar, currentPassword, newPassword } = req.body;
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!existing) { res.status(404).json({ error: "NotFound" }); return; }

    const update: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (department !== undefined) update.department = department || null;
    if (country !== undefined) update.country = country || null;
    if (avatar !== undefined) update.avatar = avatar || null;

    // jobPosition — only privileged roles (admin/manager/ceo/head) may change it
    if (jobPosition !== undefined && canManageUsers(req.user!.role)) {
      update.jobPosition = jobPosition || null;
    }

    // phone — must be changed via OTP endpoint, not here
    if (phone !== undefined) update.phone = phone || null;

    // Password change — requires current password
    if (newPassword) {
      if (!currentPassword) { res.status(400).json({ error: "BadRequest", message: "Current password required" }); return; }
      const valid = await bcrypt.compare(currentPassword, existing.passwordHash);
      if (!valid) { res.status(400).json({ error: "BadRequest", message: "Current password is incorrect" }); return; }
      update.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.user!.userId)).returning();
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Send OTP to change phone number ──────────────────────────────────────────
router.post("/me/request-phone-otp", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    const result = await sendOtp(user.email, "phone-change", { newPhone: req.body.newPhone });
    res.json({ sent: true, devMode: result.devMode, ...(result.devMode ? { code: result.code } : {}) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Confirm phone change with OTP ────────────────────────────────────────────
router.post("/me/confirm-phone", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { otpCode, newPhone } = req.body;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    const { valid } = verifyOtp(user.email, "phone-change", otpCode);
    if (!valid) { res.status(400).json({ error: "InvalidOTP", message: "Invalid or expired code" }); return; }
    const [updated] = await db.update(usersTable).set({ phone: newPhone || null, updatedAt: new Date() }).where(eq(usersTable.id, user.id)).returning();
    res.json(formatUser(updated));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Get single user ──────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user || user.email === SUPERADMIN_EMAIL) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Create user (admin only) ─────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { email, name, role, department, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({ email, name, role, department, passwordHash }).returning();
    res.status(201).json(formatUser(user));
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Email already exists" });
    } else {
      res.status(500).json({ error: "InternalServerError" });
    }
  }
});

// ─── Update user (privileged roles only) ─────────────────────────────────────
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    const id = parseInt(req.params.id);
    const { name, role, department, jobPosition, phone, country, avatar, isActive } = req.body;
    const [user] = await db.update(usersTable)
      .set({ name, role, department, jobPosition, phone, country, avatar, isActive, updatedAt: new Date() })
      .where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Admin resets any user's password (no current password required) ──────────
router.post("/:id/reset-password", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    const id = parseInt(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "BadRequest", message: "New password must be at least 6 characters" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [user] = await db.update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Promote user to admin ────────────────────────────────────────────────────
router.post("/:id/make-admin", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    const id = parseInt(req.params.id);
    const [user] = await db.update(usersTable)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Delete user (admin only) ─────────────────────────────────────────────────
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
