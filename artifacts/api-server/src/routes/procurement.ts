import { Router } from "express";
import { db } from "@workspace/db";
import {
  vendorsTable, purchaseRequestsTable, purchaseRequestApprovalsTable,
  purchaseOrdersTable, purchaseOrderItemsTable, purchaseOrderReceiptsTable,
  vendorPerformanceTable, usersTable, notificationsTable, departmentsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray, ne, gte, lte, isNull } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────
async function getUserMap(): Promise<Map<number, any>> {
  const users = await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, department: usersTable.department }).from(usersTable);
  return new Map(users.map(u => [u.id, u]));
}

async function getVendorMap() {
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name, currency: vendorsTable.currency }).from(vendorsTable);
  return new Map(vendors.map(v => [v.id, v]));
}

function generatePoNumber(): string {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `PO-${year}-${rand}`;
}

async function notifyUsers(userIds: number[], title: string, message: string) {
  if (!userIds.length) return;
  await db.insert(notificationsTable).values(userIds.map(userId => ({
    userId, type: "system" as const, title, message, isRead: false,
  })));
}

async function getManagerIds(): Promise<number[]> {
  const managers = await db.select({ id: usersTable.id }).from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','manager','ceo')`);
  return managers.map(m => m.id);
}

async function getNpdL1ApproverIds(): Promise<number[]> {
  const users = await db.select({ id: usersTable.id, department: usersTable.department, role: usersTable.role, jobPosition: usersTable.jobPosition }).from(usersTable);
  return users
    .filter(u => {
      const dept = (u.department ?? "").toLowerCase();
      const role = (u.role ?? "").toLowerCase();
      const jp = (u.jobPosition ?? "").toLowerCase();
      const isNpd = dept.includes("npd") || dept.includes("new product");
      const isManager = ["admin", "manager", "ceo"].includes(role) || jp.includes("manager") || jp.includes("head") || jp.includes("director");
      return isNpd && isManager;
    })
    .map(u => u.id);
}

async function getProcurementL2ApproverIds(): Promise<number[]> {
  const users = await db.select({ id: usersTable.id, department: usersTable.department, role: usersTable.role, jobPosition: usersTable.jobPosition }).from(usersTable);
  return users
    .filter(u => {
      const dept = (u.department ?? "").toLowerCase();
      const role = (u.role ?? "").toLowerCase();
      const jp = (u.jobPosition ?? "").toLowerCase();
      const isProcurement = dept.includes("procurement");
      const isManagerOrOfficer = ["admin", "manager", "ceo", "procurement"].includes(role) || jp.includes("manager") || jp.includes("officer") || jp.includes("head");
      return isProcurement && isManagerOrOfficer;
    })
    .map(u => u.id);
}

async function enrichPR(pr: any, userMap: Map<number, any>) {
  const approvals = await db.select().from(purchaseRequestApprovalsTable)
    .where(eq(purchaseRequestApprovalsTable.purchaseRequestId, pr.id))
    .orderBy(asc(purchaseRequestApprovalsTable.level));
  return {
    ...pr,
    requestedBy: userMap.get(pr.requestedById) ?? null,
    approvals: approvals.map(a => ({ ...a, approver: userMap.get(a.approverId) ?? null })),
  };
}

