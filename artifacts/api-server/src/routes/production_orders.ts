import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, accountProductionOrdersTable, todayProductionOrdersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

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
      if (period === "weekly") {
        return isWithinLastDays(order.dateOrdered, 7);
      }
      if (period === "monthly") {
        return isWithinLastDays(order.dateOrdered, 30);
      }
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

export default router;
