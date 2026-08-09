import { Router } from "express";
import { db } from "@workspace/db";
import {
  accountsTable, accountProductionOrdersTable, todayProductionOrdersTable, usersTable,
  mdpProductionOrdersTable, mdpFloorAssignmentsTable, mdpProductSwitchDowntimesTable, mdpProducedOrdersTable,
  productionOrderEventsTable,
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

// Returns Mon 00:00 and Sat 23:59 of the given ISO week string ("2026-W32").
// Saturday is included as a working day.
function getWeekRange(isoWeek: string): { start: Date; end: Date } | null {
  const match = isoWeek.match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) return null;
  const yr = parseInt(match[1]);
  const wk = parseInt(match[2]);
  // ISO 8601: week 1 is the week containing January 4th.
  const jan4 = new Date(yr, 0, 4);
  const dow = jan4.getDay() || 7; // 1=Mon … 7=Sun
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + 1 + (wk - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5); // Mon+5 = Sat
  saturday.setHours(23, 59, 59, 999);
  return { start: monday, end: saturday };
}

function isInDay(date: string | null | undefined, day: string): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const target = new Date(day);
  return parsed.getFullYear() === target.getFullYear()
    && parsed.getMonth() === target.getMonth()
    && parsed.getDate() === target.getDate();
}

function isInWeek(date: string | null | undefined, week: string): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const range = getWeekRange(week);
  if (!range) return false;
  return parsed >= range.start && parsed <= range.end;
}

function isInMonth(date: string | null | undefined, month: string): boolean {
  // month format: "2026-08"
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const [yr, mo] = month.split("-").map(Number);
  return parsed.getFullYear() === yr && parsed.getMonth() === mo - 1;
}

function isInYear(date: string | null | undefined, year: string): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  return parsed.getFullYear() === parseInt(year);
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const period = String(req.query.period || "daily");
    const day   = req.query.day   as string | undefined;
    const week  = req.query.week  as string | undefined;
    const month = req.query.month as string | undefined;
    const year  = req.query.year  as string | undefined;
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
      updatedAt: accountProductionOrdersTable.updatedAt,
      createdByName: accountProductionOrdersTable.createdByName,
    })
      .from(accountProductionOrdersTable)
      .leftJoin(accountsTable, eq(accountProductionOrdersTable.accountId, accountsTable.id))
      .orderBy(desc(accountProductionOrdersTable.createdAt));

    const filtered = orders.filter(order => {
      if (period === "all") return true;
      if (period === "daily")   return day   ? isInDay(order.dateOrdered, day)     : isTodayDate(order.dateOrdered);
      if (period === "weekly")  return week  ? isInWeek(order.dateOrdered, week)   : isWithinLastDays(order.dateOrdered, 7);
      if (period === "monthly") return month ? isInMonth(order.dateOrdered, month) : isWithinLastDays(order.dateOrdered, 30);
      if (period === "yearly")  return year  ? isInYear(order.dateOrdered, year)   : isWithinLastDays(order.dateOrdered, 365);
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

    const [actor] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    const [order] = await db.insert(accountProductionOrdersTable).values({
      accountId,
      price: price !== undefined && price !== "" ? String(price) : null,
      volume: volume !== undefined && volume !== "" ? String(volume) : null,
      dateOrdered,
      expectedDeliveryDate: expectedDeliveryDate || null,
      dateDelivered: dateDelivered || null,
      createdById: req.user!.userId,
      createdByName: actor?.name ?? null,
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

    try {
      await db.insert(productionOrderEventsTable).values({
        orderId: order.id,
        eventType: "created",
        actorId: req.user!.userId,
        actorName: actor?.name ?? "Unknown",
        module: "Sales Force",
        section: "New Production Orders",
        description: `Order created for ${account.company}${account.productName ? ` — ${account.productName}` : ""}`,
      });
    } catch { /* non-fatal */ }

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

router.get("/:id/events", requireAuth, async (req, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const events = await db.select().from(productionOrderEventsTable)
      .where(eq(productionOrderEventsTable.orderId, id))
      .orderBy(desc(productionOrderEventsTable.createdAt));
    res.json(events);
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

    // Optimistic locking: reject if record changed since client loaded it
    if (body.updatedAt) {
      const [current] = await db.select({ updatedAt: accountProductionOrdersTable.updatedAt })
        .from(accountProductionOrdersTable)
        .where(eq(accountProductionOrdersTable.id, id))
        .limit(1);
      if (!current) { res.status(404).json({ error: "NotFound" }); return; }
      if (new Date(String(body.updatedAt)).getTime() !== new Date(current.updatedAt ?? 0).getTime()) {
        res.status(409).json({ error: "Conflict", message: "This record was modified by someone else. Please refresh and try again." });
        return;
      }
    }

    updates.updatedAt = new Date();
    const [updated] = await db.update(accountProductionOrdersTable)
      .set(updates)
      .where(eq(accountProductionOrdersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    try {
      const [actor] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, (req as AuthRequest).user!.userId)).limit(1);
      await db.insert(productionOrderEventsTable).values({
        orderId: id,
        eventType: "edited",
        actorId: (req as AuthRequest).user!.userId,
        actorName: actor?.name ?? "Unknown",
        module: "Sales Force",
        section: "New Production Orders",
        description: `Order edited: ${Object.keys(updates).filter(k => k !== "updatedAt").join(", ")} updated`,
      });
    } catch { /* non-fatal */ }

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