async function enrichPO(po: any, userMap: Map<number, any>, vendorMap: Map<number, any>) {
  const [items, receipts, perf] = await Promise.all([
    db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, po.id)),
    db.select().from(purchaseOrderReceiptsTable).where(eq(purchaseOrderReceiptsTable.purchaseOrderId, po.id)),
    db.select().from(vendorPerformanceTable).where(eq(vendorPerformanceTable.purchaseOrderId, po.id)),
  ]);
  return {
    ...po,
    vendor: vendorMap.get(po.vendorId) ?? null,
    raisedBy: userMap.get(po.raisedById) ?? null,
    items,
    receipts,
    performance: perf[0] ?? null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDORS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/vendors", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { category, status, country, rating } = req.query as any;
    let query = db.select().from(vendorsTable).orderBy(asc(vendorsTable.name)) as any;
    const conditions: any[] = [];
    if (category) conditions.push(eq(vendorsTable.category, category));
    if (status) conditions.push(eq(vendorsTable.status, status));
    if (country) conditions.push(eq(vendorsTable.country, country));
    if (rating) conditions.push(eq(vendorsTable.rating, parseInt(rating)));
    if (conditions.length) query = query.where(and(...conditions));
    const vendors = await query;

    // Enrich with PO count and total spend
    const pos = await db.select({
      vendorId: purchaseOrdersTable.vendorId,
      totalAmount: purchaseOrdersTable.totalAmount,
      status: purchaseOrdersTable.status,
    }).from(purchaseOrdersTable);

    const enriched = vendors.map((v: any) => {
      const vendorPos = pos.filter((p: any) => p.vendorId === v.id);
      const activePOs = vendorPos.filter((p: any) => !["received", "closed", "cancelled"].includes(p.status)).length;
      const totalSpend = vendorPos.reduce((sum: number, p: any) => sum + (parseFloat(p.totalAmount ?? "0") || 0), 0);
      return { ...v, activePOs, totalSpend };
    });
    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/vendors", requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const [vendor] = await db.insert(vendorsTable).values({
      name: b.name, category: b.category ?? "other", contactName: b.contactName ?? "",
      contactEmail: b.contactEmail ?? "", contactPhone: b.contactPhone ?? "",
      country: b.country ?? "", address: b.address ?? "",
      paymentTerms: b.paymentTerms ?? "net30", currency: b.currency ?? "ngn",
      rating: b.rating ? parseInt(b.rating) : 3, status: b.status ?? "active", notes: b.notes ?? "",
    }).returning();
    res.status(201).json(vendor);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.get("/vendors/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
    if (!vendor) { res.status(404).json({ error: "NotFound" }); return; }

    const userMap = await getUserMap();
    const pos = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.vendorId, id)).orderBy(desc(purchaseOrdersTable.createdAt));
    const vendorMap = new Map([[id, vendor]]);
    const enrichedPos = await Promise.all(pos.map(po => enrichPO(po, userMap, vendorMap)));

    const perfRecords = await db.select().from(vendorPerformanceTable).where(eq(vendorPerformanceTable.vendorId, id));
    const avgDelivery = perfRecords.length ? perfRecords.reduce((s, r) => s + r.deliveryScore, 0) / perfRecords.length : null;
    const avgQuality = perfRecords.length ? perfRecords.reduce((s, r) => s + r.qualityScore, 0) / perfRecords.length : null;
    const avgComm = perfRecords.length ? perfRecords.reduce((s, r) => s + r.communicationScore, 0) / perfRecords.length : null;

    res.json({ ...vendor, orders: enrichedPos, performance: { avgDelivery, avgQuality, avgComm, records: perfRecords } });
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.put("/vendors/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const b = req.body;
    const [vendor] = await db.update(vendorsTable).set({
      name: b.name, category: b.category, contactName: b.contactName, contactEmail: b.contactEmail,
      contactPhone: b.contactPhone, country: b.country, address: b.address, paymentTerms: b.paymentTerms,
      currency: b.currency, rating: b.rating ? parseInt(b.rating) : undefined, status: b.status, notes: b.notes,
      updatedAt: new Date(),
    }).where(eq(vendorsTable.id, id)).returning();
    res.json(vendor);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/vendors/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.update(vendorsTable).set({ status: "inactive", updatedAt: new Date() }).where(eq(vendorsTable.id, id));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE REQUESTS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/requests/rejected-deleted", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allPrs = await db.select().from(purchaseRequestsTable).orderBy(desc(purchaseRequestsTable.updatedAt));
    const rejectedOrDeleted = allPrs.filter(pr => pr.status === "rejected" || pr.deletedAt !== null);
    const userMap = await getUserMap();
    const departments = await db.select().from(departmentsTable);
    const deptMap = new Map(departments.map((d: any) => [d.id, d]));
    const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
    const vendorNameMap = new Map(vendors.map((v: any) => [v.id, v.name]));

    const sorted = rejectedOrDeleted.sort((a: any, b: any) => {
      const aTime = (a.deletedAt ?? a.updatedAt)?.getTime() ?? 0;
      const bTime = (b.deletedAt ?? b.updatedAt)?.getTime() ?? 0;
      if (bTime !== aTime) return bTime - aTime;
      const aVendor = vendorNameMap.get(a.vendorId ?? 0) ?? "";
      const bVendor = vendorNameMap.get(b.vendorId ?? 0) ?? "";
      return aVendor.localeCompare(bVendor);
    });

    const enriched = await Promise.all(sorted.map(async (pr: any) => {
      const approvals = await db.select().from(purchaseRequestApprovalsTable)
        .where(eq(purchaseRequestApprovalsTable.purchaseRequestId, pr.id));
      const requester = userMap.get(pr.requestedById);
      const dept = pr.departmentId ? deptMap.get(pr.departmentId) : null;
      return {
        ...pr, isDeleted: pr.deletedAt !== null,
        requester: requester ? { id: requester.id, name: requester.name } : null,
        department: dept ?? null,
        vendorName: vendorNameMap.get(pr.vendorId ?? 0) ?? null,
        approvals: approvals.map((a: any) => ({ ...a, approver: userMap.get(a.approverId) ?? null })),
      };
    }));
    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.get("/requests", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { status, priority, departmentId, requestedById } = req.query as any;
    const conditions: any[] = [isNull(purchaseRequestsTable.deletedAt)];
    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (priority) conditions.push(eq(purchaseRequestsTable.priority, priority));
    if (departmentId) conditions.push(eq(purchaseRequestsTable.departmentId, parseInt(departmentId)));
    if (requestedById) conditions.push(eq(purchaseRequestsTable.requestedById, parseInt(requestedById)));

    let prs = await db.select().from(purchaseRequestsTable).where(and(...conditions)).orderBy(desc(purchaseRequestsTable.createdAt));

    const userMap = await getUserMap();
    const departments = await db.select().from(departmentsTable);
    const deptMap = new Map(departments.map((d: any) => [d.id, d]));

    const enriched = await Promise.all(prs.map(async (pr: any) => {
      const approvals = await db.select().from(purchaseRequestApprovalsTable)
        .where(eq(purchaseRequestApprovalsTable.purchaseRequestId, pr.id))
        .orderBy(asc(purchaseRequestApprovalsTable.level));
      return {
        ...pr,
        requestedBy: userMap.get(pr.requestedById) ?? null,
        department: pr.departmentId ? (deptMap.get(pr.departmentId) ?? null) : null,
        approvals: approvals.map((a: any) => ({ ...a, approver: userMap.get(a.approverId) ?? null })),
      };
    }));
    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/requests", requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const requestedById = b.requestedById ?? (req as any).user?.id;
   const lineItemsJson = b.lineItems?.length ? JSON.stringify(b.lineItems) : null;
    const [pr] = await db.insert(purchaseRequestsTable).values({
  title: b.title, description: b.description ?? "",
  requestedById, departmentId: b.departmentId ?? null, vendorId: b.vendorId ?? null,
  category: b.category ?? "other", priority: b.priority ?? "medium", status: "draft",
  estimatedAmount: b.estimatedAmount ? String(b.estimatedAmount) : null, currency: b.currency ?? "ngn",
  requiredByDate: b.requiredByDate ?? null, 
  justification: lineItemsJson ?? b.justification ?? "", 
  attachmentUrl: b.attachmentUrl ?? null,
  requiredQuantityKg: b.requiredQuantityKg ?? null,
  vendorDetailsName: b.vendorDetailsName ?? null,
  vendorDetailsAddress: b.vendorDetailsAddress ?? null,
    }).returning();
    res.status(201).json(pr);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.get("/requests/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "NotFound" }); return; }
    const userMap = await getUserMap();
    res.json(await enrichPR(pr, userMap));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.put("/requests/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!existing || !["draft", "rejected"].includes(existing.status)) {
      res.status(400).json({ error: "Cannot edit this request" }); return;
    }
    const b = req.body;
    const [pr] = await db.update(purchaseRequestsTable).set({
      title: b.title, description: b.description, category: b.category, priority: b.priority,
      estimatedAmount: b.estimatedAmount ? String(b.estimatedAmount) : null, currency: b.currency,
      requiredByDate: b.requiredByDate, justification: b.justification, vendorId: b.vendorId ?? null,
      requiredQuantityKg: b.requiredQuantityKg ?? null,
      vendorDetailsName: b.vendorDetailsName ?? null,
      vendorDetailsAddress: b.vendorDetailsAddress ?? null,
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();
    const userMap = await getUserMap();
    res.json(await enrichPR(pr, userMap));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/requests/:id/submit", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [pr] = await db.update(purchaseRequestsTable)
      .set({ status: "pending_approval", updatedAt: new Date() })
      .where(and(eq(purchaseRequestsTable.id, id), eq(purchaseRequestsTable.status, "draft")))
      .returning();
    if (!pr) { res.status(400).json({ error: "Cannot submit" }); return; }

    // Determine requester's department
    const departments = await db.select().from(departmentsTable);
    const requesterDeptRecord = pr.departmentId ? departments.find((d: any) => d.id === pr.departmentId) : null;
    const requesterDeptName = (requesterDeptRecord?.name ?? "").toLowerCase();

    const isNpdDept = requesterDeptName.includes("npd") || requesterDeptName.includes("new product");
    const isProcurementDept = requesterDeptName.includes("procurement");

    if (isNpdDept) {
      // Level 1: NPD managers
      const l1Ids = await getNpdL1ApproverIds();
      if (l1Ids.length) {
        await db.insert(purchaseRequestApprovalsTable).values(l1Ids.map(mid => ({
          purchaseRequestId: id, approverId: mid, level: 1, status: "pending" as const,
        })));
        await notifyUsers(l1Ids, "Purchase Request Pending Approval",
          `A new purchase request "${pr.title}" requires your Level 1 approval.`);
      }
    } else if (isProcurementDept) {
      // Procurement dept: skip Level 1, go straight to Level 2
      const l2Ids = await getProcurementL2ApproverIds();
      if (l2Ids.length) {
        await db.insert(purchaseRequestApprovalsTable).values(l2Ids.map(mid => ({
          purchaseRequestId: id, approverId: mid, level: 2, status: "pending" as const,
        })));
        await notifyUsers(l2Ids, "Purchase Request Pending Approval",
          `A new purchase request "${pr.title}" requires your approval.`);
      }
    } else {
      // Fallback: use Level 2 (Procurement managers)
      const l2Ids = await getProcurementL2ApproverIds();
      if (l2Ids.length) {
        await db.insert(purchaseRequestApprovalsTable).values(l2Ids.map(mid => ({
          purchaseRequestId: id, approverId: mid, level: 2, status: "pending" as const,
        })));
        await notifyUsers(l2Ids, "Purchase Request Pending Approval",
          `A new purchase request "${pr.title}" requires your approval.`);
      }
    }

    const userMap = await getUserMap();
    res.json(await enrichPR(pr, userMap));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/requests/:id/approve", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const { comment } = req.body;

    const isAdmin = userRole === "admin";

    // If admin, mark ALL pending approvals as approved
    if (isAdmin) {
      await db.update(purchaseRequestApprovalsTable).set({
        status: "approved", comment: comment ?? "Approved by Admin", decidedAt: new Date(),
      }).where(and(
        eq(purchaseRequestApprovalsTable.purchaseRequestId, id),
        eq(purchaseRequestApprovalsTable.status, "pending"),
      ));
      const [pr] = await db.update(purchaseRequestsTable)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(purchaseRequestsTable.id, id)).returning();
      await notifyUsers([pr.requestedById], "Purchase Request Approved",
        `Your purchase request "${pr.title}" has been approved by Admin.`);
      const userMap = await getUserMap();
      res.json(await enrichPR(pr, userMap));
      return;
    }

    // Mark the current approver's slot as approved
    await db.update(purchaseRequestApprovalsTable).set({
      status: "approved", comment: comment ?? "", decidedAt: new Date(),
    }).where(and(
      eq(purchaseRequestApprovalsTable.purchaseRequestId, id),
      eq(purchaseRequestApprovalsTable.approverId, userId),
      eq(purchaseRequestApprovalsTable.status, "pending"),
    ));

    // Get all approvals for this PR
    const allApprovals = await db.select().from(purchaseRequestApprovalsTable)
      .where(eq(purchaseRequestApprovalsTable.purchaseRequestId, id));

    // Determine current approver's level
    const currentApproval = allApprovals.find(a => a.approverId === userId);
    const currentLevel = currentApproval?.level ?? 1;

    // Check if all approvals at the current level are done (approved or rejected)
    const currentLevelApprovals = allApprovals.filter(a => a.level === currentLevel);
    const currentLevelApproved = currentLevelApprovals.every(a => a.status === "approved");
    const currentLevelRejected = currentLevelApprovals.some(a => a.status === "rejected");

    const [prCurrent] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));

    if (currentLevelRejected) {
      // Already handled by reject endpoint
    } else if (currentLevelApproved) {
      const hasLevel2 = allApprovals.some(a => a.level === 2);

      if (currentLevel === 1 && !hasLevel2) {
        // Level 1 approved → create Level 2 (Procurement approvers)
        const l2Ids = await getProcurementL2ApproverIds();
        if (l2Ids.length) {
          await db.insert(purchaseRequestApprovalsTable).values(l2Ids.map(mid => ({
            purchaseRequestId: id, approverId: mid, level: 2, status: "pending" as const,
          })));
          await notifyUsers(l2Ids, "Purchase Request Pending Level 2 Approval",
            `Purchase request "${prCurrent.title}" has passed Level 1 and needs your approval.`);
        }
      } else {
        // Level 2 (or only level) approved → fully approved
        const [pr] = await db.update(purchaseRequestsTable)
          .set({ status: "approved", updatedAt: new Date() })
          .where(eq(purchaseRequestsTable.id, id)).returning();
        await notifyUsers([pr.requestedById], "Purchase Request Approved",
          `Your purchase request "${pr.title}" has been fully approved.`);
      }
    }

    const userMap = await getUserMap();
    const [updatedPr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    res.json(await enrichPR(updatedPr, userMap));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/requests/:id/reject", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const userId = (req as any).user?.id;
    const { comment } = req.body;
    if (!comment) { res.status(400).json({ error: "Comment required for rejection" }); return; }

    await db.update(purchaseRequestApprovalsTable).set({
      status: "rejected", comment, decidedAt: new Date(),
    }).where(and(
      eq(purchaseRequestApprovalsTable.purchaseRequestId, id),
      eq(purchaseRequestApprovalsTable.approverId, userId),
      eq(purchaseRequestApprovalsTable.status, "pending"),
    ));

    const [pr] = await db.update(purchaseRequestsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(purchaseRequestsTable.id, id)).returning();

    await notifyUsers([pr.requestedById], "Purchase Request Rejected", `Your purchase request "${pr.title}" was rejected. Reason: ${comment}`);
    const userMap = await getUserMap();
    res.json(await enrichPR(pr, userMap));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/requests/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const userId = (req as any).user?.id;
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "NotFound" }); return; }
    if (pr.deletedAt) { res.status(400).json({ error: "Already deleted" }); return; }
    await db.update(purchaseRequestsTable).set({
      deletedAt: new Date(), deletedById: userId, updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id));
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/requests/:id/convert-to-po", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const userId = req.user?.userId ?? (req as any).user?.id ?? (req as any).user?.userId;
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr || pr.status !== "approved") { res.status(400).json({ error: "Request must be Approved" }); return; }

    const poNumber = generatePoNumber();
    // Get first available vendor if none assigned
