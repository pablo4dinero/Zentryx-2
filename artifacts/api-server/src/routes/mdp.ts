import { Router } from "express";
import { db } from "@workspace/db";
import {
  mdpCustomerProductsTable,
  mdpProductionOrdersTable,
  mdpProductionFloorsTable,
  mdpFloorAssignmentsTable,
  mdpProducedOrdersTable,
  mdpFloorDayStatusesTable,
  mdpProductSwitchDowntimesTable,
  accountProductionOrdersTable,
  accountsTable,
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

    // Enrich with account data using accountId from MDP orders
    const accounts = await db.select().from(accountsTable) as Array<Record<string, any>>;
    const accountsById = new Map(accounts.map((a: Record<string, any>) => [a.id, a]));

    const enriched = merged.map((order: Record<string, any>) => {
      const accountData = order.accountId ? accountsById.get(order.accountId) : null;
      return {
        ...order,
        productName: accountData?.productName || order.productName,
        productType: accountData?.productType || order.productType,
        company: accountData?.company || order.company,
        accountName: accountData?.company || order.accountName,
      };
    });

    res.json(enriched);
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
      blendSpeedId: body.blendSpeedId,
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

router.delete("/production-orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [mdpRow] = await db.select().from(mdpProductionOrdersTable).where(eq(mdpProductionOrdersTable.id, id)).limit(1);
    if (!mdpRow) { res.status(404).json({ error: "NotFound" }); return; }

    // Drop everything dependent on the underlying sales order so the GET
    // /production-orders merge can't resurrect it on the next refetch.
    const salesOrderId = mdpRow.salesOrderId;
    const assignments = await db.select({ id: mdpFloorAssignmentsTable.id }).from(mdpFloorAssignmentsTable)
      .where(eq(mdpFloorAssignmentsTable.productionOrderId, id));
    const assignmentIds = assignments.map(a => a.id);
    if (assignmentIds.length > 0) {
      await db.delete(mdpProductSwitchDowntimesTable)
        .where(inArray(mdpProductSwitchDowntimesTable.afterAssignmentId, assignmentIds));
      await db.delete(mdpFloorAssignmentsTable)
        .where(inArray(mdpFloorAssignmentsTable.id, assignmentIds));
    }
    await db.delete(mdpProducedOrdersTable).where(eq(mdpProducedOrdersTable.productionOrderId, id));
    await db.delete(mdpProductionOrdersTable).where(eq(mdpProductionOrdersTable.id, id));
    if (salesOrderId) {
      await db.delete(accountProductionOrdersTable).where(eq(accountProductionOrdersTable.id, salesOrderId));
    }
    res.json({ success: true });
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
      allowedProductTypes: Array.isArray(body.allowedProductTypes) ? body.allowedProductTypes.map(String) : [],
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
      allowedProductTypes: Array.isArray(body.allowedProductTypes) ? body.allowedProductTypes.map(String) : undefined,
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

router.get("/floor-day-statuses", requireAuth, async (req: AuthRequest, res) => {
  try {
    const weekLabel = String(req.query.week || "");
    const rows = weekLabel
      ? await db.select().from(mdpFloorDayStatusesTable).where(eq(mdpFloorDayStatusesTable.weekLabel, weekLabel))
      : await db.select().from(mdpFloorDayStatusesTable);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.patch("/floor-day-statuses", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as { floorId?: number; weekLabel?: string; assignedDay?: string; status?: string };
    const floorId = Number(body.floorId);
    const weekLabel = String(body.weekLabel ?? "");
    const assignedDay = String(body.assignedDay ?? "");
    const incoming = String(body.status ?? "");

    if (!floorId || !weekLabel || !assignedDay) {
      res.status(400).json({ error: "floorId, weekLabel and assignedDay are required" });
      return;
    }
    if (!FLOOR_STATUSES.includes(incoming as FloorStatus)) {
      res.status(400).json({ error: "InvalidStatus", allowed: FLOOR_STATUSES });
      return;
    }
    const status = incoming as FloorStatus;

    const [floor] = await db.select().from(mdpProductionFloorsTable).where(eq(mdpProductionFloorsTable.id, floorId)).limit(1);
    if (!floor) {
      res.status(404).json({ error: "FloorNotFound" });
      return;
    }

    const [existing] = await db.select().from(mdpFloorDayStatusesTable)
      .where(and(
        eq(mdpFloorDayStatusesTable.floorId, floorId),
        eq(mdpFloorDayStatusesTable.weekLabel, weekLabel),
        eq(mdpFloorDayStatusesTable.assignedDay, assignedDay),
      )).limit(1);

    let row;
    if (existing) {
      [row] = await db.update(mdpFloorDayStatusesTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(mdpFloorDayStatusesTable.id, existing.id))
        .returning();
    } else {
      [row] = await db.insert(mdpFloorDayStatusesTable)
        .values({ floorId, weekLabel, assignedDay, status })
        .returning();
    }

    let actorName = req.user?.email ?? "A user";
    if (req.user?.userId) {
      const [actor] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user.userId)).limit(1);
      if (actor?.name) actorName = actor.name;
    }
    const title = `Floor status: ${floor.floorName} (${assignedDay}) → ${status}`;
    const message = `${actorName} set ${floor.floorName} on ${assignedDay} (${weekLabel}) to "${status}".`;
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
        floorId,
        `${floor.floorName} · ${assignedDay} · ${weekLabel} → ${status}`,
      );
    }

    res.json(row);
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

    // Get all assignments for the week
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

    const assignments = await query.orderBy(desc(mdpFloorAssignmentsTable.assignedAt)) as Array<Record<string, any>>;

    // Enrich from accountsTable using accountId (NOW available after migration)
    // accountsTable has productName, productType, company for each account
    const accounts = await db.select().from(accountsTable) as Array<Record<string, any>>;
    const accountsById = new Map(accounts.map((a: Record<string, any>) => [a.id, a]));

    // Enrich assignments by looking up account data via accountId
    const enriched = assignments.map((a: Record<string, any>) => {
      if (!a.order) return a;

      // Look up account by accountId - this has productName, productType, company
      const accountData = a.order.accountId ? accountsById.get(a.order.accountId) : null;

      return {
        ...a,
        order: {
          ...a.order,
          // Inject account fields into order (these are the SOURCE OF TRUTH)
          productName: accountData?.productName || a.order.productName,
          productType: accountData?.productType || a.order.productType,
          company: accountData?.company || a.order.accountName,
          accountName: accountData?.company || a.order.accountName,
        }
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/floor-assignments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const floorId = Number(body.floorId);
    const weekLabel = String(body.weekLabel ?? "");
    const assignedDay = String(body.assignedDay ?? "");

    const [created] = await db.insert(mdpFloorAssignmentsTable).values({
      floorId,
      productionOrderId: Number(body.productionOrderId),
      weekLabel,
      assignedDay,
      planStatus: body.planStatus ?? "Planned",
      assignedVolume: body.assignedVolume != null ? String(body.assignedVolume) : null,
      assignedAt: new Date(),
      producedAt: body.producedAt ? new Date(body.producedAt) : null,
    }).returning();

    if (created && floorId && weekLabel && assignedDay) {
      // Only auto-create a 60-min product-switch downtime when the new
      // assignment's product type actually differs from what's already on
      // this (floor, week, day) cell. Walking the chain
      //   mdp_floor_assignments → mdp_production_orders (sales_order_id)
      //   → account_production_orders → accounts (product_type)
      // is the only place that stores productType in this app.
      const cellAssignments = await db
        .select({
          id: mdpFloorAssignmentsTable.id,
          productType: accountsTable.productType,
        })
        .from(mdpFloorAssignmentsTable)
        .innerJoin(mdpProductionOrdersTable, eq(mdpFloorAssignmentsTable.productionOrderId, mdpProductionOrdersTable.id))
        .innerJoin(accountProductionOrdersTable, eq(mdpProductionOrdersTable.salesOrderId, accountProductionOrdersTable.id))
        .innerJoin(accountsTable, eq(accountProductionOrdersTable.accountId, accountsTable.id))
        .where(and(
          eq(mdpFloorAssignmentsTable.floorId, floorId),
          eq(mdpFloorAssignmentsTable.weekLabel, weekLabel),
          eq(mdpFloorAssignmentsTable.assignedDay, assignedDay),
        ));
      const normalise = (s: string | null) =>
        String(s ?? "").trim().toLowerCase().replace(/[\s&_\-/]+/g, "_");
      const newRow = cellAssignments.find(r => r.id === created.id);
      const newType = normalise(newRow?.productType ?? null);
      const otherTypes = cellAssignments
        .filter(r => r.id !== created.id)
        .map(r => normalise(r.productType))
        .filter(t => t.length > 0);
      const isDifferent = otherTypes.length > 0 && otherTypes.some(t => t !== newType);
      if (isDifferent) {
        await db.insert(mdpProductSwitchDowntimesTable)
          .values({ afterAssignmentId: created.id, minutes: 60 })
          .onConflictDoNothing();
      }
    }

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
    await db.delete(mdpProductSwitchDowntimesTable).where(eq(mdpProductSwitchDowntimesTable.afterAssignmentId, id));
    await db.delete(mdpFloorAssignmentsTable).where(eq(mdpFloorAssignmentsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/product-switch-downtimes", requireAuth, async (req: AuthRequest, res) => {
  try {
    const weekLabel = String(req.query.week || "");
    if (!weekLabel) { res.json([]); return; }
    const rows = await db.select({
      id: mdpProductSwitchDowntimesTable.id,
      afterAssignmentId: mdpProductSwitchDowntimesTable.afterAssignmentId,
      minutes: mdpProductSwitchDowntimesTable.minutes,
    })
      .from(mdpProductSwitchDowntimesTable)
      .innerJoin(mdpFloorAssignmentsTable, eq(mdpFloorAssignmentsTable.id, mdpProductSwitchDowntimesTable.afterAssignmentId))
      .where(eq(mdpFloorAssignmentsTable.weekLabel, weekLabel));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.patch("/product-switch-downtimes", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as { afterAssignmentId?: number; minutes?: number };
    const aid = Number(body.afterAssignmentId);
    const minutes = Number(body.minutes);
    if (!aid || !Number.isFinite(minutes) || minutes < 0) {
      res.status(400).json({ error: "afterAssignmentId and non-negative minutes required" });
      return;
    }

    const [existing] = await db.select().from(mdpProductSwitchDowntimesTable)
      .where(eq(mdpProductSwitchDowntimesTable.afterAssignmentId, aid)).limit(1);

    let row;
    if (existing) {
      [row] = await db.update(mdpProductSwitchDowntimesTable)
        .set({ minutes, updatedAt: new Date() })
        .where(eq(mdpProductSwitchDowntimesTable.id, existing.id))
        .returning();
    } else {
      [row] = await db.insert(mdpProductSwitchDowntimesTable)
        .values({ afterAssignmentId: aid, minutes })
        .returning();
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/floor-assignments/:id/produce", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);

    // Idempotency: if the assignment is already produced, leave producedAt
    // alone and just return the existing row. Stops accidental double-clicks
    // from re-stamping a fresh timestamp on a record the user already
    // returned to planning or already produced.
    const [existing] = await db.select().from(mdpFloorAssignmentsTable).where(eq(mdpFloorAssignmentsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "NotFound" });
      return;
    }
    if (existing.planStatus === "Produced") {
      res.json(existing);
      return;
    }

    const [updated] = await db.update(mdpFloorAssignmentsTable).set({
      planStatus: "Produced",
      producedAt: new Date(),
    }).where(eq(mdpFloorAssignmentsTable.id, id)).returning();

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

    // Idempotency: a single floor assignment can only have one produced_orders
    // row. If the user double-clicks Produced (or any client retries the POST)
    // we return the existing row instead of inserting a duplicate.
    if (body.floorAssignmentId) {
      const [existing] = await db.select().from(mdpProducedOrdersTable)
        .where(eq(mdpProducedOrdersTable.floorAssignmentId, Number(body.floorAssignmentId)))
        .limit(1);
      if (existing) {
        res.status(200).json(existing);
        return;
      }
    }

    const [created] = await db.insert(mdpProducedOrdersTable).values({
      productionOrderId: body.productionOrderId ? Number(body.productionOrderId) : null,
      floorAssignmentId: body.floorAssignmentId ? Number(body.floorAssignmentId) : null,
      weekLabel: body.weekLabel ?? null,
      assignedDay: body.assignedDay ?? null,
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

router.delete("/produced-orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(mdpProducedOrdersTable).where(eq(mdpProducedOrdersTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/produced-orders/:id/return-to-planning", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [produced] = await db.select().from(mdpProducedOrdersTable).where(eq(mdpProducedOrdersTable.id, id)).limit(1);
    if (!produced) { res.status(404).json({ error: "NotFound" }); return; }

    // Restore the original floor assignment if we know which one it was.
    if (produced.floorAssignmentId) {
      await db.update(mdpFloorAssignmentsTable)
        .set({ planStatus: "Planned", producedAt: null })
        .where(eq(mdpFloorAssignmentsTable.id, produced.floorAssignmentId));
    } else if (produced.productionOrderId && produced.floorId) {
      // Fallback for legacy rows without a stored floor_assignment_id: try to
      // match by (productionOrderId, floorId, plan_status='Produced'). We take
      // the most recently produced one.
      const candidates = await db.select().from(mdpFloorAssignmentsTable)
        .where(and(
          eq(mdpFloorAssignmentsTable.productionOrderId, produced.productionOrderId),
          eq(mdpFloorAssignmentsTable.floorId, produced.floorId),
          eq(mdpFloorAssignmentsTable.planStatus, "Produced"),
        ));
      const newest = candidates.sort((a, b) => (b.producedAt?.getTime() ?? 0) - (a.producedAt?.getTime() ?? 0))[0];
      if (newest) {
        await db.update(mdpFloorAssignmentsTable)
          .set({ planStatus: "Planned", producedAt: null })
          .where(eq(mdpFloorAssignmentsTable.id, newest.id));
      }
    }

    // Reset the mother production order back to the planning state so the
    // remaining assigned volume re-appears in the Planning tab list.
    if (produced.productionOrderId) {
      await db.update(mdpProductionOrdersTable).set({
        isProduced: false,
        isDelivered: false,
        isPlanned: true,
        orderStatus: "Planned",
        updatedAt: new Date(),
      }).where(eq(mdpProductionOrdersTable.id, produced.productionOrderId));
    }

    await db.delete(mdpProducedOrdersTable).where(eq(mdpProducedOrdersTable.id, id));
    res.json({ success: true });
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

// Admin endpoint: Complete data sync for all production orders and assignments
router.post("/admin/sync-all-data", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Fetch all data
    const salesOrders = await db.select().from(accountProductionOrdersTable) as Array<Record<string, any>>;
    const mdpOrders = await db.select().from(mdpProductionOrdersTable) as Array<Record<string, any>>;
    const assignments = await db.select().from(mdpFloorAssignmentsTable) as Array<Record<string, any>>;
    const accounts = await db.select().from(accountsTable) as Array<Record<string, any>>;

    // Create lookup maps
    const salesById = new Map(salesOrders.map((s: Record<string, any>) => [s.id, s]));
    const accountById = new Map(accounts.map((a: Record<string, any>) => [a.id, a]));
    const mdpBySalesId = new Map(mdpOrders.map((m: Record<string, any>) => [m.salesOrderId, m]));

    // Create product name → account mapping for matching orders to accounts
    const accountByProductName = new Map(accounts.map((a: Record<string, any>) => [
      a.productName?.toLowerCase().trim(),
      a
    ]));

    // Log what we found
    console.log(`Found: ${salesOrders.length} sales orders, ${mdpOrders.length} mdp orders, ${assignments.length} assignments, ${accounts.length} accounts`);

    // Update any MDP orders missing accountId
    // Strategy: 1) Try sales order accountId, 2) Try product name match, 3) Try company match
    let mdpUpdated = 0;
    for (const mdpOrder of mdpOrders) {
      if (!mdpOrder.accountId && mdpOrder.salesOrderId) {
        let foundAccountId: number | null = null;

        // Strategy 1: Check if sales order has accountId
        const salesOrder = salesById.get(mdpOrder.salesOrderId);
        if (salesOrder?.accountId) {
          foundAccountId = salesOrder.accountId;
        }

        // Strategy 2: Match by product name from sales order
        if (!foundAccountId && salesOrder?.productName) {
          const productKey = salesOrder.productName.toLowerCase().trim();
          const matchedAccount = accountByProductName.get(productKey);
          if (matchedAccount) {
            foundAccountId = matchedAccount.id;
          }
        }

        // Update the order if we found an account
        if (foundAccountId) {
          await db.update(mdpProductionOrdersTable).set({
            accountId: foundAccountId,
            updatedAt: new Date(),
          }).where(eq(mdpProductionOrdersTable.id, mdpOrder.id));
          mdpUpdated++;
        }
      }
    }

    res.json({
      success: true,
      message: `Complete sync done. Updated ${mdpUpdated} production orders with account IDs.`,
      stats: {
        totalSalesOrders: salesOrders.length,
        totalMdpOrders: mdpOrders.length,
        totalAssignments: assignments.length,
        updatedMdpOrders: mdpUpdated,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "InternalServerError", details: (err as Error).message });
  }
});

// Sync endpoint: enriches all production orders with account data for multi-user sync
router.post("/sync-order-accounts", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Fetch all accounts and sales orders
    const accounts = await db.select().from(accountsTable);
    const salesOrders = await db.select().from(accountProductionOrdersTable);
    const mdpOrders = await db.select().from(mdpProductionOrdersTable);
    const assignments = await db.select().from(mdpFloorAssignmentsTable);

    // Create maps for quick lookup
    const accountById = new Map(accounts.map((a: any) => [a.id, a]));
    const mdpBySalesId = new Map(mdpOrders.map((o: any) => [o.salesOrderId, o]));

    // Match unlinked assignments with account data
    let updatedCount = 0;
    for (const assignment of assignments) {
      const mdpOrder = mdpOrders.find((o: any) => o.id === assignment.productionOrderId);
      if (!mdpOrder?.accountId && mdpOrder) {
        const salesOrder = salesOrders.find((s: any) => s.id === mdpOrder.salesOrderId);
        if (salesOrder?.accountId) {
          // Update the MDP order with the account ID
          await db.update(mdpProductionOrdersTable).set({
            accountId: salesOrder.accountId,
            updatedAt: new Date(),
          }).where(eq(mdpProductionOrdersTable.id, mdpOrder.id));
          updatedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Synced ${updatedCount} production orders with account data`,
      updated: updatedCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
