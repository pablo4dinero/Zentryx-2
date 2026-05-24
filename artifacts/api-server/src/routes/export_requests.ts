import { Router } from "express";
import { db } from "@workspace/db";
import { exportRequestsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// An admin or NPD manager can approve/deny export requests. We treat
// "admin" as universal approver, and "manager" whose department contains
// "npd" or "product" as the NPD manager.
function isApprover(role: string | null | undefined, department: string | null | undefined): boolean {
  const r = (role || "").toLowerCase();
  const d = (department || "").toLowerCase();
  if (r === "admin") return true;
  if (r === "ceo" || r === "managing_director") return true;
  if (r === "manager") {
    // Admin/CEO/Managing Director auto-approve. For "manager" we require
    // the NPD / Product Development department so other managers can't
    // unilaterally approve project exports.
    return d.includes("npd") || d.includes("product");
  }
  // Head of product development / head_of_department also count.
  if (r === "head_of_product_development") return true;
  if (r === "head_of_department" && (d.includes("npd") || d.includes("product"))) return true;
  return false;
}

// POST / — create a new export request (any authed user)
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { module, fileFormat, reason } = req.body as { module: string; fileFormat: string; reason?: string };
    if (!module || !fileFormat) { res.status(400).json({ error: "MissingFields" }); return; }

    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }

    // If the requester is themselves an approver, auto-approve so the
    // export flows through immediately without needing a second signoff.
    const selfApprover = isApprover(me.role, me.department);
    const [row] = await db.insert(exportRequestsTable).values({
      requesterId: userId,
      requesterName: me.name,
      module,
      fileFormat,
      reason: reason || null,
      status: selfApprover ? "approved" : "pending",
      reviewerId: selfApprover ? userId : null,
      reviewerName: selfApprover ? me.name : null,
      reviewedAt: selfApprover ? new Date() : null,
    }).returning();

    // Notify every potential approver of the new pending request (only
    // when this isn't a self-approval).
    if (!selfApprover) {
      const approvers = await db.select().from(usersTable);
      const targetIds = approvers
        .filter(u => isApprover(u.role, u.department))
        .map(u => u.id);
      if (targetIds.length > 0) {
        await db.insert(notificationsTable).values(targetIds.map(id => ({
          userId: id,
          type: "update" as const,
          title: "Export approval requested",
          message: `${me.name} requested approval to export ${module} data as ${fileFormat.toUpperCase()}.`,
          isRead: false,
        })));
      }
    }

    res.status(201).json(row);
  } catch (err) {
    console.error("[export-requests] create failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// GET /me/latest?module=... — the requester's latest request for a module
router.get("/me/latest", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const module = String(req.query.module || "");
    if (!module) { res.status(400).json({ error: "MissingModule" }); return; }

    const [row] = await db.select().from(exportRequestsTable)
      .where(and(eq(exportRequestsTable.requesterId, userId), eq(exportRequestsTable.module, module)))
      .orderBy(desc(exportRequestsTable.createdAt))
      .limit(1);
    res.json(row || null);
  } catch (err) {
    console.error("[export-requests] me/latest failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /:id/fulfill — caller marks their own approved request as fulfilled
// once the file has been downloaded. Single-use approvals.
router.post("/:id/fulfill", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId = req.user!.userId;
    const [row] = await db.select().from(exportRequestsTable).where(eq(exportRequestsTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "NotFound" }); return; }
    if (row.requesterId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (row.status !== "approved") { res.status(400).json({ error: "NotApproved" }); return; }
    const [updated] = await db.update(exportRequestsTable)
      .set({ status: "fulfilled" })
      .where(eq(exportRequestsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[export-requests] fulfill failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// GET /pending — list pending requests (approver only)
router.get("/pending", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me || !isApprover(me.role, me.department)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db.select().from(exportRequestsTable)
      .where(eq(exportRequestsTable.status, "pending"))
      .orderBy(desc(exportRequestsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("[export-requests] pending failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /:id/approve — approver only
router.post("/:id/approve", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId = req.user!.userId;
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me || !isApprover(me.role, me.department)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [row] = await db.select().from(exportRequestsTable).where(eq(exportRequestsTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "NotFound" }); return; }
    if (row.status !== "pending") { res.status(400).json({ error: "AlreadyReviewed" }); return; }

    const [updated] = await db.update(exportRequestsTable).set({
      status: "approved",
      reviewerId: userId,
      reviewerName: me.name,
      reviewedAt: new Date(),
    }).where(eq(exportRequestsTable.id, id)).returning();

    await db.insert(notificationsTable).values({
      userId: row.requesterId,
      type: "update",
      title: "Export approved",
      message: `${me.name} approved your ${row.fileFormat.toUpperCase()} export of ${row.module}. Open the module to download.`,
      isRead: false,
    });

    res.json(updated);
  } catch (err) {
    console.error("[export-requests] approve failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /:id/deny — approver only
router.post("/:id/deny", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId = req.user!.userId;
    const denyReason = (req.body as any)?.reason as string | undefined;
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me || !isApprover(me.role, me.department)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [row] = await db.select().from(exportRequestsTable).where(eq(exportRequestsTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "NotFound" }); return; }
    if (row.status !== "pending") { res.status(400).json({ error: "AlreadyReviewed" }); return; }

    const [updated] = await db.update(exportRequestsTable).set({
      status: "denied",
      reviewerId: userId,
      reviewerName: me.name,
      reviewedAt: new Date(),
      denyReason: denyReason || null,
    }).where(eq(exportRequestsTable.id, id)).returning();

    await db.insert(notificationsTable).values({
      userId: row.requesterId,
      type: "update",
      title: "Export denied",
      message: `${me.name} denied your ${row.fileFormat.toUpperCase()} export of ${row.module}.${denyReason ? ` Reason: ${denyReason}` : ""}`,
      isRead: false,
    });

    res.json(updated);
  } catch (err) {
    console.error("[export-requests] deny failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// Suppress unused import warning for `or` / `inArray` if they're not used.
void or; void inArray;

export default router;
