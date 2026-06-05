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
  adminMessagesTable,
  adminMessageRecipientsTable,
  featureFlagsTable,
  featureFlagHistoryTable,
} from "@workspace/db";
import { desc, eq, gte, and, sql, isNull, inArray } from "drizzle-orm";
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

// ─── First-time admin approval queue ────────────────────────────────
// GET /pending-approvals — list every user with approvalStatus = pending
router.get("/pending-approvals", async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(usersTable).where(eq(usersTable.approvalStatus, "pending"));
    res.json(rows.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      department: u.department, phone: u.phone, createdAt: u.createdAt,
    })));
  } catch (err) {
    console.error("[admin] pending-approvals failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /users/:id/approve — flip pending → approved + notify user
router.post("/users/:id/approve", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const approverId = req.user!.userId;
    const [updated] = await db.update(usersTable)
      .set({
        approvalStatus: "approved",
        approvedByUserId: approverId,
        approvedAt: new Date(),
        deniedReason: null,
      })
      .where(eq(usersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    // Tell the user — they'll see this in their inbox after first login.
    await db.insert(notificationsTable).values({
      userId: id,
      type: "system" as const,
      title: "Account approved",
      message: `Welcome to Zentryx. You can now sign in.`,
      isRead: false,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin] users.approve failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /users/:id/deny — flip pending → denied with reason
router.post("/users/:id/deny", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const reason = (req.body?.reason as string) || "No reason provided";
    const approverId = req.user!.userId;
    const [updated] = await db.update(usersTable)
      .set({
        approvalStatus: "denied",
        approvedByUserId: approverId,
        approvedAt: new Date(),
        deniedReason: reason,
      })
      .where(eq(usersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    await db.insert(notificationsTable).values({
      userId: id,
      type: "system" as const,
      title: "Account access denied",
      message: `An admin reviewed your account and could not approve access at this time. Reason: ${reason}`,
      isRead: false,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin] users.deny failed", err);
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

// Revoke all active sessions for a user by incrementing their tokenVersion.
// Any JWT with an older tv is instantly rejected on the next request.
router.post("/users/:id/revoke-tokens", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(usersTable)
      .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ tokenVersion: usersTable.tokenVersion });
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({ ok: true, newTokenVersion: updated.tokenVersion });
  } catch (err) {
    console.error("[admin] revoke-tokens failed", err);
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

// ── Admin Messages ───────────────────────────────────────────────────────
// POST /messages — send a new broadcast or selected-user message.
// Body: { title, body, audience: "all" | "selected", recipientIds?: number[] }
router.post("/messages", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { title, body, audience, recipientIds } = req.body as { title?: string; body?: string; audience?: "all" | "selected"; recipientIds?: number[] };
    if (!title?.trim() || !body?.trim()) { res.status(400).json({ error: "MissingFields" }); return; }
    const finalAudience: "all" | "selected" = audience === "all" ? "all" : "selected";

    // Resolve the target user list. For "all" we take every currently-
    // active user except the sender (admin doesn't need to ack their own
    // message). For "selected" we take the provided ids, deduped and
    // filtered to active users only.
    let targetIds: number[] = [];
    if (finalAudience === "all") {
      const active = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isActive, true));
      targetIds = active.map(u => u.id).filter(id => id !== userId);
    } else {
      const requested = Array.isArray(recipientIds) ? [...new Set(recipientIds)] : [];
      if (requested.length === 0) { res.status(400).json({ error: "NoRecipients" }); return; }
      const found = await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.isActive, true), inArray(usersTable.id, requested)));
      targetIds = found.map(u => u.id).filter(id => id !== userId);
    }
    if (targetIds.length === 0) { res.status(400).json({ error: "NoValidRecipients" }); return; }

    const [msg] = await db.insert(adminMessagesTable).values({
      fromAdminId: userId,
      fromAdminName: me.name,
      title: title.trim(),
      body: body.trim(),
      audience: finalAudience,
      recipientCount: targetIds.length,
    }).returning();

    await db.insert(adminMessageRecipientsTable).values(
      targetIds.map(uid => ({ messageId: msg.id, userId: uid })),
    );

    res.status(201).json({ ...msg, recipientCount: targetIds.length });
  } catch (err) {
    console.error("[admin] messages.post failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// GET /messages — list messages this admin sent, with ack counts.
router.get("/messages", async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select({
      id: adminMessagesTable.id,
      fromAdminId: adminMessagesTable.fromAdminId,
      fromAdminName: adminMessagesTable.fromAdminName,
      title: adminMessagesTable.title,
      body: adminMessagesTable.body,
      audience: adminMessagesTable.audience,
      recipientCount: adminMessagesTable.recipientCount,
      createdAt: adminMessagesTable.createdAt,
    }).from(adminMessagesTable).orderBy(desc(adminMessagesTable.createdAt)).limit(200);

    if (rows.length === 0) { res.json([]); return; }
    const ids = rows.map(r => r.id);
    const ackRows = await db.select({
      messageId: adminMessageRecipientsTable.messageId,
      ackCount: sql<number>`SUM(CASE WHEN ${adminMessageRecipientsTable.acknowledgedAt} IS NOT NULL THEN 1 ELSE 0 END)::int`,
    }).from(adminMessageRecipientsTable)
      .where(inArray(adminMessageRecipientsTable.messageId, ids))
      .groupBy(adminMessageRecipientsTable.messageId);
    const ackMap = new Map<number, number>(ackRows.map(r => [r.messageId, r.ackCount]));
    res.json(rows.map(r => ({ ...r, acknowledgedCount: ackMap.get(r.id) ?? 0 })));
  } catch (err) {
    console.error("[admin] messages.list failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// GET /messages/:id/acknowledgments — full recipient list with ack state.
router.get("/messages/:id/acknowledgments", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: "BadRequest" }); return; }
    const rows = await db.select({
      userId: adminMessageRecipientsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      acknowledgedAt: adminMessageRecipientsTable.acknowledgedAt,
    }).from(adminMessageRecipientsTable)
      .leftJoin(usersTable, eq(adminMessageRecipientsTable.userId, usersTable.id))
      .where(eq(adminMessageRecipientsTable.messageId, id))
      .orderBy(desc(adminMessageRecipientsTable.acknowledgedAt));
    res.json(rows);
  } catch (err) {
    console.error("[admin] messages.acks failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// DELETE /messages/:id — cancel/remove a message (cascades to recipients).
router.delete("/messages/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: "BadRequest" }); return; }
    await db.delete(adminMessagesTable).where(eq(adminMessagesTable.id, id));
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin] messages.delete failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ── Feature Flags ──────────────────────────────────────────────────────
// GET /feature-flags — list all feature flags
router.get("/feature-flags", async (_req: AuthRequest, res) => {
  try {
    const flags = await db.select({
      id: featureFlagsTable.id,
      featureName: featureFlagsTable.featureName,
      displayName: featureFlagsTable.displayName,
      description: featureFlagsTable.description,
      enabled: featureFlagsTable.enabled,
      category: featureFlagsTable.category,
      updatedByUserId: featureFlagsTable.updatedByUserId,
      updatedAt: featureFlagsTable.updatedAt,
    }).from(featureFlagsTable).orderBy(featureFlagsTable.category, featureFlagsTable.featureName);
    res.json(flags);
  } catch (err) {
    console.error("[admin] feature-flags list failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /feature-flags — initialize default feature flags
router.post("/feature-flags/init", async (req: AuthRequest, res) => {
  try {
    const defaults = [
      {
        featureName: "floor_efficiency_dashboard",
        displayName: "Floor Efficiency Dashboard",
        description: "Show which floors are running at <80% capacity",
        enabled: true,
        category: "optimization",
      },
      {
        featureName: "downtime_alerts",
        displayName: "Downtime & Maintenance Alerts",
        description: "Flag unavoidable idle time and suggest preventive maintenance windows",
        enabled: true,
        category: "optimization",
      },
      {
        featureName: "efficiency_score",
        displayName: "Efficiency Score",
        description: "Show how far current plan is from theoretical max output",
        enabled: true,
        category: "optimization",
      },
      {
        featureName: "production_analytics",
        displayName: "Production Analytics",
        description: "Learn from actual production data and optimize constraints",
        enabled: true,
        category: "analytics",
      },
    ];

    for (const flag of defaults) {
      await db.insert(featureFlagsTable).values(flag).onConflictDoNothing();
    }

    res.json({ ok: true, initialized: defaults.length });
  } catch (err) {
    console.error("[admin] feature-flags init failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// PATCH /feature-flags/:featureName — toggle a feature flag
router.patch("/feature-flags/:featureName", async (req: AuthRequest, res) => {
  try {
    const { featureName } = req.params;
    const { enabled, reason } = req.body as { enabled?: boolean; reason?: string };
    const userId = req.user!.userId;

    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "BadRequest", message: "enabled must be boolean" });
      return;
    }

    const [flag] = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.featureName, featureName));
    if (!flag) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    const [me] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
    if (!me) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [updated] = await db.update(featureFlagsTable)
      .set({ enabled, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(featureFlagsTable.featureName, featureName))
      .returning();

    await db.insert(featureFlagHistoryTable).values({
      featureName,
      previousValue: flag.enabled,
      newValue: enabled,
      changedByUserId: userId,
      changedByName: me.name,
      reason: reason || null,
    });

    res.json(updated);
  } catch (err) {
    console.error("[admin] feature-flags patch failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// GET /feature-flags/:featureName/history — view toggle history
router.get("/feature-flags/:featureName/history", async (req: AuthRequest, res) => {
  try {
    const { featureName } = req.params;
    const history = await db.select()
      .from(featureFlagHistoryTable)
      .where(eq(featureFlagHistoryTable.featureName, featureName))
      .orderBy(desc(featureFlagHistoryTable.createdAt))
      .limit(50);
    res.json(history);
  } catch (err) {
    console.error("[admin] feature-flags history failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// Suppress unused import warning for `notificationsTable` / `isNull`.
void notificationsTable; void isNull;

export default router;
