import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, accountTasksTable, accountProductionOrdersTable, accountStatusReportsTable, todayProductionOrdersTable, usersTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

// Privileged roles see ALL accounts + all Sales Force activity. Everyone
// else (Key Account Manager, Technical Sales Officer, Customer Service
// Lead, etc.) only sees accounts they created or were tagged on as
// account managers.
//
// Important: we used to use `role.includes("manager")` as a privileged
// check, but that string match incorrectly matched `key_account_manager`
// and `senior_key_account_manager` — silently granting them full access.
// The new check uses explicit role strings + a safe `head_` prefix so
// only true department heads pass.
function isPrivileged(role: string | null | undefined): boolean {
  const r = (role || "").toLowerCase();
  if (r === "admin") return true;
  if (r === "ceo") return true;
  if (r === "manager") return true;
  if (r === "managing_director") return true;
  if (r.startsWith("head_")) return true;
  return false;
}

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

function parseDMY(date: string | null | undefined): Date | null {
  if (!date || typeof date !== "string") return null;
  const parts = date.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const day = parseInt(d, 10);
  const month = parseInt(m, 10) - 1;
  const year = parseInt(y, 10);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  const parsed = new Date(year, month, day);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isTodayDate(date: string | null | undefined): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const now = new Date();
  return parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate();
}

async function upsertTodayOrderEntry(order: any, account: typeof accountsTable.$inferSelect) {
  await db.delete(todayProductionOrdersTable)
    .where(eq(todayProductionOrdersTable.productionOrderId, order.id));

  if (!isTodayDate(order.dateOrdered)) {
    return;
  }

  await db.insert(todayProductionOrdersTable).values({
    productionOrderId: order.id,
    accountId: account.id,
    accountCompany: account.company,
    productName: account.productName,
    price: order.price,
    volume: order.volume,
    dateOrdered: order.dateOrdered,
    expectedDeliveryDate: order.expectedDeliveryDate || null,
    dateDelivered: order.dateDelivered || null,
  });
}

async function deleteTodayOrderEntry(productionOrderId: number) {
  await db.delete(todayProductionOrdersTable)
    .where(eq(todayProductionOrdersTable.productionOrderId, productionOrderId));
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allAccounts = await db.select().from(accountsTable).orderBy(desc(accountsTable.createdAt));
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const userRole = req.user!.role;
    const userId = req.user!.userId;

    // Anyone who isn't privileged (admin / manager / ceo / managing_director
    // / head_*) only sees the accounts they're tagged on as a manager.
    // accountManagers is the SOLE source of truth — the legacy
    // `createdById` fallback was removed so the creator can untag
    // themselves from accounts they made (typical case: the admin
    // bootstraps the account then hands it off to the real owner).
    let accounts = allAccounts;
    if (!isPrivileged(userRole)) {
      accounts = allAccounts.filter(a => {
        const managers = (a.accountManagers || []) as number[];
        return managers.includes(userId);
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
    const id = parseInt(String(req.params.id));
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id)).limit(1);
    if (!account) { res.status(404).json({ error: "NotFound" }); return; }

    // Apply same restricted-role visibility as the list endpoint —
    // accountManagers is the sole source of truth; createdById is NOT
    // a fallback (creators must stay tagged to keep access).
    const userRole = req.user!.role;
    const userId = req.user!.userId;
    if (!isPrivileged(userRole)) {
      const managers = (account.accountManagers || []) as number[];
      if (!managers.includes(userId)) {
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
    const id = parseInt(String(req.params.id));
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
    const id = parseInt(String(req.params.id));
    await db.delete(todayProductionOrdersTable).where(eq(todayProductionOrdersTable.accountId, id));
    await db.delete(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.accountId, id));
    await db.delete(accountsTable).where(eq(accountsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/tasks", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
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
    const accountId = parseInt(String(req.params.id));
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
    const taskId = parseInt(String(req.params.taskId));
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
    const taskId = parseInt(String(req.params.taskId));
    await db.delete(accountTasksTable).where(eq(accountTasksTable.id, taskId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/production-orders", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
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
    const accountId = parseInt(String(req.params.id));
    const { price, volume, dateOrdered, expectedDeliveryDate, dateDelivered } = req.body;
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
    if (!account) {
      res.status(404).json({ error: "AccountNotFound" });
      return;
    }
    const [order] = await db.insert(accountProductionOrdersTable).values({
      accountId,
      price: price !== undefined && price !== "" ? String(price) : null,
      volume: volume !== undefined && volume !== "" ? String(volume) : null,
      dateOrdered: dateOrdered || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      dateDelivered: dateDelivered || null,
    }).returning();

    await upsertTodayOrderEntry(order, account);

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id/production-orders/:orderId", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
    const orderId = parseInt(String(req.params.orderId));
    const { price, volume, dateOrdered, expectedDeliveryDate, dateDelivered } = req.body;
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
    if (!account) {
      res.status(404).json({ error: "AccountNotFound" });
      return;
    }
    const [order] = await db.update(accountProductionOrdersTable).set({
      price, volume, dateOrdered, expectedDeliveryDate, dateDelivered,
    }).where(eq(accountProductionOrdersTable.id, orderId)).returning();
    if (!order) { res.status(404).json({ error: "NotFound" }); return; }

    await upsertTodayOrderEntry(order, account);
    res.json(order);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id/production-orders/:orderId", requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(String(req.params.orderId));
    await deleteTodayOrderEntry(orderId);
    await db.delete(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.id, orderId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/status-reports", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
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
    const accountId = parseInt(String(req.params.id));
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
    const reportId = parseInt(String(req.params.reportId));
    await db.delete(accountStatusReportsTable).where(eq(accountStatusReportsTable.id, reportId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
