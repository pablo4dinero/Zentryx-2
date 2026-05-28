import { Router } from "express";
import { db } from "@workspace/db";
import { customRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();
router.use(requireAuth);

// /admin is never grantable to a custom role (decision: admin stays
// built-in only). We strip it defensively from any incoming allow-list.
function sanitisePaths(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(
    input
      .filter((p): p is string => typeof p === "string")
      .map(p => p.trim())
      .filter(p => p.startsWith("/") && p !== "/admin"),
  )];
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// GET / — list all custom roles. Any authed user can read this (the
// frontend needs it to resolve role labels + the current user's module
// access). No sensitive data here.
router.get("/", async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(customRolesTable).orderBy(customRolesTable.label);
    res.json(rows);
  } catch (err) {
    console.error("[custom-roles] list failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST / — create a custom role (admin only).
router.post("/", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const { label, allowedPaths } = req.body as { label?: string; allowedPaths?: unknown };
    if (!label?.trim()) { res.status(400).json({ error: "BadRequest", message: "Role name required" }); return; }
    const value = slugify(label);
    if (!value) { res.status(400).json({ error: "BadRequest", message: "Role name must contain letters or numbers" }); return; }

    const existing = await db.select().from(customRolesTable).where(eq(customRolesTable.value, value)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "Conflict", message: "A role with that name already exists" }); return; }

    const [created] = await db.insert(customRolesTable).values({
      value,
      label: label.trim(),
      allowedPaths: sanitisePaths(allowedPaths),
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("[custom-roles] create failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// PATCH /:value — update a custom role's label and/or module access (admin only).
router.patch("/:value", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const value = String(req.params.value);
    const { label, allowedPaths } = req.body as { label?: string; allowedPaths?: unknown };
    const set: Record<string, any> = { updatedAt: new Date() };
    if (typeof label === "string" && label.trim()) set.label = label.trim();
    if (allowedPaths !== undefined) set.allowedPaths = sanitisePaths(allowedPaths);
    const [updated] = await db.update(customRolesTable).set(set).where(eq(customRolesTable.value, value)).returning();
    if (!updated) { res.status(404).json({ error: "NotFound" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[custom-roles] update failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// PUT /:value — upsert label and/or module access for ANY role (admin
// only). Unlike POST (which mints a brand-new custom role from a label)
// this targets an explicit role value, so it's how the Role Editor
// configures BUILT-IN roles too: it creates the row on first save and
// updates it thereafter.
//   • Renaming a role only changes its display label — the `value`
//     identifier that all logic keys off never changes.
//   • Omitting allowedPaths leaves the stored module access untouched
//     (a label-only rename), so it never wipes access.
//   • The "admin" role can be renamed but is NEVER restrictable — we
//     refuse to write a module allow-list for it, and module resolution
//     always grants admin full access regardless.
router.put("/:value", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const value = String(req.params.value);
    const isAdminRole = value === "admin";
    const { label, allowedPaths } = req.body as { label?: string; allowedPaths?: unknown };

    const [existing] = await db.select().from(customRolesTable).where(eq(customRolesTable.value, value)).limit(1);
    if (existing) {
      const set: Record<string, any> = { updatedAt: new Date() };
      if (typeof label === "string" && label.trim()) set.label = label.trim();
      if (!isAdminRole && allowedPaths !== undefined) set.allowedPaths = sanitisePaths(allowedPaths);
      const [updated] = await db.update(customRolesTable).set(set).where(eq(customRolesTable.value, value)).returning();
      res.json(updated);
      return;
    }

    const [created] = await db.insert(customRolesTable).values({
      value,
      label: (typeof label === "string" && label.trim()) ? label.trim() : value,
      allowedPaths: isAdminRole ? [] : sanitisePaths(allowedPaths),
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("[custom-roles] upsert failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// DELETE /:value — remove a custom role (admin only). Users still on the
// role keep the value in their record but fall back to viewer-level
// access until reassigned.
router.delete("/:value", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const value = String(req.params.value);
    await db.delete(customRolesTable).where(eq(customRolesTable.value, value));
    res.json({ deleted: true });
  } catch (err) {
    console.error("[custom-roles] delete failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
