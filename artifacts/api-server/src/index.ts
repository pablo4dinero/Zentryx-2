import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  usersTable,
  projectsTable,
  tasksTable,
  formulationsTable,
  notificationsTable,
  activityLogsTable,
  accountsTable,
  accountTasksTable,
  accountProductionOrdersTable,
  accountStatusReportsTable,
  accountForecastsTable,
  weeklyActivitiesTable,
  procurementRequestsTable,
  procurementOrdersTable,
  procurementVendorsTable,
  chatMessagesTable,
  chatRoomsTable,
  eventsTable,
  businessDevTable,
} from "@workspace/db";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function createTablesIfNotExist() {
  try {
    logger.info("Starting database table creation...");

    // Create tables using raw SQL since Drizzle doesn't have a built-in create-if-not-exists
    const tables = [
      // Accounts table (needed for foreign key)
      `CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        company TEXT NOT NULL,
        product_name TEXT,
        contact_person TEXT,
        cp_phone TEXT,
        cp_email TEXT,
        application TEXT,
        target_price NUMERIC(10,4),
        volume NUMERIC(10,2),
        selling_price NUMERIC(10,4),
        margin TEXT,
        competitor_reference TEXT,
        product_type TEXT,
        customer_type TEXT,
        urgency_level TEXT,
        account_managers INTEGER[],
        approval_status TEXT DEFAULT 'not_yet_approved',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Account production orders table (most important for this issue)
      `CREATE TABLE IF NOT EXISTS account_production_orders (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL,
        price NUMERIC(10,4),
        volume NUMERIC(10,2),
        date_ordered TEXT,
        expected_delivery_date TEXT,
        date_delivered TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS today_production_orders (
        id SERIAL PRIMARY KEY,
        production_order_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        account_company TEXT,
        product_name TEXT,
        price NUMERIC(10,4),
        volume NUMERIC(10,2),
        date_ordered TEXT,
        expected_delivery_date TEXT,
        date_delivered TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
    ];

    for (const tableSql of tables) {
      logger.info(`Creating table with SQL: ${tableSql.split('\n')[0]}`);
      await db.execute(sql.raw(tableSql));
    }

    // Ensure the expected delivery date column exists on existing production order tables
    await db.execute(sql.raw(`ALTER TABLE account_production_orders ADD COLUMN IF NOT EXISTS expected_delivery_date TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS production_order_id INTEGER NOT NULL;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS account_company TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS product_name TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS expected_delivery_date TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS date_delivered TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_production_orders ADD COLUMN IF NOT EXISTS raw_material_status TEXT DEFAULT 'Pending';`));
    await db.execute(sql.raw(`ALTER TABLE mdp_production_floors ADD COLUMN IF NOT EXISTS blender_capacity_kg INTEGER DEFAULT 0;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_floor_assignments ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT 'Day';`));

    logger.info("Database tables created or verified successfully");
  } catch (err) {
    logger.error({ err }, "Failed to create database tables");
    throw err;
  }
}

async function startServer() {
  try {
    // Test database connection
    await db.execute(sql`SELECT 1`);
    logger.info("Database connected successfully");

    // Create tables if they don't exist
    await createTablesIfNotExist();
  } catch (err) {
    logger.error({ err }, "Database setup failed");
    throw err;
  }

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

startServer();