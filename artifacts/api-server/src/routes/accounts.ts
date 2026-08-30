import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, accountTasksTable, accountProductionOrdersTable, accountStatusReportsTable, todayProductionOrdersTable, usersTable, callReportsTable, callReportCommentsTable, notificationsTable } from "@workspace/db";
import { eq, asc, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { sanitize } from "../lib/sanitize";

const router = Router();

// Privileged roles see ALL accounts + all Sales Force activity. Everyone
// else only sees accounts they're tagged on as managers.
//
// Post-Phase-1 the role list is consolidated to: admin / executive /
// manager + 5 team roles + viewer. We keep the legacy values mapping
// to the same tier for safety in case any user hasn't yet been migrated
// when this code runs.
function isPrivileged(role: string | null | undefined): boolean {
  const r = (role || "").toLowerCase();
  // New 9-role tiers that get privileged access
  if (r === "admin") return true;
  if (r === "executive") return true;
  if (r === "manager") return true;
  if (r === "operations_team") return true;
  if (r === "sales_team") return true;
  if (r === "npd_team") return true;
  // Legacy aliases — kept temporarily for migration-safety
  if (r === "ceo") return true;
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
    const limit  = Math.min(parseInt(String(req.query.limit  ?? 500)), 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? 0)),   0);
    const allAccounts = await db.select().from(accountsTable)
      .orderBy(desc(accountsTable.createdAt))
      .limit(limit)
      .offset(offset);
    const users = await db.select({ id: usersTable.id, name: usersTable.name, isActive: usersTable.isActive }).from(usersTable);
    const activeUserMap = Object.fromEntries(users.filter(u => u.isActive !== false).map(u => [u.id, u.name]));

    const result = allAccounts.map(a => {
      const normalizedManagers = ((a.accountManagers || []) as number[])
        .filter((id: number) => typeof id === "number" && activeUserMap[id] !== undefined);

      return {
        ...formatAccount({ ...a, accountManagers: normalizedManagers }),
        accountManagerNames: normalizedManagers.map((id: number) => activeUserMap[id] || "Unknown"),
      };
    });
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

    const users = await db.select({ id: usersTable.id, name: usersTable.name, isActive: usersTable.isActive }).from(usersTable);
    const activeUserMap = Object.fromEntries(users.filter(u => u.isActive !== false).map(u => [u.id, u.name]));
    const normalizedManagers = ((account.accountManagers || []) as number[])
      .filter((id: number) => typeof id === "number" && activeUserMap[id] !== undefined);
    res.json({
      ...formatAccount({ ...account, accountManagers: normalizedManagers }),
      accountManagerNames: normalizedManagers.map((id: number) => activeUserMap[id] || "Unknown"),
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
    const userRole = req.user!.role;

    // Auto-tag creator if they're NOT privileged (superadmin/executive/manager/ceo/etc)
    // Privileged users can see all accounts anyway, so don't auto-tag them
    const mgrs: number[] = accountManagers || [];
    if (!isPrivileged(userRole) && !mgrs.includes(creatorId)) {
      mgrs.unshift(creatorId);
    }

    const [account] = await db.insert(accountsTable).values({
      company: sanitize(company), productName: sanitize(productName), accountManagers: mgrs,
      contactPerson: sanitize(contactPerson) || null, cpPhone: cpPhone || null, cpEmail: cpEmail || null,
      customerType: customerType || "new", productType: sanitize(productType), application: sanitize(application) || null,
      targetPrice: targetPrice || null, volume: volume || null,
      urgencyLevel: urgencyLevel || "normal", competitorReference: sanitize(competitorReference) || null,
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
      competitorReference, sellingPrice, margin, approvalStatus, isActive, status,
      updatedAt: clientUpdatedAt } = req.body;

    // Optimistic locking: if the client sent updatedAt, reject if the record
    // was modified by someone else since they loaded it.
    if (clientUpdatedAt) {
      const [current] = await db.select({ updatedAt: accountsTable.updatedAt })
        .from(accountsTable).where(eq(accountsTable.id, id)).limit(1);
      if (!current) { res.status(404).json({ error: "NotFound" }); return; }
      if (new Date(clientUpdatedAt).getTime() !== current.updatedAt.getTime()) {
        res.status(409).json({ error: "Conflict", message: "This record was modified by someone else. Please refresh and try again." });
        return;
      }
    }

    const [account] = await db.update(accountsTable).set({
      company: sanitize(company), productName: sanitize(productName), accountManagers: accountManagers || [],
      contactPerson: sanitize(contactPerson) || null, cpPhone: cpPhone || null, cpEmail: cpEmail || null,
      customerType, productType: sanitize(productType), application: sanitize(application) || null,
      targetPrice: targetPrice || null, volume: volume || null, urgencyLevel,
      competitorReference: sanitize(competitorReference) || null, sellingPrice: sellingPrice || null,
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
    const { price, volume, dateOrdered, expectedDeliveryDate, dateDelivered, excessKg } = req.body;
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
    if (!account) {
      res.status(404).json({ error: "AccountNotFound" });
      return;
    }
    const [order] = await db.update(accountProductionOrdersTable).set({
      price, volume, dateOrdered, expectedDeliveryDate, dateDelivered,
      updatedAt: new Date(),
    }).where(eq(accountProductionOrdersTable.id, orderId)).returning();
    // Write excessKg via raw SQL — safe try/catch until the DB migration adds the column
    if (excessKg !== undefined && order) {
      try {
        await db.execute(sql`UPDATE account_production_orders SET excess_kg = ${Number(excessKg)} WHERE id = ${orderId}`);
      } catch {
        // excess_kg column not yet migrated — skip write
      }
    }
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

// Endpoint: Remove yourself from an account's managers list
router.post("/:id/remove-me-as-manager", requireAuth, async (req: AuthRequest, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
    const userId = req.user!.userId;
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);

    if (!account) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    const managers = (account.accountManagers || []) as number[];
    const filteredManagers = managers.filter((id: number) => id !== userId);

    // Only update if the user was in the managers list
    if (filteredManagers.length === managers.length) {
      res.status(400).json({ error: "BadRequest: You are not a manager for this account" });
      return;
    }

    await db.update(accountsTable).set({
      accountManagers: filteredManagers,
      updatedAt: new Date(),
    }).where(eq(accountsTable.id, accountId));

    res.json({
      success: true,
      message: `You have been removed from the managers list for this account`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// Admin endpoint: Remove a user from all accounts' managers lists
router.post("/admin/remove-from-all-accounts", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Only admins can use this endpoint
    if (!isPrivileged(req.user?.role)) {
      res.status(403).json({ error: "Forbidden: Only admins can use this endpoint" });
      return;
    }

    const userIdToRemove = req.body.userId || req.user?.userId;
    if (!userIdToRemove) {
      res.status(400).json({ error: "BadRequest: userId is required" });
      return;
    }

    // Get all accounts
    const allAccounts = await db.select().from(accountsTable);

    let updatedCount = 0;

    // Remove the user from each account's managers list
    for (const account of allAccounts) {
      const managers = (account.accountManagers || []) as number[];
      const filteredManagers = managers.filter((id: number) => id !== userIdToRemove);

      // Only update if the user was actually in the managers list
      if (filteredManagers.length !== managers.length) {
        await db.update(accountsTable).set({
          accountManagers: filteredManagers,
          updatedAt: new Date(),
        }).where(eq(accountsTable.id, account.id));
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `Removed user ${userIdToRemove} from ${updatedCount} accounts`,
      accountsUpdated: updatedCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ── Call Reports ──────────────────────────────────────────────────────────────

// IMPORTANT: This route must be registered BEFORE /:id/call-reports so Express
// does not treat the literal "all" string as an account ID.
router.get("/call-reports/all", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: callReportsTable.id,
        accountId: callReportsTable.accountId,
        callType: callReportsTable.callType,
        outcome: callReportsTable.outcome,
        summary: callReportsTable.summary,
        nextSteps: callReportsTable.nextSteps,
        calledAt: callReportsTable.calledAt,
        createdById: callReportsTable.createdById,
        createdByName: callReportsTable.createdByName,
        createdAt: callReportsTable.createdAt,
        updatedAt: callReportsTable.updatedAt,
        accountName: accountsTable.company,
      })
      .from(callReportsTable)
      .leftJoin(accountsTable, eq(callReportsTable.accountId, accountsTable.id))
      .orderBy(desc(callReportsTable.calledAt));

    const reportIds = rows.map(r => r.id);
    const comments = reportIds.length > 0
      ? await db.select().from(callReportCommentsTable)
          .where(inArray(callReportCommentsTable.reportId, reportIds))
          .orderBy(asc(callReportCommentsTable.createdAt))
      : [];

    res.json(rows.map(r => ({ ...r, comments: comments.filter(c => c.reportId === r.id) })));
  } catch (err) {
    console.error("[call-reports] all failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/:id/call-reports", requireAuth, async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
    const reports = await db.select().from(callReportsTable)
      .where(eq(callReportsTable.accountId, accountId))
      .orderBy(desc(callReportsTable.calledAt));

    const reportIds = reports.map(r => r.id);
    const comments = reportIds.length > 0
      ? await db.select().from(callReportCommentsTable)
          .where(inArray(callReportCommentsTable.reportId, reportIds))
          .orderBy(asc(callReportCommentsTable.createdAt))
      : [];

    res.json(reports.map(r => ({ ...r, comments: comments.filter(c => c.reportId === r.id) })));
  } catch (err) {
    console.error("[call-reports] list failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/call-reports", requireAuth, async (req: AuthRequest, res) => {
  try {
    const accountId = parseInt(String(req.params.id));
    const { callType, outcome, summary, nextSteps, calledAt, createdByName } = req.body;

    if (!callType || !outcome || !summary || !calledAt) {
      res.status(400).json({ error: "BadRequest", message: "callType, outcome, summary, calledAt are required" });
      return;
    }

    const [report] = await db.insert(callReportsTable).values({
      accountId,
      callType: sanitize(callType),
      outcome: sanitize(outcome),
      summary: sanitize(summary),
      nextSteps: nextSteps ? sanitize(nextSteps) : null,
      calledAt: new Date(calledAt),
      createdById: req.user?.userId ?? null,
      createdByName: createdByName ? sanitize(createdByName) : null,
    }).returning();

    res.status(201).json({ ...report, comments: [] });

    // Send notifications to relevant users — wrapped in try/catch so failures
    // never affect the already-sent response.
    try {
      const [acct] = await db.select({ company: accountsTable.company })
        .from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
      const accountCompany = acct?.company ?? "an account";

      const notifUsers = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.role, ["admin", "executive", "manager", "sales_team"]));

      const targets = notifUsers.filter(u => u.id !== req.user?.userId);
      if (targets.length > 0) {
        await db.insert(notificationsTable).values(
          targets.map(u => ({
            userId: u.id,
            type: "system" as const,
            title: "New Call Report",
            message: `${createdByName || "Someone"} logged a ${callType} with ${accountCompany}`,
            link: "/sales-force",
          }))
        );
      }
    } catch (notifErr) {
      console.error("[call-reports] notification insert failed", notifErr);
    }
  } catch (err) {
    console.error("[call-reports] create failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.patch("/:id/call-reports/:reportId", requireAuth, async (req, res) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const { callType, outcome, summary, nextSteps, calledAt } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (callType !== undefined) updates.callType = sanitize(callType);
    if (outcome !== undefined) updates.outcome = sanitize(outcome);
    if (summary !== undefined) updates.summary = sanitize(summary);
    if (nextSteps !== undefined) updates.nextSteps = nextSteps ? sanitize(nextSteps) : null;
    if (calledAt !== undefined) updates.calledAt = new Date(calledAt);

    const [updated] = await db.update(callReportsTable)
      .set(updates)
      .where(eq(callReportsTable.id, reportId))
      .returning();

    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[call-reports] update failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id/call-reports/:reportId", requireAuth, async (req, res) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    await db.delete(callReportCommentsTable).where(eq(callReportCommentsTable.reportId, reportId));
    await db.delete(callReportsTable).where(eq(callReportsTable.id, reportId));
    res.status(204).send();
  } catch (err) {
    console.error("[call-reports] delete failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/:id/call-reports/:reportId/comments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const { content, authorName } = req.body;

    if (!content?.trim()) {
      res.status(400).json({ error: "BadRequest", message: "content is required" });
      return;
    }

    const [comment] = await db.insert(callReportCommentsTable).values({
      reportId,
      authorId: req.user?.userId ?? null,
      authorName: authorName ? sanitize(authorName) : null,
      content: sanitize(content),
    }).returning();

    res.status(201).json(comment);
  } catch (err) {
    console.error("[call-reports] comment create failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id/call-reports/:reportId/comments/:commentId", requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(String(req.params.commentId));
    await db.delete(callReportCommentsTable).where(eq(callReportCommentsTable.id, commentId));
    res.status(204).send();
  } catch (err) {
    console.error("[call-reports] comment delete failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
