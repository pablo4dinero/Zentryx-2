import { Router } from "express";
import { db } from "@workspace/db";
import { activityLogsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { userId, projectId } = req.query;
    const conditions = [];
    if (userId) conditions.push(eq(activityLogsTable.userId, parseInt(userId as string)));

    const logs = conditions.length > 0
      ? await db.select().from(activityLogsTable).where(and(...conditions)).orderBy(activityLogsTable.createdAt)
      : await db.select().from(activityLogsTable).orderBy(activityLogsTable.createdAt);

    const enriched = await Promise.all(logs.slice(-50).reverse().map(async (log) => {
      const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, department: usersTable.department, avatar: usersTable.avatar, isActive: usersTable.isActive, createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, log.userId)).limit(1);
      return { ...log, user: user || null };
    }));
    res.json(enriched);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
