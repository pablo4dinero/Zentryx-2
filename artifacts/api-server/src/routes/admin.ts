import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  loginAttemptsTable,
  activityLogsTable,
  exportRequestsTable,
  notificationsTable,
  accountsTable,
  projectsTable,
} from "@workspace/db";
import { desc, eq, gte, and, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { getAllRequests as getAllAccessRequests } from "../lib/access-requests";

const router = Router();

// ── Helper: gate every admin endpoint to admin role ────────────────────
function requireAdmin(req: AuthRequest, res: any, next: any): void {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin only" });
    return;
  }
  next();
}

router.use(requireAuth, requireAdmin);

// ── Overview: aggregate KPIs ─────────────────────────────────────────────
router.get("/overview", async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      userCountRow,
      activeUserCountRow,
      onlineRow,
      pendingExportsRow,
      pendingAccessRequestsCount,
      loginsTodayRow,
      failedLoginsTodayRow,
      exportsTodayRow,
      accountsTodayRow,
      projectsTodayRow,
    ] = await Promise.all([
      db.select({ c: sql<number>`COUNT(*)::int` }).from(usersTable),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(usersTable).where(eq(usersTable.isActive, true)),
      db.select({ c: sql<number>`COUNT(DISTINCT user_id)::int` }).from(loginAttemptsTable)
        .where(and(eq(loginAttemptsTable.success, true), gte(loginAttemptsTable.createdAt, fiveMinAgo))),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(exportRequestsTable).where(eq(exportRequestsTable.status, "pending")),
      Promise.resolve(getAllAccessRequests().filter((r: any) => r.status === "pending").length),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(loginAttemptsTable)
        .where(and(eq(loginAttemptsTable.success, true), gte(loginAttemptsTable.createdAt, dayAgo))),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(loginAttemptsTable)
        .where(and(eq(loginAttemptsTable.success, false), gte(loginAttemptsTable.createdAt, dayAgo))),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(exportRequestsTable).where(gte(exportRequestsTable.createdAt, dayAgo)),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(accountsTable).where(gte(accountsTable.createdAt, dayAgo)),
      db.select({ c: sql<number>`COUNT(*)::int` }).from(projectsTable).where(gte(projectsTable.createdAt, dayAgo)),
    ]);

    // 7-day daily login series for the sparkline
    const series = await db.select({
      day: sql<string>`to_char(${loginAttemptsTable.createdAt}, 'YYYY-MM-DD')`,
      success: sql<number>`SUM(CASE WHEN ${loginAttemptsTable.success} THEN 1 ELSE 0 END)::int`,
      failure: sql<number>`SUM(CASE WHEN NOT ${loginAttemptsTable.success} THEN 1 ELSE 0 END)::int`,
    }).from(loginAttemptsTable)
      .where(gte(loginAttemptsTable.createdAt, weekAgo))
      .groupBy(sql`to_char(${loginAttemptsTable.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${loginAttemptsTable.createdAt}, 'YYYY-MM-DD')`);

    res.json({
      users: {
        total: userCountRow[0]?.c ?? 0,
        active: activeUserCountRow[0]?.c ?? 0,
        onlineNow: onlineRow[0]?.c ?? 0,
      },
      approvals: {
        pendingExports: pendingExportsRow[0]?.c ?? 0,
        pendingAccessRequests: pendingAccessRequestsCount,
      },
      activity: {
        successfulLogins24h: loginsTodayRow[0]?.c ?? 0,
        failedLogins24h: failedLoginsTodayRow[0]?.c ?? 0,
        exports24h: exportsTodayRow[0]?.c ?? 0,
        newAccounts24h: accountsTodayRow[0]?.c ?? 0,
        newProjects24h: projectsTodayRow[0]?.c ?? 0,
      },
      loginSeries: series,
    });
  } catch (err) {
    console.error("[admin] overview failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ── Users management ─────────────────────────────────────────────────────
router.get("/users", async (_req: AuthRequest, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      department: usersTable.department,
      jobPosition: usersTable.jobPosition,
      isActive: usersTable.isActive,
      phone: usersTable.phone,
      country: usersTable.country,
      avatar: usersTable.avatar,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt));

    // Attach lastLogin via a single grouped query.
    const lastLogins = await db.select({
      userId: loginAttemptsTable.userId,
      lastAt: sql<Date>`MAX(${loginAttemptsTable.createdAt})`,
    }).from(loginAttemptsTable)
      .where(eq(loginAttemptsTable.success, true))
      .groupBy(loginAttemptsTable.userId);
    const lastMap = new Map<number, Date>();
    lastLogins.forEach(r => { if (r.userId != null) lastMap.set(r.userId, r.lastAt as any); });

    res.json(users.map(u => ({ ...u, lastLoginAt: lastMap.get(u.id) ?? null })));
  } catch (err) {
    console.error("[admin] users list failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.patch("/users/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: "BadRequest" }); return; }
    const allowed: Record<string, any> = {};
    const body = req.body || {};
    if (typeof body.role === "string") allowed.role = body.role;
    if (typeof body.department === "string") allowed.department = body.department;
    if (typeof body.jobPosition === "string") allowed.jobPosition = body.jobPosition;
    if (typeof body.isActive === "boolean") allowed.isActive = body.isActive;
    if (typeof body.name === "string") allowed.name = body.name;
    if (typeof body.phone === "string") allowed.phone = body.phone;
    if (Object.keys(allowed).length === 0) { res.status(400).json({ error: "NoUpdates" }); return; }
    allowed.updatedAt = new Date();
    const [updated] = await db.update(usersTable).set(allowed).where(eq(usersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[admin] user patch failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/users/:id/reset-password", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const newPassword = (req.body?.password as string) || randomTempPassword();
    const hash = await bcrypt.hash(newPassword, 10);
    const [updated] = await db.update(usersTable)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({ ok: true, tempPassword: req.body?.password ? undefined : newPassword });
  } catch (err) {
    console.error("[admin] reset password failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

function randomTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}

// ── Login attempts ───────────────────────────────────────────────────────
router.get("/login-attempts", async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || "100")), 500);
    const onlyFailed = String(req.query.failed || "") === "true";
    const userIdFilter = req.query.userId ? parseInt(String(req.query.userId)) : null;
    let q = db.select({
      id: loginAttemptsTable.id,
      userId: loginAttemptsTable.userId,
      email: loginAttemptsTable.email,
      success: loginAttemptsTable.success,
      reason: loginAttemptsTable.reason,
      ipAddress: loginAttemptsTable.ipAddress,
      userAgent: loginAttemptsTable.userAgent,
      createdAt: loginAttemptsTable.createdAt,
      userName: usersTable.name,
    }).from(loginAttemptsTable)
      .leftJoin(usersTable, eq(loginAttemptsTable.userId, usersTable.id))
      .$dynamic();
    if (onlyFailed) q = q.where(eq(loginAttemptsTable.success, false));
    if (userIdFilter != null && !Number.isNaN(userIdFilter)) {
      q = q.where(eq(loginAttemptsTable.userId, userIdFilter));
    }
    const rows = await q.orderBy(desc(loginAttemptsTable.createdAt)).limit(limit);
    res.json(rows);
  } catch (err) {
    console.error("[admin] login-attempts failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ── Audit log (uses existing activityLogs) ───────────────────────────────
router.get("/audit-log", async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || "100")), 500);
    const rows = await db.select({
      id: activityLogsTable.id,
      userId: activityLogsTable.userId,
      action: activityLogsTable.action,
      entityType: activityLogsTable.entityType,
      entityId: activityLogsTable.entityId,
      details: activityLogsTable.details,
      createdAt: activityLogsTable.createdAt,
      userName: usersTable.name,
    }).from(activityLogsTable)
      .leftJoin(usersTable, eq(activityLogsTable.userId, usersTable.id))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    console.error("[admin] audit-log failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ── Approvals history ────────────────────────────────────────────────────
router.get("/approvals/exports", async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(exportRequestsTable).orderBy(desc(exportRequestsTable.createdAt)).limit(200);
    res.json(rows);
  } catch (err) {
    console.error("[admin] approvals/exports failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/approvals/access", async (_req: AuthRequest, res) => {
  try {
    res.json(getAllAccessRequests());
  } catch (err) {
    console.error("[admin] approvals/access failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// Suppress unused import warning for `notificationsTable` if unused later.
void notificationsTable;

export default router;
