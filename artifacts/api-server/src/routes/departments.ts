import { Router } from "express";
import { db } from "@workspace/db";
import { departmentsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const depts = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
    res.json(depts);
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "BadRequest", message: "Name required" }); return; }
    const [dept] = await db.insert(departmentsTable).values({ name }).returning();
    res.status(201).json(dept);
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Conflict", message: "Department already exists" }); return; }
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(departmentsTable).where(require("drizzle-orm").eq(departmentsTable.id, id));
    res.status(204).send();
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
