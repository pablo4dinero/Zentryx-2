import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, usersTable, tasksTable, notificationsTable } from "@workspace/db";
import { eq, sql, and, inArray, or, ilike } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

const USER_COLS = { id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, department: usersTable.department };

function canCommercialApprove(role: string, dept: string) {
  return role === "admin" || role === "executive" ||
    (role === "manager" && dept.toLowerCase().includes("sales"));
}
function canTechnicalApprove(role: string, dept: string) {
  return role === "admin" || role === "executive" ||
    (role === "manager" && (dept.toLowerCase().includes("npd") || dept.toLowerCase().includes("r&d") || dept.toLowerCase().includes("rd")));
}

async function enrichProject(project: typeof projectsTable.$inferSelect) {
  const lead = project.leadId
    ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, department: usersTable.department, avatar: usersTable.avatar, isActive: usersTable.isActive, createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, project.leadId)).limit(1))[0] || null
    : null;

  const assignees = project.assigneeIds.length > 0
    ? await db.select(USER_COLS).from(usersTable).where(inArray(usersTable.id, project.assigneeIds))
    : [];

  const tasks = await db.select({ status: tasksTable.status }).from(tasksTable).where(eq(tasksTable.projectId, project.id));
  const taskCount = tasks.length;
  const completedTaskCount = tasks.filter(t => t.status === "done").length;

  const commercialApprover = project.commercialApprovedBy
    ? (await db.select(USER_COLS).from(usersTable).where(eq(usersTable.id, project.commercialApprovedBy)).limit(1))[0] || null
    : null;
  const technicalApprover = project.technicalApprovedBy
    ? (await db.select(USER_COLS).from(usersTable).where(eq(usersTable.id, project.technicalApprovedBy)).limit(1))[0] || null
    : null;

  return {
    ...project,
    successRate: project.successRate ? parseFloat(project.successRate) : null,
    revenueImpact: project.revenueImpact ? parseFloat(project.revenueImpact) : null,
    costTarget: project.costTarget ? parseFloat(project.costTarget) : null,
    sellingPrice: project.sellingPrice ? parseFloat(project.sellingPrice) : null,
    volumeKgPerMonth: project.volumeKgPerMonth ? parseFloat(project.volumeKgPerMonth) : null,
    lead,
    assignees,
    taskCount,
    completedTaskCount,
    commercialApprover,
    technicalApprover,
    commercialApprovedAt: project.commercialApprovedAt ?? null,
    technicalApprovedAt: project.technicalApprovedAt ?? null,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { status, stage } = req.query;
    const conditions = [];
    if (status) conditions.push(eq(projectsTable.status, status as any));
    if (stage) conditions.push(eq(projectsTable.stage, stage as any));

    const projects = conditions.length > 0
      ? await db.select().from(projectsTable).where(and(...conditions)).orderBy(projectsTable.createdAt)
      : await db.select().from(projectsTable).orderBy(projectsTable.createdAt);

    const enriched = await Promise.all(projects.map(enrichProject));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/export", requireAuth, async (_req, res) => {
  try {
    const projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
    const enriched = await Promise.all(projects.map(enrichProject));

    const rows = enriched.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      stage: p.stage,
      status: p.status,
      priority: p.priority,
      productType: p.productType || "",
      productCategory: p.productCategory || "",
      customerName: p.customerName || "",
      customerEmail: p.customerEmail || "",
      customerPhone: p.customerPhone || "",
      costTarget: p.costTarget || "",
      startDate: p.startDate ? new Date(p.startDate).toISOString().split("T")[0] : "",
      dueDate: p.targetDate ? new Date(p.targetDate).toISOString().split("T")[0] : "",
      lead: p.lead?.name || "",
      assignees: p.assignees.map(a => a.name).join(", "),
      taskCount: p.taskCount,
      completedTaskCount: p.completedTaskCount,
      progressPct: p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0,
      successRate: p.successRate || "",
      revenueImpact: p.revenueImpact || "",
      tags: (p.tags || []).join(", "),
      createdAt: new Date(p.createdAt).toISOString().split("T")[0],
      updatedAt: new Date(p.updatedAt).toISOString().split("T")[0],
    }));

    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(await enrichProject(project));
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, description, stage, status, priority, leadId, assigneeIds, startDate, targetDate, revenueImpact, productCategory, productType, customerName, customerEmail, customerPhone, costTarget, sellingPrice, volumeKgPerMonth, tags } = req.body;
    const [project] = await db.insert(projectsTable).values({
      name, description,
      stage: stage || "innovation",
      status: "pending",
      priority: priority || "medium",
      leadId,
      assigneeIds: assigneeIds || [],
      startDate: startDate ? new Date(startDate) : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      revenueImpact,
      productCategory,
      productType,
      customerName, customerEmail, customerPhone,
      costTarget,
      sellingPrice,
      volumeKgPerMonth,
      tags: tags || [],
    }).returning();
    await logActivity(req.user!.userId, "created", "project", project.id, `Created project: ${name}`);

    // Notify admins, executives, and sales/npd managers
    const recipients = await db.select({ id: usersTable.id }).from(usersTable).where(
      or(
        eq(usersTable.role, "admin"),
        eq(usersTable.role, "executive"),
        and(eq(usersTable.role, "manager"), or(
          ilike(usersTable.department, "%sales%"),
          ilike(usersTable.department, "%npd%"),
          ilike(usersTable.department, "%r&d%"),
        ))
      )
    );
    if (recipients.length > 0) {
      await db.insert(notificationsTable).values(
        recipients.map(u => ({
          userId: u.id,
          type: "system" as const,
          title: "New Project Pending Approval",
          message: `A new project "${name}" has been created and requires your approval.`,
          isRead: false,
          projectId: project.id,
          link: `/projects/${project.id}`,
        }))
      );
    }

    res.status(201).json(await enrichProject(project));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const { name, description, stage, status, priority, leadId, assigneeIds, startDate, targetDate, successRate, revenueImpact, productCategory, productType, customerName, customerEmail, customerPhone, costTarget, sellingPrice, volumeKgPerMonth, tags } = req.body;

    // Guard: block manual status changes on pending projects until both approvals are done
    if (status !== undefined && status !== "pending") {
      const [cur] = await db.select({ status: projectsTable.status, commercialApprovedBy: projectsTable.commercialApprovedBy, technicalApprovedBy: projectsTable.technicalApprovedBy }).from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
      if (cur?.status === "pending" && (!cur.commercialApprovedBy || !cur.technicalApprovedBy)) {
        res.status(403).json({ error: "Project requires both Commercial and Technical approval before status can be changed." });
        return;
      }
    }
    const [project] = await db.update(projectsTable).set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(stage !== undefined && { stage }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(leadId !== undefined && { leadId }),
      ...(assigneeIds !== undefined && { assigneeIds }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
      ...(successRate !== undefined && { successRate }),
      ...(revenueImpact !== undefined && { revenueImpact }),
      ...(productCategory !== undefined && { productCategory }),
      ...(productType !== undefined && { productType }),
      ...(customerName !== undefined && { customerName }),
      ...(customerEmail !== undefined && { customerEmail }),
      ...(customerPhone !== undefined && { customerPhone }),
      ...(costTarget !== undefined && { costTarget }),
      ...(sellingPrice !== undefined && { sellingPrice }),
      ...(volumeKgPerMonth !== undefined && { volumeKgPerMonth }),
      ...(tags !== undefined && { tags }),
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id)).returning();
    if (!project) { res.status(404).json({ error: "NotFound" }); return; }
    await logActivity(req.user!.userId, "updated", "project", project.id, `Updated project: ${project.name}`);
    res.json(await enrichProject(project));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/approve", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const { chain } = req.body;
    if (!chain || !["commercial", "technical"].includes(chain)) {
      res.status(400).json({ error: "chain must be 'commercial' or 'technical'" });
      return;
    }
    const userId = req.user!.userId;
    const role = req.user!.role;
    const [approver] = await db.select({ department: usersTable.department }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const dept = approver?.department || "";

    if (chain === "commercial" && !canCommercialApprove(role, dept)) {
      res.status(403).json({ error: "Only Sales Manager, Admin, or Executive can give Commercial Approval." });
      return;
    }
    if (chain === "technical" && !canTechnicalApprove(role, dept)) {
      res.status(403).json({ error: "Only NPD Manager, Admin, or Executive can give Technical Approval." });
      return;
    }

    const [current] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "NotFound" }); return; }
    if (current.status !== "pending") {
      res.status(400).json({ error: "Project is not in Pending status." });
      return;
    }

    const now = new Date();
    const patch: any = chain === "commercial"
      ? { commercialApprovedBy: userId, commercialApprovedAt: now }
      : { technicalApprovedBy: userId, technicalApprovedAt: now };

    const bothApproved = chain === "commercial" ? !!current.technicalApprovedBy : !!current.commercialApprovedBy;
    if (bothApproved) patch.status = "new_inventory";
    patch.updatedAt = now;

    const [updated] = await db.update(projectsTable).set(patch).where(eq(projectsTable.id, id)).returning();
    await logActivity(userId, "updated", "project", id,
      `${chain === "commercial" ? "Commercial" : "Technical"} approval granted for: ${current.name}${bothApproved ? " — promoted to New Inventory" : ""}`
    );
    res.json(await enrichProject(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    await logActivity(req.user!.userId, "deleted", "project", id, `Deleted project #${id}`);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
