import { Router } from "express";
import { db } from "@workspace/db";
import {
  accountsTable, accountProductionOrdersTable, todayProductionOrdersTable, usersTable,
  mdpProductionOrdersTable, mdpFloorAssignmentsTable, mdpProductSwitchDowntimesTable, mdpProducedOrdersTable,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { sendProductionOrderNotification } from "../lib/mail";
import { logger } from "../lib/logger";

const router = Router();

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

function isWithinLastDays(date: string | null | undefined, days: number): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const now = new Date();
  const dayDiff = Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  return dayDiff >= 0 && dayDiff < days;
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const period = String(req.query.period || "daily");
    const orders = await db.select({
      id: accountProductionOrdersTable.id,
      productionOrderId: accountProductionOrdersTable.id,
      accountId: accountProductionOrdersTable.accountId,
      accountCompany: accountsTable.company,
      productName: accountsTable.productName,
      price: accountProductionOrdersTable.price,
      volume: accountProductionOrdersTable.volume,
      dateOrdered: accountProductionOrdersTable.dateOrdered,
      expectedDeliveryDate: accountProductionOrdersTable.expectedDeliveryDate,
      dateDelivered: accountProductionOrdersTable.dateDelivered,
      createdAt: accountProductionOrdersTable.createdAt,
    })
      .from(accountProductionOrdersTable)
      .leftJoin(accountsTable, eq(accountProductionOrdersTable.accountId, accountsTable.id))
      .orderBy(desc(accountProductionOrdersTable.createdAt));

    const filtered = orders.filter(order => {
      if (period === "all") return true;
      if (period === "yearly") return isWithinLastDays(order.dateOrdered, 365);
      if (period === "weekly") return isWithinLastDays(order.dateOrdered, 7);
      if (period === "monthly") return isWithinLastDays(order.dateOrdered, 30);
      return isTodayDate(order.dateOrdered);
    });

    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/today", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const orders = await db.select().from(todayProductionOrdersTable)
      .orderBy(desc(todayProductionOrdersTable.createdAt));
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/today", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { accountId, price, volume, dateOrdered, expectedDeliveryDate, dateDelivered } = req.body;
    if (!accountId) {
      res.status(400).json({ error: "AccountIdRequired" });
      return;
    }
    if (!isTodayDate(dateOrdered)) {
      res.status(400).json({ error: "dateOrdered_must_be_today" });
      return;
    }

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
    if (!account) {
      res.status(404).json({ error: "AccountNotFound" });
      return;
    }

    const [order] = await db.insert(accountProductionOrdersTable).values({
      accountId,
      price: price !== undefined && price !== "" ? String(price) : null,
      volume: volume !== undefined && volume !== "" ? String(volume) : null,
      dateOrdered,
      expectedDeliveryDate: expectedDeliveryDate || null,
      dateDelivered: dateDelivered || null,
    }).returning();

    await db.insert(todayProductionOrdersTable).values({
      productionOrderId: order.id,
      accountId,
      accountCompany: account.company,
      productName: account.productName,
      price: order.price,
      volume: order.volume,
      dateOrdered: order.dateOrdered,
      expectedDeliveryDate: order.expectedDeliveryDate || null,
      dateDelivered: order.dateDelivered || null,
    });

    logger.info({ orderId: order.id }, "[Mail] Queuing production order notification");
    db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.isActive, true))
      .then(users =>
        sendProductionOrderNotification(users, {
          orderNumber: order.id,
          account: account.company ?? "",
          product: account.productName ?? "",
          volume: order.volume,
          dateOrdered: order.dateOrdered,
          expectedDeliveryDate: order.expectedDeliveryDate,
        })
      )
      .catch(err => logger.error({ err }, "[Mail] Production order notification failed"));

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/today/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [row] = await db.select().from(todayProductionOrdersTable).where(eq(todayProductionOrdersTable.id, id)).limit(1);
    if (!row) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    await db.delete(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.id, row.productionOrderId));
    await db.delete(todayProductionOrdersTable).where(eq(todayProductionOrdersTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (body.accountId !== undefined) updates.accountId = Number(body.accountId);
    if (body.price !== undefined) updates.price = body.price === "" ? null : String(body.price);
    if (body.volume !== undefined) updates.volume = body.volume === "" ? null : String(body.volume);
    if (body.expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = body.expectedDeliveryDate || null;
    if (body.dateDelivered !== undefined) updates.dateDelivered = body.dateDelivered || null;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "NoFieldsToUpdate" });
      return;
    }

    const [updated] = await db.update(accountProductionOrdersTable)
      .set(updates)
      .where(eq(accountProductionOrdersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    // Mirror price/volume/dates onto the today_production_orders cache row so
    // the daily list and any joined views stay in sync.
    await db.update(todayProductionOrdersTable).set({
      price: updated.price,
      volume: updated.volume,
      dateOrdered: updated.dateOrdered,
      expectedDeliveryDate: updated.expectedDeliveryDate,
      dateDelivered: updated.dateDelivered,
    }).where(eq(todayProductionOrdersTable.productionOrderId, id));

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [existing] = await db.select().from(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    // Cascade clean-up of any MDP rows that reference this sales-side order so
    // the Sales Force delete doesn't leave orphan production-planning data.
    const mdpRows = await db.select({ id: mdpProductionOrdersTable.id }).from(mdpProductionOrdersTable)
      .where(eq(mdpProductionOrdersTable.salesOrderId, id));
    const mdpIds = mdpRows.map(r => r.id);
    if (mdpIds.length > 0) {
      const assignments = await db.select({ id: mdpFloorAssignmentsTable.id }).from(mdpFloorAssignmentsTable)
        .where(inArray(mdpFloorAssignmentsTable.productionOrderId, mdpIds));
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length > 0) {
        await db.delete(mdpProductSwitchDowntimesTable)
          .where(inArray(mdpProductSwitchDowntimesTable.afterAssignmentId, assignmentIds));
        await db.delete(mdpFloorAssignmentsTable)
          .where(inArray(mdpFloorAssignmentsTable.id, assignmentIds));
      }
      await db.delete(mdpProducedOrdersTable)
        .where(inArray(mdpProducedOrdersTable.productionOrderId, mdpIds));
      await db.delete(mdpProductionOrdersTable)
        .where(inArray(mdpProductionOrdersTable.id, mdpIds));
    }

    await db.delete(todayProductionOrdersTable).where(eq(todayProductionOrdersTable.productionOrderId, id));
    await db.delete(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
