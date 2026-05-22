import { Router } from "express";
import { db } from "@workspace/db";
import { optionListsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router = Router();

router.get("/:listKey", requireAuth, async (req: AuthRequest, res) => {
  try {
    const listKey = String(req.params.listKey ?? "").trim();
    if (!listKey) { res.status(400).json({ error: "listKey required" }); return; }
    const rows = await db.select().from(optionListsTable)
      .where(eq(optionListsTable.listKey, listKey))
      .orderBy(optionListsTable.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:listKey", requireAuth, async (req: AuthRequest, res) => {
  try {
    const listKey = String(req.params.listKey ?? "").trim();
    const name = String((req.body as any)?.name ?? "").trim();
    if (!listKey || !name) { res.status(400).json({ error: "listKey and name required" }); return; }

    const [existing] = await db.select().from(optionListsTable)
      .where(and(eq(optionListsTable.listKey, listKey), eq(optionListsTable.name, name)))
      .limit(1);
    if (existing) { res.status(200).json(existing); return; }

    const [created] = await db.insert(optionListsTable).values({ listKey, name }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:listKey/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const listKey = String(req.params.listKey ?? "").trim();
    const id = Number(req.params.id);
    const name = String((req.body as any)?.name ?? "").trim();
    if (!listKey || !id || !name) { res.status(400).json({ error: "listKey, id, and name required" }); return; }

    const [clash] = await db.select().from(optionListsTable)
      .where(and(eq(optionListsTable.listKey, listKey), eq(optionListsTable.name, name)))
      .limit(1);
    if (clash && clash.id !== id) { res.status(409).json({ error: "DuplicateName" }); return; }

    const [updated] = await db.update(optionListsTable)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(optionListsTable.id, id), eq(optionListsTable.listKey, listKey)))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:listKey/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const listKey = String(req.params.listKey ?? "").trim();
    const id = Number(req.params.id);
    if (!listKey || !id) { res.status(400).json({ error: "listKey and id required" }); return; }
    await db.delete(optionListsTable)
      .where(and(eq(optionListsTable.id, id), eq(optionListsTable.listKey, listKey)));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