let vendorId = pr.vendorId;
if (!vendorId) {
  const [firstVendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).limit(1);
  vendorId = firstVendor?.id ?? null;
}

if (!vendorId) {
  res.status(400).json({ error: "No vendor available. Please add a vendor first." });
  return;
}

const vendorIdNumber = vendorId;

// Parse line items from PR justification if stored as JSON
let prLineItems: any[] = [];
try {
  if (pr.justification?.startsWith("[")) {
    prLineItems = JSON.parse(pr.justification);
  }
} catch {}

const [po] = await db.insert(purchaseOrdersTable).values({
  poNumber, purchaseRequestId: id, vendorId: vendorIdNumber,
  raisedById: userId, status: "draft", totalAmount: pr.estimatedAmount, currency: pr.currency ?? "usd",
  paymentStatus: "unpaid", 
  notes: pr.title ?? "",
  deliveryDue: pr.requiredByDate ?? null,
  deliveryAddress: pr.vendorDetailsAddress ?? "",
}).returning();

// Insert line items from PR if available
if (prLineItems.length > 0) {
  await db.insert(purchaseOrderItemsTable).values(prLineItems.map((item: any) => ({
    purchaseOrderId: po.id,
    description: item.description || "",
    quantity: String(item.quantity || 1),
    unit: item.unit || "units",
    unitPrice: String(item.unitPrice || 0),
    totalPrice: String((parseFloat(item.quantity || 1) * parseFloat(item.unitPrice || 0)).toFixed(2)),
    productType: null,
    notes: "",
  })));
}

    await db.update(purchaseRequestsTable)
      .set({ status: "converted_to_po", updatedAt: new Date() })
      .where(eq(purchaseRequestsTable.id, id));

    // Update notes with item descriptions as title
    if (prLineItems.length > 0) {
      const title = prLineItems.filter((it: any) => it.description).map((it: any) => it.description).join(", ");
      if (title) {
        await db.update(purchaseOrdersTable).set({ notes: title }).where(eq(purchaseOrdersTable.id, po.id));
        po.notes = title;
      }
    }
