import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, accountTasksTable, accountProductionOrdersTable, accountStatusReportsTable, usersTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

const PRIVILEGED_ROLES = ["admin", "manager", "ceo", "head_of_product_development", "head_of_department"];
const isPrivileged = (role: string) =>
  PRIVILEGED_ROLES.includes(role) || role.includes("head") || role.includes("manager") || role === "ceo" || role === "admin";

const RESTRICTED_ROLES = ["key_account_manager", "senior_key_account_manager", "procurement"];

const formatAccount = (a: typeof accountsTable.$inferSelect) => ({
  id: a.id,
  company: a.company,
  productName: a.productName,
  accountManagers: a.accountManagers || [],
  contactPerson: a.contactPerson,
  cpPhone: a.cpPhone,
  cpEmail: a.cpEmail,
  customerType: a.customerType,
  productType: a.productType,
  application: a.application,
  targetPrice: a.targetPrice,
  volume: a.volume,
  urgencyLevel: a.urgencyLevel,
  competitorReference: a.competitorReference,
  sellingPrice: a.sellingPrice,
  margin: a.margin,
  approvalStatus: a.approvalStatus,
  isActive: a.isActive,
  status: a.status ?? "active",
  createdById: a.createdById,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allAccounts = await db.select().from(accountsTable).orderBy(desc(accountsTable.createdAt));
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const userRole = req.user!.role;
    const userId = req.user!.userId;

    // Restricted roles: KAM, SKAM, Procurement — only see accounts they manage or created
    let accounts = allAccounts;
    if (RESTRICTED_ROLES.includes(userRole) && !isPrivileged(userRole)) {
      accounts = allAccounts.filter(a => {
        const managers = (a.accountManagers || []) as number[];
        return managers.includes(userId) || a.createdById === userId;
      });
    }

    const result = accounts.map(a => ({
      ...formatAccount(a),
      accountManagerNames: ((a.accountManagers || []) as number[]).map((id: number) => userMap[id] || "Unknown"),
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id)).limit(1);
    if (!account) { res.status(404).json({ error: "NotFound" }); return; }

    // Apply same restricted-role visibility as the list endpoint
    const userRole = req.user!.role;
    const userId = req.user!.userId;
    if (RESTRICTED_ROLES.includes(userRole) && !isPrivileged(userRole)) {
      const managers = (account.accountManagers || []) as number[];
      if (!managers.includes(userId) && account.createdById !== userId) {
        res.status(403).json({ error: "Forbidden", message: "You don't have access to this account" });
        return;
      }
    }

    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
    res.json({
      ...formatAccount(account),
      accountManagerNames: ((account.accountManagers || []) as number[]).map((id: number) => userMap[id] || "Unknown"),
    });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { company, productName, accountManagers, contactPerson, cpPhone, cpEmail,
      customerType, productType, application, targetPrice, volume,
      urgencyLevel, competitorReference, sellingPrice, margin } = req.body;
    const creatorId = req.user!.userId;
    // Ensure creator is always in the accountManagers list
    const mgrs: number[] = accountManagers || [];
    if (!mgrs.includes(creatorId)) mgrs.unshift(creatorId);
    const [account] = await db.insert(accountsTable).values({
      company, productName, accountManagers: mgrs,
      contactPerson: contactPerson || null, cpPhone: cpPhone || null, cpEmail: cpEmail || null,
      customerType: customerType || "new", productType, application: application || null,
      targetPrice: targetPrice || null, volume: volume || null,
      urgencyLevel: urgencyLevel || "normal", competitorReference: competitorReference || null,
      sellingPrice: sellingPrice || null, margin: margin || null,
      createdById: creatorId,
    }).returning();
    if (req.user?.userId) {
      await logActivity(req.user.userId, "created_account", "account", account.id, `Created account: ${company} – ${productName}`);
    }
    res.status(201).json(formatAccount(account));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { company, productName, accountManagers, contactPerson, cpPhone, cpEmail,
      customerType, productType, application, targetPrice, volume, urgencyLevel,
      competitorReference, sellingPrice, margin, approvalStatus, isActive, status } = req.body;
    const [account] = await db.update(accountsTable).set({
      company, productName, accountManagers: accountManagers || [],
      contactPerson: contactPerson || null, cpPhone: cpPhone || null, cpEmail: cpEmail || null,
      customerType, productType, application: application || null,
      targetPrice: targetPrice || null, volume: volume || null, urgencyLevel,
      competitorReference: competitorReference || null, sellingPrice: sellingPrice || null,
      margin: margin || null, approvalStatus, isActive,
      status: status || "active", updatedAt: new Date(),
    }).where(eq(accountsTable.id, id)).returning();
    if (!account) { res.status(404).json({ error: "NotFound" }); return; }
    if (req.user?.userId) {
      await logActivity(req.user.userId, "updated_account", "account", id, `Updated account: ${account.company} – ${account.productName}`);
    }
    res.json(formatAccount(account));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(accountsTable).where(eq(accountsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/tasks", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const tasks = await db.select().from(accountTasksTable)
      .where(eq(accountTasksTable.accountId, accountId))
      .orderBy(asc(accountTasksTable.sortOrder), asc(accountTasksTable.createdAt));
    res.json(tasks);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/tasks", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const { title, status, description, assigneeId, startDate, dueDate, sortOrder } = req.body;
    const [task] = await db.insert(accountTasksTable).values({
      accountId, title, status: status || "todo", description, assigneeId, startDate, dueDate, sortOrder: sortOrder || 0,
    }).returning();
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { title, status, description, assigneeId, startDate, dueDate, sortOrder } = req.body;
    const [task] = await db.update(accountTasksTable).set({
      title, status, description, assigneeId, startDate, dueDate, sortOrder, updatedAt: new Date(),
    }).where(eq(accountTasksTable.id, taskId)).returning();
    if (!task) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(task);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    await db.delete(accountTasksTable).where(eq(accountTasksTable.id, taskId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/production-orders", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const orders = await db.select().from(accountProductionOrdersTable)
      .where(eq(accountProductionOrdersTable.accountId, accountId))
      .orderBy(asc(accountProductionOrdersTable.createdAt));
    res.json(orders);
  } catch (err) {
    console.error('Error fetching production orders:', err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/production-orders", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const { price, volume, dateOrdered, dateDelivered } = req.body;
    const [order] = await db.insert(accountProductionOrdersTable).values({
      accountId,
      price: price !== undefined && price !== "" ? String(price) : null,
      volume: volume !== undefined && volume !== "" ? String(volume) : null,
      dateOrdered: dateOrdered || null,
      dateDelivered: dateDelivered || null,
    }).returning();
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id/production-orders/:orderId", requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { price, volume, dateOrdered, expectedDeliveryDate, dateDelivered } = req.body;
    const [order] = await db.update(accountProductionOrdersTable).set({
      price, volume, dateOrdered, expectedDeliveryDate, dateDelivered,
    }).where(eq(accountProductionOrdersTable.id, orderId)).returning();
    if (!order) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(order);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id/production-orders/:orderId", requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    await db.delete(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.id, orderId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/status-reports", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const reports = await db.select().from(accountStatusReportsTable)
      .where(eq(accountStatusReportsTable.accountId, accountId))
      .orderBy(desc(accountStatusReportsTable.createdAt));
    res.json(reports);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/status-reports", requireAuth, async (req: AuthRequest, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const { content, authorName } = req.body;
    const [report] = await db.insert(accountStatusReportsTable).values({
      accountId, content, authorId: req.user?.userId, authorName,
    }).returning();
    res.status(201).json(report);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id/status-reports/:reportId", requireAuth, async (req, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    await db.delete(accountStatusReportsTable).where(eq(accountStatusReportsTable.id, reportId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
