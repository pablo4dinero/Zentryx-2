import { Router } from "express";
import { db } from "@workspace/db";
import { formulationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const formulations = projectId
      ? await db.select().from(formulationsTable).where(eq(formulationsTable.projectId, parseInt(projectId as string))).orderBy(formulationsTable.createdAt)
      : await db.select().from(formulationsTable).orderBy(formulationsTable.createdAt);

    const result = formulations.map(f => ({
      ...f,
      costPerUnit: f.costPerUnit ? parseFloat(f.costPerUnit) : null,
      targetMargin: f.targetMargin ? parseFloat(f.targetMargin) : null,
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [f] = await db.select().from(formulationsTable).where(eq(formulationsTable.id, id)).limit(1);
    if (!f) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({
      ...f,
      costPerUnit: f.costPerUnit ? parseFloat(f.costPerUnit) : null,
      targetMargin: f.targetMargin ? parseFloat(f.targetMargin) : null,
    });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId, name, version, ingredients, sensoryScores, shelfLifeDays, costPerUnit, targetMargin, notes, status } = req.body;
    const [f] = await db.insert(formulationsTable).values({
      projectId, name, version: version || "1.0",
      ingredients: ingredients || [],
      sensoryScores,
      shelfLifeDays,
      costPerUnit,
      targetMargin,
      notes,
      status: status || "draft",
      createdById: req.user!.userId,
    }).returning();
    await logActivity(req.user!.userId, "created", "formulation", f.id, `Created formulation: ${name}`);
    res.status(201).json({
      ...f,
      costPerUnit: f.costPerUnit ? parseFloat(f.costPerUnit) : null,
      targetMargin: f.targetMargin ? parseFloat(f.targetMargin) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, version, ingredients, sensoryScores, shelfLifeDays, costPerUnit, targetMargin, notes, status } = req.body;
    const [f] = await db.update(formulationsTable).set({
      ...(name !== undefined && { name }),
      ...(version !== undefined && { version }),
      ...(ingredients !== undefined && { ingredients }),
      ...(sensoryScores !== undefined && { sensoryScores }),
      ...(shelfLifeDays !== undefined && { shelfLifeDays }),
      ...(costPerUnit !== undefined && { costPerUnit }),
      ...(targetMargin !== undefined && { targetMargin }),
      ...(notes !== undefined && { notes }),
      ...(status !== undefined && { status }),
      updatedAt: new Date(),
    }).where(eq(formulationsTable.id, id)).returning();
    if (!f) { res.status(404).json({ error: "NotFound" }); return; }
    await logActivity(req.user!.userId, "updated", "formulation", f.id, `Updated formulation: ${f.name}`);
    res.json({
      ...f,
      costPerUnit: f.costPerUnit ? parseFloat(f.costPerUnit) : null,
      targetMargin: f.targetMargin ? parseFloat(f.targetMargin) : null,
    });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