res.status(201).json(po);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { status, vendorId, paymentStatus } = req.query as any;
    const conditions: any[] = [];
    if (status) conditions.push(eq(purchaseOrdersTable.status, status));
    if (vendorId) conditions.push(eq(purchaseOrdersTable.vendorId, parseInt(vendorId)));
    if (paymentStatus) conditions.push(eq(purchaseOrdersTable.paymentStatus, paymentStatus));

    const pos = conditions.length
      ? await db.select().from(purchaseOrdersTable).where(and(...conditions)).orderBy(desc(purchaseOrdersTable.createdAt))
      : await db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt));

    const [userMap, vendorMap] = await Promise.all([getUserMap(), getVendorMap()]);
    const enriched = await Promise.all(pos.map(po => enrichPO(po, userMap, vendorMap)));
    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const userId = req.user?.userId ?? (req as any).user?.id ?? (req as any).user?.userId;
    console.log("Creating PO with body:", JSON.stringify(b));
    console.log("userId:", userId);
    const poNumber = b.poNumber?.trim() || generatePoNumber();
    const vendorId = b.vendorId ? parseInt(b.vendorId) : undefined;
    if (!vendorId) {
      res.status(400).json({ error: "vendorId is required" });
      return;
    }
    const [po] = await db.insert(purchaseOrdersTable).values({
      poNumber, purchaseRequestId: b.purchaseRequestId ?? null,
      vendorId, raisedById: userId, status: "draft",
      totalAmount: b.totalAmount ? String(b.totalAmount) : null, currency: b.currency ?? "ngn",
      paymentStatus: "unpaid", paymentDue: b.paymentDue ?? null,
      deliveryAddress: b.deliveryAddress ?? "", deliveryDue: b.deliveryDue ?? null, notes: b.notes ?? "",
    }).returning();

    // Insert line items if provided
    if (b.items?.length) {
      await db.insert(purchaseOrderItemsTable).values(b.items.map((item: any) => ({
        purchaseOrderId: po.id, description: item.description, quantity: String(item.quantity),
        unit: item.unit ?? "units", unitPrice: String(item.unitPrice), totalPrice: String(item.totalPrice),
        productType: item.productType ?? null, notes: item.notes ?? "",
      })));
    }
    res.status(201).json(po);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.get("/orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "NotFound" }); return; }
    const [userMap, vendorMap] = await Promise.all([getUserMap(), getVendorMap()]);
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, po.vendorId));
    const vendorFullMap = new Map([[po.vendorId, vendor]]);
    res.json(await enrichPO(po, userMap, vendorFullMap));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.put("/orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [existing] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!existing || existing.status !== "draft") { res.status(400).json({ error: "Can only edit Draft POs" }); return; }
    const b = req.body;
    const [po] = await db.update(purchaseOrdersTable).set({
      vendorId: b.vendorId ? parseInt(b.vendorId) : undefined,
      totalAmount: b.totalAmount ? String(b.totalAmount) : undefined,
      currency: b.currency, paymentStatus: b.paymentStatus, paymentDue: b.paymentDue,
      deliveryAddress: b.deliveryAddress, deliveryDue: b.deliveryDue, notes: b.notes, updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, id)).returning();

    // Update items if provided
    if (b.items) {
      await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
      if (b.items.length) {
        await db.insert(purchaseOrderItemsTable).values(b.items.map((item: any) => ({
          purchaseOrderId: id, description: item.description, quantity: String(item.quantity),
          unit: item.unit ?? "units", unitPrice: String(item.unitPrice), totalPrice: String(item.totalPrice),
          productType: item.productType ?? null, notes: item.notes ?? "",
        })));
      }
    }
    res.json(po);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/orders/:id/send", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const [po] = await db.update(purchaseOrdersTable)
      .set({ status: "sent_to_vendor", updatedAt: new Date() })
      .where(eq(purchaseOrdersTable.id, id)).returning();
    res.json(po);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/orders/:id/receive", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const userId = (req as any).user?.id;
    const { quantityReceived, condition, notes } = req.body;

    const [receipt] = await db.insert(purchaseOrderReceiptsTable).values({
      purchaseOrderId: id, receivedById: userId,
      quantityReceived: quantityReceived ? String(quantityReceived) : null,
      condition: condition ?? "good", notes: notes ?? "",
    }).returning();

    const newStatus = condition === "partial" ? "partially_received" : "received";
    const [po] = await db.update(purchaseOrdersTable)
      .set({ status: newStatus as any, updatedAt: new Date() })
      .where(eq(purchaseOrdersTable.id, id)).returning();

    // Notify original requester if came from PR
    if (po.purchaseRequestId) {
      const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.purchaseRequestId));
      if (pr) await notifyUsers([pr.requestedById], "Purchase Order Received", `Your purchase order ${po.poNumber} has been marked as ${newStatus.replace(/_/g, " ")}.`);
    }
    res.json({ po, receipt });
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/orders/:id/rate-vendor", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const userId = (req as any).user?.id;
    const { deliveryScore, qualityScore, communicationScore, notes } = req.body;
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "NotFound" }); return; }

    const overall = ((deliveryScore + qualityScore + communicationScore) / 3).toFixed(2);
    const [perf] = await db.insert(vendorPerformanceTable).values({
      vendorId: po.vendorId, purchaseOrderId: id,
      deliveryScore: parseInt(deliveryScore), qualityScore: parseInt(qualityScore),
      communicationScore: parseInt(communicationScore), overallScore: overall,
      reviewedById: userId, notes: notes ?? "",
    }).returning();

    // Update vendor average rating
    const allPerf = await db.select().from(vendorPerformanceTable).where(eq(vendorPerformanceTable.vendorId, po.vendorId));
    const avgRating = Math.round(allPerf.reduce((s, r) => s + (parseFloat(String(r.overallScore ?? "3")) || 3), 0) / allPerf.length);
    await db.update(vendorsTable).set({ rating: Math.min(5, Math.max(1, avgRating)), updatedAt: new Date() }).where(eq(vendorsTable.id, po.vendorId));

    res.status(201).json(perf);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PO ITEMS
