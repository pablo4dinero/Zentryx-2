import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const notifications = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.userId))
      .orderBy(notificationsTable.createdAt);
    res.json(notifications.reverse());
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [notification] = await db.update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.userId)))
      .returning();
    if (!notification) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(notification);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
