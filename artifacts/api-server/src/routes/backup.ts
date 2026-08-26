import { Router } from "express";
import { pool, db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { verifyTotp } from "../lib/totp";

const router = Router();

// FK-safe insertion order. Tables that appear first have no FK deps on those
// below them. During restore we truncate all at once (FK checks off) then
// insert in this exact order so FKs are satisfied on commit.
const BACKUP_TABLES = [
  // ── Core ────────────────────────────────────────────────────────────────
  "users",
  "departments",
  // ── Accounts / Sales Force ───────────────────────────────────────────────
  "accounts",
  "account_tasks",
  "account_production_orders",
  "account_status_reports",
  "account_forecasts",
  // ── Config lists ────────────────────────────────────────────────────────
  "option_lists",
  "product_types",
  "custom_roles",
  // ── Feature flags ────────────────────────────────────────────────────────
  "feature_flags",
  "feature_flag_history",
  // ── Admin ───────────────────────────────────────────────────────────────
  "admin_messages",
  "admin_message_recipients",
  // ── Events ──────────────────────────────────────────────────────────────
  "events",
  // ── Projects & Tasks ─────────────────────────────────────────────────────
  "projects",
  "tasks",
  "project_comments",
  "notifications",
  "activity_logs",
  // ── Formulations & Business Dev ──────────────────────────────────────────
  "formulations",
  "business_dev",
  // ── Weekly Reports ───────────────────────────────────────────────────────
  "weekly_reports",
  "weekly_activities",
  "dispatch_records",
  // ── Misc ────────────────────────────────────────────────────────────────
  "export_requests",
  // ── Procurement ─────────────────────────────────────────────────────────
  "vendors",
  "purchase_requests",
  "purchase_request_approvals",
  "purchase_orders",
  "purchase_order_items",
  "purchase_order_receipts",
  "vendor_performance",
  // ── MDP ─────────────────────────────────────────────────────────────────
  "mdp_customer_products",
  "mdp_production_floors",
  "mdp_production_orders",
  "mdp_floor_assignments",
  "mdp_floor_day_statuses",
  "mdp_product_switch_downtimes",
  "mdp_produced_orders",
  "mdp_monthly_orders",
  "mdp_plan_activity_log",
  "mdp_plan_tracking",
  // ── Chat ────────────────────────────────────────────────────────────────
  "chat_rooms",
  "chat_room_members",
  "chat_messages",
  "chat_read_receipts",
] as const;

const SCHEMA_VERSION = "1.0";
const APP_NAME = "Zentryx";

// ── GET /api/backup/download ─────────────────────────────────────────────────
router.get("/download", requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  // TOTP re-verification — must pass current authenticator code
  const totpCode = req.headers["x-totp-code"] as string | undefined;
  if (!totpCode) {
    res.status(400).json({ error: "TOTP code required", code: "TOTP_REQUIRED" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user?.mfaSecret || !verifyTotp(user.mfaSecret, totpCode)) {
    res.status(403).json({ error: "Invalid authenticator code. Please try again.", code: "TOTP_INVALID" });
    return;
  }

  const client = await pool.connect();
  try {
    const tables: Record<string, any[]> = {};
    for (const table of BACKUP_TABLES) {
      try {
        const result = await client.query(`SELECT * FROM "${table}" ORDER BY id ASC`);
        tables[table] = result.rows;
      } catch {
        tables[table] = []; // table may not exist yet — skip gracefully
      }
    }

    const backup = {
      schemaVersion: SCHEMA_VERSION,
      appName: APP_NAME,
      exportedAt: new Date().toISOString(),
      rowCounts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      tables,
    };

    const filename = `zentryx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup));
  } catch (err) {
    console.error("[backup] download error:", err);
    res.status(500).json({ error: "Backup generation failed" });
  } finally {
    client.release();
  }
});

// ── POST /api/backup/restore ─────────────────────────────────────────────────
router.post("/restore", requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  // TOTP re-verification — must pass current authenticator code
  const totpCode = req.headers["x-totp-code"] as string | undefined;
  if (!totpCode) {
    res.status(400).json({ error: "TOTP code required", code: "TOTP_REQUIRED" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user?.mfaSecret || !verifyTotp(user.mfaSecret, totpCode)) {
    res.status(403).json({ error: "Invalid authenticator code. Please try again.", code: "TOTP_INVALID" });
    return;
  }

  const { schemaVersion, appName, tables } = req.body ?? {};
  if (schemaVersion !== SCHEMA_VERSION || appName !== APP_NAME || typeof tables !== "object" || tables === null) {
    res.status(400).json({ error: "Invalid backup file — missing required header fields or wrong app." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Disable FK enforcement so we can truncate/insert in any order.
    await client.query("SET session_replication_role = replica");

    // Truncate every known table (session_replication_role disables FK checks,
    // so order and CASCADE are irrelevant here).
    for (const table of [...BACKUP_TABLES].reverse()) {
      try {
        await client.query(`TRUNCATE "${table}" RESTART IDENTITY`);
      } catch {
        // Table doesn't exist in this deployment — skip
      }
    }

    // Insert rows in FK-safe order
    let totalRows = 0;
    for (const table of BACKUP_TABLES) {
      const rows: any[] = tables[table] ?? [];
      if (rows.length === 0) continue;

      const cols = Object.keys(rows[0]);
      if (cols.length === 0) continue;
      const colsSql = cols.map(c => `"${c}"`).join(", ");

      // Batch inserts (200 rows per statement to stay within pg param limit)
      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const valuePlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(", ")})`)
          .join(", ");
        const flatValues = batch.flatMap(row => cols.map(col => row[col] ?? null));
        await client.query(
          `INSERT INTO "${table}" (${colsSql}) VALUES ${valuePlaceholders}`,
          flatValues
        );
      }
      totalRows += rows.length;
    }

    // Re-enable FK enforcement
    await client.query("SET session_replication_role = DEFAULT");
    await client.query("COMMIT");

    res.json({ success: true, totalRows, message: `Restore complete — ${totalRows.toLocaleString()} rows across ${BACKUP_TABLES.length} tables.` });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[backup] restore error:", err);
    res.status(500).json({ error: `Restore failed: ${err instanceof Error ? err.message : "Unknown error"}. No data was changed.` });
  } finally {
    client.release();
  }
});

export default router;
