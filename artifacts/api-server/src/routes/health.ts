import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  databaseConnected: boolean;
  lastBackupTime?: string | null;
  hoursSinceBackup?: number | null;
  backupSize?: string | null;
  checks: {
    database: "ok" | "failed";
    backupMetadata: "ok" | "warning" | "failed";
  };
  timestamp: string;
}

// GET /health/backups — Check database connectivity and backup status
router.get("/backups", async (req, res) => {
  const response: HealthResponse = {
    status: "healthy",
    databaseConnected: false,
    checks: {
      database: "failed",
      backupMetadata: "failed",
    },
    timestamp: new Date().toISOString(),
  };

  try {
    // Check database connectivity
    const [user] = await db.select().from(usersTable).limit(1);
    response.databaseConnected = true;
    response.checks.database = "ok";
  } catch (err) {
    response.checks.database = "failed";
    response.status = "unhealthy";
    return res.status(503).json(response);
  }

  // Check backup metadata: read from environment variables set by GitHub Actions
  try {
    const lastBackupTime = process.env.LAST_BACKUP_TIME;
    const backupSize = process.env.LAST_BACKUP_SIZE;

    if (lastBackupTime) {
      const backupDate = new Date(lastBackupTime);
      const now = new Date();
      const hoursSince = Math.round((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60));

      response.lastBackupTime = backupDate.toISOString();
      response.hoursSinceBackup = hoursSince;
      response.backupSize = backupSize || "unknown";

      // Alert if backup is older than 24 hours
      if (hoursSince > 24) {
        response.checks.backupMetadata = "warning";
        response.status = "degraded";
      } else {
        response.checks.backupMetadata = "ok";
      }
    } else {
      // Backup metadata not available yet
      response.checks.backupMetadata = "warning";
      response.status = "degraded";
    }
  } catch (err) {
    response.checks.backupMetadata = "failed";
    response.status = "unhealthy";
  }

  res.status(response.status === "unhealthy" ? 503 : 200).json(response);
});

// GET /health — Basic health check (database only)
router.get("/", async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).limit(1);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", error: "Database unreachable", timestamp: new Date().toISOString() });
  }
});

export default router;
