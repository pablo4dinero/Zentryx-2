import { Router } from "express";
import { db } from "@workspace/db";
import { featureFlagsTable } from "@workspace/db";

const router = Router();

// GET / — public endpoint: get all enabled feature flags
router.get("/", async (_req, res) => {
  try {
    const flags = await db.select({
      featureName: featureFlagsTable.featureName,
      enabled: featureFlagsTable.enabled,
    }).from(featureFlagsTable);

    const map: Record<string, boolean> = {};
    flags.forEach((flag) => {
      map[flag.featureName] = flag.enabled;
    });

    res.json(map);
  } catch (err) {
    console.error("[feature-flags] get failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
