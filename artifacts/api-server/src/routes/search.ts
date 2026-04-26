import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, formulationsTable, tasksTable, usersTable, businessDevTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const q = (req.query.q as string || "").toLowerCase().trim();
    if (!q) {
      res.json({ projects: [], formulations: [], tasks: [], team: [], deals: [] });
      return;
    }

    const [allProjects, allFormulations, allTasks, allUsers, allDeals] = await Promise.all([
      db.select().from(projectsTable),
      db.select().from(formulationsTable),
      db.select().from(tasksTable),
      db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, department: usersTable.department }).from(usersTable),
      db.select().from(businessDevTable),
    ]);

    const projects = allProjects
      .filter(p => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || (p.productCategory || "").toLowerCase().includes(q) || (p.customerName || "").toLowerCase().includes(q) || (p.stage || "").toLowerCase().includes(q))
      .slice(0, 8)
      .map(p => ({ id: p.id, name: p.name, status: p.status, stage: p.stage, customerName: p.customerName }));

    const formulations = allFormulations
      .filter(f => f.name.toLowerCase().includes(q) || (f.notes || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map(f => ({ id: f.id, name: f.name, projectId: f.projectId }));

    const tasks = allTasks
      .filter(t => t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map(t => ({ id: t.id, title: t.title, status: t.status, projectId: t.projectId }));

    const team = allUsers
      .filter(u => u.name.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.role || "").toLowerCase().includes(q) || (u.department || "").toLowerCase().includes(q))
      .slice(0, 5);

    const deals = allDeals
      .filter(d => (d.name || "").toLowerCase().includes(q) || (d.customerName || "").toLowerCase().includes(q) || (d.stage || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map(d => ({ id: d.id, name: d.name, customerName: d.customerName, stage: d.stage }));

    res.json({ projects, formulations, tasks, team, deals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
