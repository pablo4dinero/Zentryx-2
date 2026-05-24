import { Router } from "express";
import { db } from "@workspace/db";
import { adminMessagesTable, adminMessageRecipientsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// User-facing endpoints — auth required, but no role gate. Each user only
// ever sees the messages directed at them (via the recipients join), so
// there's no data leakage.
router.use(requireAuth);

// GET /inbox — every admin message addressed to the current user, sorted
// newest first. `acknowledgedAt === null` means it's still pending and
// should be shown as a popup; we return both pending and ack'd ones so the
// frontend can also render a history if it wants.
router.get("/inbox", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const rows = await db.select({
      id: adminMessagesTable.id,
      title: adminMessagesTable.title,
      body: adminMessagesTable.body,
      fromAdminName: adminMessagesTable.fromAdminName,
      createdAt: adminMessagesTable.createdAt,
      acknowledgedAt: adminMessageRecipientsTable.acknowledgedAt,
    }).from(adminMessageRecipientsTable)
      .innerJoin(adminMessagesTable, eq(adminMessageRecipientsTable.messageId, adminMessagesTable.id))
      .where(eq(adminMessageRecipientsTable.userId, userId))
      .orderBy(desc(adminMessagesTable.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err) {
    console.error("[admin-messages] inbox failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// GET /pending — only the un-acknowledged ones. This is what the popup
// polls; small payload, easy to render.
router.get("/pending", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const rows = await db.select({
      id: adminMessagesTable.id,
      title: adminMessagesTable.title,
      body: adminMessagesTable.body,
      fromAdminName: adminMessagesTable.fromAdminName,
      createdAt: adminMessagesTable.createdAt,
    }).from(adminMessageRecipientsTable)
      .innerJoin(adminMessagesTable, eq(adminMessageRecipientsTable.messageId, adminMessagesTable.id))
      .where(and(
        eq(adminMessageRecipientsTable.userId, userId),
        isNull(adminMessageRecipientsTable.acknowledgedAt),
      ))
      .orderBy(desc(adminMessagesTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("[admin-messages] pending failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /:id/acknowledge — current user acknowledges a single message.
router.post("/:id/acknowledge", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: "BadRequest" }); return; }
    const [updated] = await db.update(adminMessageRecipientsTable)
      .set({ acknowledgedAt: new Date() })
      .where(and(
        eq(adminMessageRecipientsTable.messageId, id),
        eq(adminMessageRecipientsTable.userId, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[admin-messages] acknowledge failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
