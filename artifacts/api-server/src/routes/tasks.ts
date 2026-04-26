import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

async function enrichTask(task: typeof tasksTable.$inferSelect) {
  const assignee = task.assigneeId
    ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, department: usersTable.department, avatar: usersTable.avatar, isActive: usersTable.isActive, createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, task.assigneeId)).limit(1))[0] || null
    : null;
  return { ...task, assignee };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { projectId, assigneeId, status } = req.query;
    const conditions = [];
    if (projectId) conditions.push(eq(tasksTable.projectId, parseInt(projectId as string)));
    if (assigneeId) conditions.push(eq(tasksTable.assigneeId, parseInt(assigneeId as string)));
    if (status) conditions.push(eq(tasksTable.status, status as any));

    const tasks = conditions.length > 0
      ? await db.select().from(tasksTable).where(and(...conditions)).orderBy(tasksTable.createdAt)
      : await db.select().from(tasksTable).orderBy(tasksTable.createdAt);

    const enriched = await Promise.all(tasks.map(enrichTask));
    res.json(enriched);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId, title, description, status, priority, assigneeId, dueDate } = req.body;
    const [task] = await db.insert(tasksTable).values({
      projectId, title, description,
      status: status || "todo",
      priority: priority || "medium",
      assigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
    }).returning();
    await logActivity(req.user!.userId, "created", "task", task.id, `Created task: ${title}`);
    res.status(201).json(await enrichTask(task));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, status, priority, assigneeId, dueDate } = req.body;
    const [task] = await db.update(tasksTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assigneeId }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      updatedAt: new Date(),
    }).where(eq(tasksTable.id, id)).returning();
    if (!task) { res.status(404).json({ error: "NotFound" }); return; }
    await logActivity(req.user!.userId, "updated", "task", task.id, `Updated task: ${task.title}`);
    res.json(await enrichTask(task));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
    await logActivity(req.user!.userId, "deleted", "task", id, `Deleted task #${id}`);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