// ══════════════════════════════════════════════════════════════════════════════

router.post("/orders/:id/items", requireAuth, async (req: AuthRequest, res) => {
  try {
    const purchaseOrderId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const b = req.body;
    const [item] = await db.insert(purchaseOrderItemsTable).values({
      purchaseOrderId, description: b.description, quantity: String(b.quantity),
      unit: b.unit ?? "units", unitPrice: String(b.unitPrice),
      totalPrice: String(parseFloat(b.quantity) * parseFloat(b.unitPrice)),
      productType: b.productType ?? null, notes: b.notes ?? "",
    }).returning();
    res.status(201).json(item);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/orders/:orderId/items/:itemId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId as string);
    await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, itemId));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/analytics", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = now.toISOString().split("T")[0];

    const [allPos, allPRs, allVendors, allItems] = await Promise.all([
      db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt)),
      db.select().from(purchaseRequestsTable),
      db.select().from(vendorsTable),
      db.select().from(purchaseOrderItemsTable),
    ]);

    // Monthly spend
    const thisMonthPos = allPos.filter(po => new Date(po.createdAt) >= startOfMonth);
    const totalSpendMonth = thisMonthPos.reduce((s, po) => s + (parseFloat(String(po.totalAmount ?? 0)) || 0), 0);

    // PO status distribution
    const statusDist: Record<string, number> = {};
    allPos.forEach(po => { statusDist[po.status] = (statusDist[po.status] || 0) + 1; });

    // Top 5 vendors by spend
    const vendorSpend: Record<number, number> = {};
    allPos.forEach(po => {
      vendorSpend[po.vendorId] = (vendorSpend[po.vendorId] || 0) + (parseFloat(String(po.totalAmount ?? 0)) || 0);
    });
    const vendorMap = new Map(allVendors.map(v => [v.id, v.name]));
    const topVendors = Object.entries(vendorSpend)
      .map(([id, spend]) => ({ name: vendorMap.get(parseInt(id)) ?? "Unknown", spend }))
      .sort((a, b) => b.spend - a.spend).slice(0, 8);

    // Pending approvals
    const pendingApprovals = allPRs.filter(pr => pr.status === "pending_approval").length;

    // Overdue deliveries
    const overdueDeliveries = allPos.filter(po =>
      po.deliveryDue && po.deliveryDue < todayStr && !["received", "closed", "cancelled"].includes(po.status)
    ).length;

    // Monthly spend trend (last 12 months)
    const monthlyTrend: { month: string; spend: number; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      const monthPos = allPos.filter(po => {
        const created = new Date(po.createdAt);
        return created >= d && created <= end;
      });
      monthlyTrend.push({
        month: label,
        spend: monthPos.reduce((s, po) => s + (parseFloat(String(po.totalAmount ?? 0)) || 0), 0),
        count: monthPos.length,
      });
    }

    // Spend by category — join items → POs → vendors category
    const categorySpend: Record<string, number> = {};
    const poVendorMap = new Map(allPos.map(po => [po.id, po.vendorId]));
    const vendorCategoryMap = new Map(allVendors.map(v => [v.id, v.category]));
    allItems.forEach(item => {
      const vendorId = poVendorMap.get(item.purchaseOrderId);
      if (!vendorId) return;
      const cat = vendorCategoryMap.get(vendorId) ?? "other";
      categorySpend[cat] = (categorySpend[cat] || 0) + (parseFloat(String(item.totalPrice ?? 0)) || 0);
    });

    // ── Approval Cycle Time: avg days from PR created → approved, by department ──
    const allApprovals = await db.select().from(purchaseRequestApprovalsTable)
      .where(eq(purchaseRequestApprovalsTable.status, "approved"));
    const departments = await db.select().from(departmentsTable);
    const deptMap = new Map(departments.map(d => [d.id, d.name]));

    // Build map: prId → approved approval (any level)
    const approvalByPR = new Map<number, typeof allApprovals[0]>();
    allApprovals.forEach(a => {
      const existing = approvalByPR.get(a.purchaseRequestId);
      if (!existing || (a.decidedAt && existing.decidedAt && a.decidedAt > existing.decidedAt)) {
        approvalByPR.set(a.purchaseRequestId, a);
      }
    });

    const deptCycleSums: Record<string, { totalDays: number; count: number }> = {};
    allPRs.forEach(pr => {
      const approval = approvalByPR.get(pr.id);
      if (!approval?.decidedAt) return;
      const deptName = pr.departmentId ? (deptMap.get(pr.departmentId) ?? "Unknown") : "Unknown";
      const diffMs = new Date(approval.decidedAt).getTime() - new Date(pr.createdAt).getTime();
      const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
      if (!deptCycleSums[deptName]) deptCycleSums[deptName] = { totalDays: 0, count: 0 };
      deptCycleSums[deptName].totalDays += diffDays;
      deptCycleSums[deptName].count++;
    });
    const approvalCycleTime = Object.entries(deptCycleSums)
      .map(([dept, v]) => ({ dept, avgDays: Math.round((v.totalDays / v.count) * 10) / 10 }))
      .sort((a, b) => b.avgDays - a.avgDays);

    // ── Delivery Performance: On Time vs Late per vendor (last 6 months) ──
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const recentPos = allPos.filter(po => new Date(po.createdAt) >= sixMonthsAgo);
    const allReceipts = await db.select().from(purchaseOrderReceiptsTable);
    const receiptsByPO = new Map<number, typeof allReceipts[0][]>();
    allReceipts.forEach(r => {
      const arr = receiptsByPO.get(r.purchaseOrderId) ?? [];
      arr.push(r);
      receiptsByPO.set(r.purchaseOrderId, arr);
    });

    const vendorDelivery: Record<number, { name: string; onTime: number; late: number }> = {};
    recentPos.forEach(po => {
      if (!po.deliveryDue) return;
      const receipts = receiptsByPO.get(po.id) ?? [];
      if (receipts.length === 0) return; // not yet received — skip
      const firstReceipt = receipts.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())[0];
      const receivedAt = new Date(firstReceipt.receivedAt);
      const dueDate = new Date(po.deliveryDue);
      const isOnTime = receivedAt <= dueDate;
      if (!vendorDelivery[po.vendorId]) {
        vendorDelivery[po.vendorId] = { name: (vendorMap.get(po.vendorId) as string) ?? "Unknown", onTime: 0, late: 0 };
      }
      if (isOnTime) vendorDelivery[po.vendorId].onTime++;
      else vendorDelivery[po.vendorId].late++;
    });
    const deliveryPerformance = Object.values(vendorDelivery)
      .filter(v => v.onTime + v.late > 0)
      .sort((a, b) => (b.onTime + b.late) - (a.onTime + a.late))
      .slice(0, 8);

    res.json({
      totalSpendMonth,
      posThisMonth: thisMonthPos.length,
      pendingApprovals,
      overdueDeliveries,
      statusDistribution: Object.entries(statusDist).map(([status, count]) => ({ status, count })),
      topVendors,
      monthlyTrend,
      categorySpend: Object.entries(categorySpend).map(([category, spend]) => ({ category, spend })),
      approvalCycleTime,
      deliveryPerformance,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
