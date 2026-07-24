import { Router } from "express";
import { db } from "@workspace/db";
import { featureFlagsTable } from "@workspace/db";

const router = Router();

// GET / — public endpoint: get all feature flags with enabled status and allowed roles
router.get("/", async (_req, res) => {
  try {
    const flags = await db.select({
      featureName: featureFlagsTable.featureName,
      enabled: featureFlagsTable.enabled,
      allowedRoles: featureFlagsTable.allowedRoles,
    }).from(featureFlagsTable);

    const map: Record<string, { enabled: boolean; allowedRoles: string[] | null }> = {};
    flags.forEach((flag) => {
      map[flag.featureName] = {
        enabled: flag.enabled,
        allowedRoles: (flag.allowedRoles as string[] | null) ?? null,
      };
    });

    res.json(map);
  } catch (err) {
    console.error("[feature-flags] get failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
