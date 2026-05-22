import { Router } from "express";
import { db } from "@workspace/db";
import {
  mdpCustomerProductsTable,
  mdpProductionOrdersTable,
  mdpProductionFloorsTable,
  mdpFloorAssignmentsTable,
  mdpProducedOrdersTable,
  accountProductionOrdersTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, inArray, gte, lte, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

const FLOOR_STATUSES = ["Running", "Under Maintenance", "On Hold"] as const;
type FloorStatus = (typeof FLOOR_STATUSES)[number];

router.get("/customer-products", requireAuth, async (req: AuthRequest, res) => {
  try {
    const products = await db.select().from(mdpCustomerProductsTable).orderBy(desc(mdpCustomerProductsTable.createdAt));
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/customer-products", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const [created] = await db.insert(mdpCustomerProductsTable).values({
      accountName: body.accountName,
      company: body.company,
      productType: body.productType,
      urgency: body.urgency ?? "normal",
      priority: body.priority ?? "medium",
      volume: body.volume !== undefined ? Number(body.volume) : 0,
      accountManager: body.accountManager ?? null,
      dateAdded: new Date(),
      lastUpdated: new Date(),
      createdAt: new Date(),
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/customer-products/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as any;
    const [updated] = await db.update(mdpCustomerProductsTable).set({
      accountName: body.accountName,
      company: body.company,
      productType: body.productType,
      urgency: body.urgency,
      priority: body.priority,
      volume: body.volume !== undefined ? Number(body.volume) : undefined,
      accountManager: body.accountManager,
      lastUpdated: new Date(),
    }).where(eq(mdpCustomerProductsTable.id, id)).returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/customer-products/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(mdpCustomerProductsTable).where(eq(mdpCustomerProductsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/production-orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const salesOrders = await db.select().from(accountProductionOrdersTable).orderBy(desc(accountProductionOrdersTable.createdAt)) as Array<Record<string, any>>;
    const salesIds = salesOrders.map((order: Record<string, any>) => order.id).filter((id): id is number => typeof id === "number");
    const existingMdpRows = salesIds.length
      ? await db.select().from(mdpProductionOrdersTable).where(inArray(mdpProductionOrdersTable.salesOrderId, salesIds)) as Array<Record<string, any>>
      : [];

    const mdpBySalesId = new Map<number, Record<string, any>>(existingMdpRows.map((row: Record<string, any>) => [row.salesOrderId, row]));
    const missingInserts = salesOrders
      .filter((order: Record<string, any>) => !mdpBySalesId.has(order.id as number))
      .map((order: Record<string, any>) => ({
        salesOrderId: order.id,
        microbialAnalysis: "Normal",
        remarks: "",
        orderStatus: "Ordered",
        isPlanned: false,
        isProduced: false,
        isDelivered: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    if (missingInserts.length) {
      const insertedRows = await db.insert(mdpProductionOrdersTable).values(missingInserts).returning() as Array<Record<string, any>>;
      insertedRows.forEach((row: Record<string, any>) => mdpBySalesId.set(row.salesOrderId, row));
    }

    const merged = salesOrders.map((order: Record<string, any>) => ({
      ...order,
      ...mdpBySalesId.get(order.id as number),
    }));

    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/production-orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as any;
    const [updated] = await db.update(mdpProductionOrdersTable).set({
      rawMaterialStatus: body.rawMaterialStatus,
      microbialAnalysis: body.microbialAnalysis,
      remarks: body.remarks,
      orderStatus: body.orderStatus,
      isPlanned: body.isPlanned,
      isProduced: body.isProduced,
      isDelivered: body.isDelivered,
      updatedAt: new Date(),
    }).where(eq(mdpProductionOrdersTable.id, id)).returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/production-floors", requireAuth, async (req: AuthRequest, res) => {
  try {
    const floors = await db.select().from(mdpProductionFloorsTable).orderBy(desc(mdpProductionFloorsTable.createdAt));
    res.json(floors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/production-floors", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const [created] = await db.insert(mdpProductionFloorsTable).values({
      floorName: body.floorName,
      blendCategory: body.blendCategory,
      maxCapacityKg: body.maxCapacityKg !== undefined ? Number(body.maxCapacityKg) : 0,
      createdAt: new Date(),
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/production-floors/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as any;
    const [updated] = await db.update(mdpProductionFloorsTable).set({
      floorName: body.floorName,
      blendCategory: body.blendCategory,
      maxCapacityKg: body.maxCapacityKg !== undefined ? Number(body.maxCapacityKg) : undefined,
    }).where(eq(mdpProductionFloorsTable.id, id)).returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.patch("/production-floors/:id/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const incoming = String((req.body as any)?.status ?? "");
    if (!FLOOR_STATUSES.includes(incoming as FloorStatus)) {
      res.status(400).json({ error: "InvalidStatus", allowed: FLOOR_STATUSES });
      return;
    }
    const status = incoming as FloorStatus;

    const [updated] = await db.update(mdpProductionFloorsTable)
      .set({ status })
      .where(eq(mdpProductionFloorsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    let actorName = req.user?.email ?? "A user";
    if (req.user?.userId) {
      const [actor] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user.userId)).limit(1);
      if (actor?.name) actorName = actor.name;
    }
    const title = `Floor status: ${updated.floorName} → ${status}`;
    const message = `${actorName} set ${updated.floorName} to "${status}".`;
    const notifType: "system" | "update" = status === "Running" ? "update" : "system";

    const users = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isActive, true));
    if (users.length > 0) {
      await db.insert(notificationsTable).values(users.map(u => ({
        userId: u.id,
        type: notifType,
        title,
        message,
        isRead: false,
      })));
    }

    if (req.user?.userId) {
      await logActivity(
        req.user.userId,
        `set floor status to ${status}`,
        "production_floor",
        id,
        `${updated.floorName} → ${status}`,
      );
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/production-floors/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(mdpFloorAssignmentsTable).where(eq(mdpFloorAssignmentsTable.floorId, id));
    await db.delete(mdpProductionFloorsTable).where(eq(mdpProductionFloorsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/floor-assignments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const weekLabel = String(req.query.week || "");
    const baseQuery = db.select({
      assignment: mdpFloorAssignmentsTable,
      floor: mdpProductionFloorsTable,
      order: mdpProductionOrdersTable,
    }).from(mdpFloorAssignmentsTable)
      .leftJoin(mdpProductionFloorsTable, eq(mdpFloorAssignmentsTable.floorId, mdpProductionFloorsTable.id))
      .leftJoin(mdpProductionOrdersTable, eq(mdpFloorAssignmentsTable.productionOrderId, mdpProductionOrdersTable.id));

    const query = weekLabel
      ? baseQuery.where(eq(mdpFloorAssignmentsTable.weekLabel, weekLabel))
      : baseQuery;

    const assignments = await query.orderBy(desc(mdpFloorAssignmentsTable.assignedAt));
    res.json(assignments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/floor-assignments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const [created] = await db.insert(mdpFloorAssignmentsTable).values({
      floorId: Number(body.floorId),
      productionOrderId: Number(body.productionOrderId),
      weekLabel: body.weekLabel,
      assignedDay: body.assignedDay,
      planStatus: body.planStatus ?? "Planned",
      assignedVolume: body.assignedVolume != null ? String(body.assignedVolume) : null,
      assignedAt: new Date(),
      producedAt: body.producedAt ? new Date(body.producedAt) : null,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.patch("/floor-assignments/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as { assignedVolume?: number };
    if (body.assignedVolume == null) { res.status(400).json({ error: "assignedVolume required" }); return; }
    const [updated] = await db.update(mdpFloorAssignmentsTable)
      .set({ assignedVolume: String(body.assignedVolume) })
      .where(eq(mdpFloorAssignmentsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/floor-assignments/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(mdpFloorAssignmentsTable).where(eq(mdpFloorAssignmentsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/floor-assignments/:id/produce", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(mdpFloorAssignmentsTable).set({
      planStatus: "Produced",
      producedAt: new Date(),
    }).where(eq(mdpFloorAssignmentsTable.id, id)).returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/produced-orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const view = String(req.query.view || "daily");
    const weekParam = req.query.week ? String(req.query.week) : null;
    const now = new Date();
    let cutoff = new Date(now);
    let upperBound: Date | null = null;

    if (view === "weekly" && weekParam) {
      const [yr, wk] = weekParam.split("-W").map(Number);
      if (!isNaN(yr) && !isNaN(wk)) {
        const jan1 = new Date(yr, 0, 1);
        const dayOffset = (wk - 1) * 7 - jan1.getDay() + 1;
        cutoff = new Date(yr, 0, 1 + dayOffset);
        upperBound = new Date(cutoff);
        upperBound.setDate(cutoff.getDate() + 7);
      }
    } else {
      switch (view) {
        case "weekly":
          cutoff.setDate(now.getDate() - 7);
          break;
        case "monthly":
          cutoff.setMonth(now.getMonth() - 1);
          break;
        case "yearly":
          cutoff.setFullYear(now.getFullYear() - 1);
          break;
        default:
          cutoff.setDate(now.getDate() - 1);
          break;
      }
    }

    const condition = upperBound
      ? and(gte(mdpProducedOrdersTable.producedAt, cutoff), lte(mdpProducedOrdersTable.producedAt, upperBound))
      : gte(mdpProducedOrdersTable.producedAt, cutoff);

    const producedOrders = await db.select().from(mdpProducedOrdersTable).where(condition);
    res.json(producedOrders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/produced-orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const [created] = await db.insert(mdpProducedOrdersTable).values({
      productionOrderId: body.productionOrderId ? Number(body.productionOrderId) : null,
      accountName: body.accountName,
      productName: body.productName,
      productType: body.productType,
      volume: body.volume !== undefined ? Number(body.volume) : 0,
      floorId: body.floorId ? Number(body.floorId) : null,
      producedAt: body.producedAt ? new Date(body.producedAt) : new Date(),
      deliveryStatus: body.deliveryStatus ?? "Pending",
      deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : null,
      createdAt: new Date(),
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/produced-orders/:id/deliver", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status: string = (req.body as any)?.status ?? "Delivered";
    const [updated] = await db.update(mdpProducedOrdersTable).set({
      deliveryStatus: status,
      deliveredAt: status === "Delivered" ? new Date() : null,
    }).where(eq(mdpProducedOrdersTable.id, id)).returning();

    if (!updated) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    if (updated.productionOrderId) {
      await db.update(mdpProductionOrdersTable).set({
        orderStatus: "Delivered",
        updatedAt: new Date(),
      }).where(eq(mdpProductionOrdersTable.id, updated.productionOrderId));
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/produced-orders", requireAuth, async (_req: AuthRequest, res) => {
  try {
    await db.delete(mdpProducedOrdersTable);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
