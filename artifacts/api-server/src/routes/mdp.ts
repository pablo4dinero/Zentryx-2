import { Router } from "express";
import { db } from "@workspace/db";
import {
  mdpCustomerProductsTable,
  mdpProductionOrdersTable,
  mdpProductionFloorsTable,
  mdpFloorAssignmentsTable,
  mdpProducedOrdersTable,
  accountProductionOrdersTable,
} from "@workspace/db";
import { eq, desc, inArray, gte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router = Router();

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
      blenderCapacityKg: body.blenderCapacityKg !== undefined ? Number(body.blenderCapacityKg) : 0,
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
      blenderCapacityKg: body.blenderCapacityKg !== undefined ? Number(body.blenderCapacityKg) : undefined,
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
      shift: body.shift ?? "Day",
      planStatus: body.planStatus ?? "Planned",
      assignedAt: new Date(),
      producedAt: body.producedAt ? new Date(body.producedAt) : null,
    }).returning();
    res.status(201).json(created);
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
    const now = new Date();
    const cutoff = new Date(now);

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

    const producedOrders = await db.select().from(mdpProducedOrdersTable).where(gte(mdpProducedOrdersTable.producedAt, cutoff));
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
    const [updated] = await db.update(mdpProducedOrdersTable).set({
      deliveryStatus: "Delivered",
      deliveredAt: new Date(),
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

export default router;
