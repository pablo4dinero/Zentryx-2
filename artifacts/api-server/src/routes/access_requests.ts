import { Router } from "express";
import { requireAuth, AuthRequest, signToken } from "../lib/auth";
import { getPendingRequests, approveRequest, denyRequest, getRequest } from "../lib/access-requests";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function isPrivileged(role: string): boolean {
  return (role || "").toLowerCase() === "admin";
}

// ─── List pending requests (admin poll) ──────────────────────────────────────
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!actor || !isPrivileged(actor.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json(getPendingRequests().map(r => ({
      id: r.id, email: r.email, name: r.name,
      requestedAt: r.requestedAt,
    })));
  } catch (err) {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Approve request ──────────────────────────────────────────────────────────
router.post("/:id/allow", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!actor || !isPrivileged(actor.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const request = getRequest(req.params.id);
    if (!request) { res.status(404).json({ error: "NotFound", message: "Request not found or expired" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, request.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "UserNotFound" }); return; }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    approveRequest(req.params.id, token);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ─── Deny request ─────────────────────────────────────────────────────────────
router.post("/:id/deny", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!actor || !isPrivileged(actor.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const ok = denyRequest(req.params.id);
    if (!ok) { res.status(404).json({ error: "NotFound" }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
