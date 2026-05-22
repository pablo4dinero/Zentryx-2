import { Router } from "express";
import { db } from "@workspace/db";
import { productTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(productTypesTable).orderBy(productTypesTable.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const name = String((req.body as any)?.name ?? "").trim();
    if (!name) { res.status(400).json({ error: "name required" }); return; }

    const [existing] = await db.select().from(productTypesTable).where(eq(productTypesTable.name, name)).limit(1);
    if (existing) { res.status(200).json(existing); return; }

    const [created] = await db.insert(productTypesTable).values({ name }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const name = String((req.body as any)?.name ?? "").trim();
    if (!name) { res.status(400).json({ error: "name required" }); return; }

    const [clash] = await db.select().from(productTypesTable).where(eq(productTypesTable.name, name)).limit(1);
    if (clash && clash.id !== id) { res.status(409).json({ error: "DuplicateName" }); return; }

    const [updated] = await db.update(productTypesTable)
      .set({ name, updatedAt: new Date() })
      .where(eq(productTypesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(productTypesTable).where(eq(productTypesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
