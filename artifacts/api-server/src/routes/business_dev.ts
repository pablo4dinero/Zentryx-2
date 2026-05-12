import { Router } from "express";
import { db } from "@workspace/db";
import { businessDevTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

async function enrichBD(bd: typeof businessDevTable.$inferSelect) {
  const lead = bd.leadId
    ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, bd.leadId)).limit(1))[0] || null
    : null;
  const assignees = bd.assigneeIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, department: usersTable.department }).from(usersTable).where(inArray(usersTable.id, bd.assigneeIds))
    : [];
  return { ...bd, lead, assignees };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const items = status
      ? await db.select().from(businessDevTable).where(eq(businessDevTable.status, status as any)).orderBy(businessDevTable.createdAt)
      : await db.select().from(businessDevTable).orderBy(businessDevTable.createdAt);
    const enriched = await Promise.all(items.map(enrichBD));
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [item] = await db.select().from(businessDevTable).where(eq(businessDevTable.id, id)).limit(1);
    if (!item) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(await enrichBD(item));
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, description, stage, status, leadId, assigneeIds, startDate, targetDate, customerName, customerEmail, customerPhone, costTarget, productType } = req.body;
    const [item] = await db.insert(businessDevTable).values({
      name, description,
      stage: stage || "innovation",
      status: status || "in_progress",
      leadId, assigneeIds: assigneeIds || [],
      startDate: startDate ? new Date(startDate) : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      customerName, customerEmail, customerPhone, costTarget, productType,
    }).returning();
    await logActivity(req.user!.userId, "created", "business_dev", item.id, `Created BD: ${name}`);
    res.status(201).json(await enrichBD(item));
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const { name, description, stage, status, leadId, assigneeIds, startDate, targetDate, customerName, customerEmail, customerPhone, costTarget, productType } = req.body;
    const [item] = await db.update(businessDevTable).set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(stage !== undefined && { stage }),
      ...(status !== undefined && { status }),
      ...(leadId !== undefined && { leadId }),
      ...(assigneeIds !== undefined && { assigneeIds }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
      ...(customerName !== undefined && { customerName }),
      ...(customerEmail !== undefined && { customerEmail }),
      ...(customerPhone !== undefined && { customerPhone }),
      ...(costTarget !== undefined && { costTarget }),
      ...(productType !== undefined && { productType }),
      updatedAt: new Date(),
    }).where(eq(businessDevTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(await enrichBD(item));
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(businessDevTable).where(eq(businessDevTable.id, id));
    res.status(204).send();
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
