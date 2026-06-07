import express, { Router } from "express";
import { db } from "@workspace/db";
import {
  mdpCustomerProductsTable,
  mdpProductionOrdersTable,
  mdpProductionFloorsTable,
  mdpFloorAssignmentsTable,
  mdpProducedOrdersTable,
  mdpFloorDayStatusesTable,
  mdpProductSwitchDowntimesTable,
  mdpMonthlyOrdersTable,
  accountProductionOrdersTable,
  accountsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, inArray, gte, lte, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { callModel, SONNET_MODEL } from "../oracle/claude";
import { runAssistedPlanning, type ExistingCellUsage } from "../lib/ai-planner";
import { broadcastDataChange } from "../lib/realtime";
import { sanitize } from "../lib/sanitize";

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
      accountName: sanitize(body.accountName),
      company: sanitize(body.company),
      productType: sanitize(body.productType),
      urgency: body.urgency ?? "normal",
      priority: body.priority ?? "medium",
      volume: body.volume !== undefined ? Number(body.volume) : 0,
      accountManager: sanitize(body.accountManager) ?? null,
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
      accountName: sanitize(body.accountName),
      company: sanitize(body.company),
      productType: sanitize(body.productType),
      urgency: body.urgency,
      priority: body.priority,
      volume: body.volume !== undefined ? Number(body.volume) : undefined,
      accountManager: sanitize(body.accountManager),
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
    const limit  = Math.min(parseInt(String(req.query.limit  ?? 1000)), 1000);
    const offset = Math.max(parseInt(String(req.query.offset ?? 0)),    0);
    const salesOrders = await db.select().from(accountProductionOrdersTable)
      .orderBy(desc(accountProductionOrdersTable.createdAt))
      .limit(limit)
      .offset(offset) as Array<Record<string, any>>;
    const salesIds = salesOrders.map((order: Record<string, any>) => order.id).filter((id): id is number => typeof id === "number");
    const existingMdpRows = salesIds.length
      ? await db.select().from(mdpProductionOrdersTable).where(inArray(mdpProductionOrdersTable.salesOrderId, salesIds)) as Array<Record<string, any>>
      : [];

    const mdpBySalesId = new Map<number, Record<string, any>>(existingMdpRows.map((row: Record<string, any>) => [row.salesOrderId, row]));
    const missingInserts = salesOrders
      .filter((order: Record<string, any>) => !mdpBySalesId.has(order.id as number))
      .map((order: Record<string, any>) => ({
        salesOrderId: order.id,
        accountId: order.accountId,
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

    const merged = salesOrders.map((order: Record<string, any>) => {
      const mdpRow = mdpBySalesId.get(order.id as number) || {};
      return {
        ...order,
        ...mdpRow,
        // Preserve accountId from salesOrder if mdpRow doesn't have it (for legacy rows)
        accountId: mdpRow.accountId || order.accountId,
      };
    });

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

router.post("/production-floors", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
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
      salesOrder: accountProductionOrdersTable,
      account: accountsTable,
    }).from(mdpFloorAssignmentsTable)
      .leftJoin(mdpProductionFloorsTable, eq(mdpFloorAssignmentsTable.floorId, mdpProductionFloorsTable.id))
      .leftJoin(mdpProductionOrdersTable, eq(mdpFloorAssignmentsTable.productionOrderId, mdpProductionOrdersTable.id))
      .leftJoin(accountProductionOrdersTable, eq(mdpProductionOrdersTable.salesOrderId, accountProductionOrdersTable.id))
      .leftJoin(accountsTable, eq(accountProductionOrdersTable.accountId, accountsTable.id));

    const limit  = Math.min(parseInt(String(req.query.limit  ?? 2000)), 2000);
    const offset = Math.max(parseInt(String(req.query.offset ?? 0)),    0);

    const query = weekLabel
      ? baseQuery.where(eq(mdpFloorAssignmentsTable.weekLabel, weekLabel))
      : baseQuery;

    const assignments = await query
      .orderBy(desc(mdpFloorAssignmentsTable.assignedAt))
      .limit(limit)
      .offset(offset) as Array<Record<string, any>>;

    // Enrich with company, productName, productType from the joined account
    const enriched = assignments.map((a: Record<string, any>) => {
      if (!a.order) return a;
      const account = a.account;
      const salesOrder = a.salesOrder;
      return {
        assignment: a.assignment,
        floor: a.floor,
        order: {
          ...a.order,
          productName: account?.productName || salesOrder?.productName || a.order.productName,
          productType: account?.productType || salesOrder?.productType || a.order.productType,
          company: account?.company || a.order.accountName || "",
          accountName: account?.company || a.order.accountName || "",
        }
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ── Assisted Planning — server-side ──────────────────────────────────────────
// Runs the full planning algorithm on the server, saves all placements in a
// single batch, and returns the summary. No client-side computation needed.

// Week-level lock: prevents two users from running planning on the same
// week simultaneously, which would cause corrupted/doubled assignments.
const planningInProgress = new Set<string>();

router.post("/assisted-planning", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      weekLabel, workingDays, workingDates: workingDatesRaw,
      includeNightShift, includeSaturday,
      plannerOrders, existingUsageRaw, floorDayStatuses,
    } = req.body as {
      weekLabel: string;
      workingDays: string[];
      workingDates: string[];
      includeNightShift: boolean;
      includeSaturday: boolean;
      plannerOrders: any[];
      existingUsageRaw: Record<string, { minutesUsed: number; productTypes: string[] }>;
      floorDayStatuses: Record<string, string>;
    };

    if (!weekLabel || !workingDays?.length || !plannerOrders) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Week-level concurrency lock
    if (planningInProgress.has(weekLabel)) {
      res.status(409).json({
        error: "PlanningInProgress",
        message: "Another user is already running Assisted Planning for this week. Please wait a moment and try again.",
      });
      return;
    }
    planningInProgress.add(weekLabel);

    // Fetch floors and blend speeds from DB
    const floors = await db.select().from(mdpProductionFloorsTable);
    const blendSpeeds = [
      { id: "fast",   label: "Fast",   timeTakenMinutes: 40 },
      { id: "medium", label: "Medium", timeTakenMinutes: 60 },
      { id: "slow",   label: "Slow",   timeTakenMinutes: 90 },
    ];

    // Rebuild existingUsage Map from serialised form
    const existingUsage = new Map<string, ExistingCellUsage>();
    for (const [key, val] of Object.entries(existingUsageRaw ?? {})) {
      existingUsage.set(key, {
        minutesUsed: val.minutesUsed,
        productTypes: new Set(val.productTypes),
      });
    }

    const workingDates = (workingDatesRaw ?? []).map((d: string) => new Date(d));

    // Delete all existing assignments for this week before running
    const existing = await db.select({ id: mdpFloorAssignmentsTable.id })
      .from(mdpFloorAssignmentsTable)
      .where(eq(mdpFloorAssignmentsTable.weekLabel, weekLabel));
    if (existing.length > 0) {
      const ids = existing.map(e => e.id);
      await db.delete(mdpProductSwitchDowntimesTable).where(inArray(mdpProductSwitchDowntimesTable.floorAssignmentId, ids));
      await db.delete(mdpFloorAssignmentsTable).where(inArray(mdpFloorAssignmentsTable.id, ids));
    }

    const result = runAssistedPlanning({
      floors: floors.map(f => ({
        id: f.id,
        floorName: f.floorName,
        blendCategory: String(f.blendCategory ?? ""),
        maxCapacityKg: f.maxCapacityKg ?? 0,
        allowedProductTypes: f.allowedProductTypes ?? [],
      })),
      orders: plannerOrders,
      blendSpeeds,
      workingDays,
      workingDates,
      includeNightShift: !!includeNightShift,
      existingUsage,
      isFloorDayBlocked: (floorId, day) => {
        const key = `${floorId}|${day}`;
        return floorDayStatuses?.[key] !== "Running" && floorDayStatuses?.[key] !== undefined;
      },
      today: new Date(),
    });

    // Batch insert all placements
    if (result.placements.length > 0) {
      await db.insert(mdpFloorAssignmentsTable).values(
        result.placements.map(p => ({
          floorId: p.floorId,
          productionOrderId: p.productionOrderId,
          weekLabel,
          assignedDay: p.assignedDay,
          planStatus: "Planned",
          assignedVolume: String(p.assignedVolume),
        }))
      );
    }

    planningInProgress.delete(weekLabel);
    broadcastDataChange("floor-assignments", { weekLabel }, req.user?.userId);
    broadcastDataChange("production-orders", {}, req.user?.userId);
    res.json({ summary: result.summary, placementCount: result.placements.length });
  } catch (err) {
    planningInProgress.delete(weekLabel); // always release lock even on error
    console.error("[assisted-planning]", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/floor-assignments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const floorId = Number(body.floorId);
    const weekLabel = String(body.weekLabel ?? "");
    const assignedDay = String(body.assignedDay ?? "");
    const productionOrderId = Number(body.productionOrderId);
    const assignedVolume = body.assignedVolume != null ? Number(body.assignedVolume) : null;

    // Optimistic locking: verify the order's total assigned volume won't
    // exceed its mother volume when this assignment is added.
    // Prevents two planners simultaneously over-assigning the same order.
    if (assignedVolume && assignedVolume > 0) {
      const [salesOrder] = await db
        .select({ volume: accountProductionOrdersTable.volume })
        .from(mdpProductionOrdersTable)
        .innerJoin(accountProductionOrdersTable, eq(mdpProductionOrdersTable.salesOrderId, accountProductionOrdersTable.id))
        .where(eq(mdpProductionOrdersTable.id, productionOrderId))
        .limit(1);

      if (salesOrder?.volume) {
        const motherVolume = Number(salesOrder.volume);
        const alreadyAssigned = await db
          .select({ vol: mdpFloorAssignmentsTable.assignedVolume })
          .from(mdpFloorAssignmentsTable)
          .where(and(
            eq(mdpFloorAssignmentsTable.productionOrderId, productionOrderId),
            eq(mdpFloorAssignmentsTable.weekLabel, weekLabel),
          ));
        const totalAssigned = alreadyAssigned.reduce((sum, r) => sum + Number(r.vol ?? 0), 0);
        if (totalAssigned + assignedVolume > motherVolume * 1.01) { // 1% tolerance for rounding
          res.status(409).json({
            error: "Conflict",
            message: "This order was already fully assigned by another user. Please refresh and try again.",
          });
          return;
        }
      }
    }

    const [created] = await db.insert(mdpFloorAssignmentsTable).values({
      floorId,
      productionOrderId,
      weekLabel,
      assignedDay,
      planStatus: body.planStatus ?? "Planned",
      assignedVolume: assignedVolume != null ? String(assignedVolume) : null,
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

    // Push cache-invalidation to all other connected users immediately
    broadcastDataChange("floor-assignments", { weekLabel }, req.user?.userId);
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

router.post("/floor-assignments/batch-delete", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as { ids: number[] };
    const ids = body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids array required and non-empty" });
      return;
    }

    // Delete floor assignments FIRST (primary operation)
    await db.delete(mdpFloorAssignmentsTable).where(inArray(mdpFloorAssignmentsTable.id, ids));

    // Delete dependent product switch downtimes ASYNCHRONOUSLY (non-blocking)
    // Don't wait for this - respond immediately so UI is responsive
    db.delete(mdpProductSwitchDowntimesTable)
      .where(inArray(mdpProductSwitchDowntimesTable.afterAssignmentId, ids))
      .catch(err => console.error("Background cleanup error:", err));

    // Broadcast ASYNCHRONOUSLY (non-blocking)
    // Fire-and-forget: don't wait for this
    broadcastDataChange("floor-assignments", {}, req.user?.userId);

    // Respond immediately while cleanup happens in background
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/floor-assignments/cleanup-orphaned", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Clean up orphaned product switch downtime records (references deleted assignments)
    const orphaned = await db.select({ id: mdpProductSwitchDowntimesTable.id })
      .from(mdpProductSwitchDowntimesTable)
      .leftJoin(mdpFloorAssignmentsTable, eq(mdpFloorAssignmentsTable.id, mdpProductSwitchDowntimesTable.afterAssignmentId))
      .where(eq(mdpFloorAssignmentsTable.id, null));

    const orphanedIds = orphaned.map((row: any) => row.id);
    if (orphanedIds.length > 0) {
      await db.delete(mdpProductSwitchDowntimesTable).where(inArray(mdpProductSwitchDowntimesTable.id, orphanedIds));
    }

    res.json({ success: true, cleaned: orphanedIds.length });
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

// ──────────────────────────────────────────────────────
// Monthly Orders Endpoints
// ──────────────────────────────────────────────────────

router.get("/monthly-orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const month = req.query.month as string | undefined;
    let query = db.select().from(mdpMonthlyOrdersTable);
    if (month) {
      query = query.where(eq(mdpMonthlyOrdersTable.month, month));
    }
    const rows = await query.orderBy(mdpMonthlyOrdersTable.accountId, mdpMonthlyOrdersTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/monthly-orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as any;
    const [created] = await db.insert(mdpMonthlyOrdersTable).values({
      month: body.month,
      accountId: body.accountId,
      customerName: body.customerName || "",
      productDescription: body.productDescription || "",
      volumeKg: body.volumeKg,
      dateOrdered: body.dateOrdered,
      expectedDeliveryDate: body.expectedDeliveryDate,
      productionStatus: body.productionStatus || "Pending",
      distributionType: body.distributionType || "Pick Up",
      packingStatus: body.packingStatus || "Not Packed",
      deliveryStatus: body.deliveryStatus || "No",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/monthly-orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as any;
    const [updated] = await db.update(mdpMonthlyOrdersTable).set({
      customerName: body.customerName,
      productDescription: body.productDescription,
      volumeKg: body.volumeKg,
      dateOrdered: body.dateOrdered,
      expectedDeliveryDate: body.expectedDeliveryDate,
      productionStatus: body.productionStatus,
      distributionType: body.distributionType,
      packingStatus: body.packingStatus,
      deliveryStatus: body.deliveryStatus,
      updatedAt: new Date(),
    }).where(eq(mdpMonthlyOrdersTable.id, id)).returning();
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

router.delete("/monthly-orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(mdpMonthlyOrdersTable).where(eq(mdpMonthlyOrdersTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "NotFound" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

interface ParsedDay {
  dayName: string;
  date: string;
  isWeekend: boolean;
  floors: { floorName: string; products: { name: string; volume: number; detectedType?: string }[] }[];
}

interface FloorDefinition {
  id: number;
  floorName: string;
  aliases: string[];
  maxCapacityKg: number;
}

// In-memory storage for custom product types (can be persisted to DB later)
interface CustomProductType {
  id: string;
  name: string;
  keywords: string[];
  createdAt: Date;
}

const customProductTypes: Map<string, CustomProductType> = new Map();

// Smart product type detection using database matching and keyword analysis
// Updated: Matches by exact DB lookup, fuzzy match, then keyword analysis
function detectProductType(productName: string, productOrders: any[]): string {
  const cleanName = (productName || "").toLowerCase().trim();
  if (!cleanName) return "Unknown";

  // Step 1: Use keyword analysis FIRST (highest priority for accuracy)
  // Note: More specific keywords must come first to avoid false matches
  const keywordMap: Record<string, string[]> = {
    "Seasoning": ["fmn", "mimee", "chicken", "beef", "tomato", "seas", "qsr", "jollof"],
    "Breading": ["breading"],
    "Bread Premix": ["bread", "bun"],
    "Dough Premix": ["dough"],
    "Savoury Flavour": ["chicken flavour", "beef flavour", "concentrate", "tomato flavour", "fish flavour", "goat flavour", "stockfish flavour"],
    "Sweet Flavour": ["chocolate flavour", "vanilla flavour", "strawberry", "caramel"],
    "Dairy Premix": ["gelato", "ice cream", "dairy", "milk", "cream", "cheese", "butter", "strawberry", "chocolate"],
    "Snack Dusting": ["dusting", "cheese"],
    "Marinade": ["marinade"],
    "Spice Mix": ["spice"],
    "Pasta Sauce": ["sauce", "pasta", "marinara", "pesto", "carbonara"],
    "Unknown": []
  };

  // Check custom product types first (highest priority)
  for (const customType of customProductTypes.values()) {
    if (customType.keywords.some(keyword => cleanName.includes(keyword))) {
      return customType.name;
    }
  }

  // Check built-in keyword map
  for (const [type, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(keyword => cleanName.includes(keyword))) {
      return type;
    }
  }

  // Step 2: Try exact match with database products (fallback only)
  const exactMatch = productOrders.find((order: any) =>
    order.productName?.toLowerCase() === cleanName
  );
  if (exactMatch?.productType) return exactMatch.productType;

  // Step 3: Try fuzzy match (contains) with database products (fallback only)
  const fuzzyMatch = productOrders.find((order: any) =>
    cleanName.includes(order.productName?.toLowerCase() || "") ||
    order.productName?.toLowerCase().includes(cleanName)
  );
  if (fuzzyMatch?.productType) return fuzzyMatch.productType;

  // Step 4: Default to Unknown if no match found
  return "Unknown";
}

// Determine which floor a product should be assigned to based on type and volume
function assignFloor(productType: string, volumeKg: number): string {
  const type = (productType || "").toLowerCase();

  // Floor 3: Dairy Premix, Sweet Flavours, Snack Dusting, Dough Premix, Bread Premix
  if (
    type.includes("gelato") ||
    type.includes("sweet") ||
    type.includes("dairy") ||
    type.includes("snack dusting") ||
    type.includes("dough premix") ||
    type.includes("bread premix")
  ) {
    return "Floor 3";
  }

  // Floor 2: Any product ≤ 400kg
  if (volumeKg <= 400) {
    return "Floor 2";
  }

  // Floor 1: Default for larger products (Seasoning, Pasta Sauce, Breading, etc.)
  return "Floor 1";
}

// Default floor definitions (can be customized per deployment)
const DEFAULT_FLOORS: FloorDefinition[] = [
  {
    id: 1,
    floorName: "Floor 1",
    aliases: ["MAIN PRODUCTION FLOOR", "MAIN PRODUCTION", "MAIN LINE", "PRODUCTION FLOOR"],
    maxCapacityKg: 20900,
  },
  {
    id: 2,
    floorName: "Floor 2",
    aliases: ["SECOND LINE", "2ND LINE", "SECOND FLOOR"],
    maxCapacityKg: 400,
  },
  {
    id: 3,
    floorName: "Floor 3",
    aliases: ["NEW PRODUCTION FLOOR", "NEW PRODUCTION", "NEW FLOOR", "NEW LINE"],
    maxCapacityKg: 7000,
  },
];

router.get("/floor-definitions", requireAuth, async (req: AuthRequest, res) => {
  try {
    res.json(DEFAULT_FLOORS);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/parse-plan-document", requireAuth, express.json({ limit: "15mb" }), async (req: AuthRequest, res) => {
  try {
    const { fileData, fileName } = req.body as { fileData: string; fileName: string };
    if (!fileData || !fileName) {
      res.status(400).json({ error: "Missing fileData or fileName" });
      return;
    }

    const buffer = Buffer.from(fileData, "base64");
    let extractedText = "";

    if (fileName.endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch (docxErr) {
        console.error("DOCX parse error:", docxErr);
        throw new Error("Failed to parse DOCX document");
      }
    } else if (fileName.endsWith(".pdf")) {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const result = await pdfParse(buffer);
        extractedText = result.text;
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        throw new Error("Failed to parse PDF document");
      }
    } else {
      res.status(400).json({ error: "Unsupported file format. Use .docx or .pdf" });
      return;
    }

    console.log("Extracted text length:", extractedText.length);
    console.log("First 1000 chars:", extractedText.substring(0, 1000));

    // Fetch production orders to get product types for floor assignment
    const productOrders = await db.select().from(mdpProductionOrdersTable);

    let days = parseProductionPlan(extractedText, DEFAULT_FLOORS);

    // Reassign products to correct floors based on product type and volume
    days = days.map(day => ({
      ...day,
      floors: day.floors.map(floor => ({
        ...floor,
        products: floor.products.map(product => {
          // Smart product type detection
          let productType = detectProductType(product.name, productOrders);
          const correctFloor = assignFloor(productType, product.volume);
          return { ...product, assignedFloor: correctFloor, detectedType: productType };
        })
      })),
    }));

    // Consolidate products by their correct floors
    days = days.map(day => {
      const floorMap = new Map<string, { floorName: string; products: any[] }>();
      day.floors.forEach(floor => {
        floor.products.forEach(product => {
          const floorName = product.assignedFloor;
          if (!floorMap.has(floorName)) {
            floorMap.set(floorName, { floorName, products: [] });
          }
          floorMap.get(floorName)!.products.push(product);
        });
      });
      return {
        ...day,
        floors: Array.from(floorMap.values())
      };
    });

    console.log("Parsed days:", days.length);
    days.forEach((day: any, i: number) => {
      console.log(`Day ${i}: ${day.dayName}, Floors: ${day.floors.map((f: any) => f.floorName + " (" + f.products.length + " products)").join(", ")}`);
    });
    res.json({ days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to parse document" });
  }
});

function parseProductionPlan(text: string, floors: FloorDefinition[]): ParsedDay[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const days: ParsedDay[] = [];

  const dayPattern = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i;
  const volumePattern = /^(\d+(?:[.,]\d+)?)\s*(ton|tons|kg|kilograms?)\s*$/i;

  let currentDay: ParsedDay | null = null;
  let currentFloor: string = "";
  let pendingProducts: string[] = [];
  let pendingFloorLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header and status lines
    if (/^(PRODUCTION DAYS|PRODUCTS DESCRIPTION|REQUIRED QUANTITIES|ORDER STATUS|NEW ORDER)$/i.test(line)) {
      continue;
    }

    // Check for day pattern
    const dayMatch = line.match(dayPattern);
    if (dayMatch) {
      if (currentDay) days.push(currentDay);
      const dayName = dayMatch[1].toUpperCase();
      const date = dayMatch[2];
      const isWeekend = dayName === "SATURDAY" || dayName === "SUNDAY";
      currentDay = { dayName, date, isWeekend, floors: [] };
      currentFloor = "";
      pendingProducts = [];
      pendingFloorLines = [];
      continue;
    }

    // Accumulate potential floor name lines and try to match
    pendingFloorLines.push(line);
    const combinedFloor = pendingFloorLines.join(" ").toUpperCase();

    // Check for floor pattern - match COMPLETE aliases only
    let foundFloor: FloorDefinition | null = null;
    let matchedAlias = "";

    for (const floor of floors) {
      for (const alias of floor.aliases) {
        const aliasUpper = alias.toUpperCase();
        // Only match if the combined text EQUALS or ENDS WITH the alias (for word boundaries)
        if ((combinedFloor === aliasUpper || combinedFloor.endsWith(aliasUpper)) && alias.length > matchedAlias.length) {
          foundFloor = floor;
          matchedAlias = alias;
        }
      }
    }

    if (foundFloor) {
      currentFloor = foundFloor.floorName;
      pendingProducts = [];
      pendingFloorLines = [];
      continue;
    }

    // If accumulated lines don't look like a floor after several attempts, treat first line as product
    if (pendingFloorLines.length > 3) {
      const unmatched = pendingFloorLines.shift()!;
      if (unmatched.length > 2 && !unmatched.toUpperCase().includes("FLOOR") && !unmatched.toUpperCase().includes("PRODUCTION")) {
        pendingProducts.push(unmatched);
      }
    }

    // Check if line is a volume
    const volumeMatch = line.match(volumePattern);
    if (volumeMatch) {
      pendingFloorLines = [];
      let volume = parseFloat(volumeMatch[1].replace(",", "."));
      const unit = volumeMatch[2].toLowerCase();
      if (unit.includes("ton")) volume *= 1000;

      // Match with pending product
      if (pendingProducts.length > 0 && currentDay && currentFloor) {
        const productName = pendingProducts.shift()!;
        let floor = currentDay.floors.find((f) => f.floorName === currentFloor);
        if (!floor) {
          floor = { floorName: currentFloor, products: [] };
          currentDay.floors.push(floor);
        }
        floor.products.push({ name: productName, volume });
      }
      continue;
    }

    // Otherwise, treat as product name
    if (!foundFloor && line.length > 2) {
      pendingFloorLines = [];
      pendingProducts.push(line);
    }
  }

  if (currentDay) days.push(currentDay);

  return days.filter((d) => d.floors.some((f) => f.products.length > 0));
}

router.post("/strategy-insight", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { uploadedSummary, zentryxSummary, uploadedTotal, zentryxTotal, weekLabel } = req.body as {
      uploadedSummary: string;
      zentryxSummary: string;
      uploadedTotal: number;
      zentryxTotal: number;
      weekLabel: string;
    };

    if (
      uploadedSummary === undefined ||
      zentryxSummary === undefined ||
      uploadedTotal === undefined ||
      zentryxTotal === undefined ||
      !weekLabel
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const systemPrompt = `You are a production efficiency analyst. Given two weekly production plans, identify which is more efficient for total KG output with less downtime. Be specific: cite floors, product switches, and KG differences. Respond in 2-3 sentences maximum.`;

    const userPrompt = `Week: ${weekLabel}

Uploaded Plan:
Total Output: ${uploadedTotal.toLocaleString()} KG
Details: ${uploadedSummary}

Zentryx Plan:
Total Output: ${zentryxTotal.toLocaleString()} KG
Details: ${zentryxSummary}

Which plan is more efficient and why?`;

    const insight = await callModel(SONNET_MODEL, systemPrompt, userPrompt, 300);
    res.json({ insight });
  } catch (err) {
    console.error("Strategy insight error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `AI insight failed: ${errorMsg}` });
  }
});

router.get("/product-types", requireAuth, async (req: AuthRequest, res) => {
  try {
    const types = Array.from(customProductTypes.values());
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/product-types", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, keywords } = req.body as { name: string; keywords: string[] };
    if (!name || !Array.isArray(keywords)) {
      res.status(400).json({ error: "Missing name or keywords" });
      return;
    }

    const id = `custom-${Date.now()}`;
    const customType: CustomProductType = {
      id,
      name: name.trim(),
      keywords: keywords.map((k: string) => k.toLowerCase().trim()).filter((k: string) => k.length > 0),
      createdAt: new Date(),
    };

    customProductTypes.set(id, customType);
    res.status(201).json(customType);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/product-types/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, keywords } = req.body as { name?: string; keywords?: string[] };

    const existing = customProductTypes.get(id);
    if (!existing) {
      res.status(404).json({ error: "NotFound" });
      return;
    }

    if (name) existing.name = name.trim();
    if (keywords) existing.keywords = keywords.map((k: string) => k.toLowerCase().trim()).filter((k: string) => k.length > 0);

    res.json(existing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/product-types/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const deleted = customProductTypes.delete(id);
    if (!deleted) {
      res.status(404).json({ error: "NotFound" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;

