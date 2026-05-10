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
    // Create tables using raw SQL since Drizzle doesn't have a built-in create-if-not-exists
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        department TEXT,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Projects table
      `CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        lead_id INTEGER REFERENCES users(id),
        start_date DATE,
        target_date DATE,
        success_rate TEXT,
        revenue_impact TEXT,
        product_category TEXT,
        tags TEXT[],
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Tasks table
      `CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        assignee_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Formulations table
      `CREATE TABLE IF NOT EXISTS formulations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        ingredients JSONB,
        process TEXT,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Notifications table
      `CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Activity logs table
      `CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Accounts table
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

      // Account tasks table
      `CREATE TABLE IF NOT EXISTS account_tasks (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        assignee_id INTEGER,
        start_date TEXT,
        due_date TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Account production orders table
      `CREATE TABLE IF NOT EXISTS account_production_orders (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        price NUMERIC(10,4),
        volume NUMERIC(10,2),
        date_ordered TEXT,
        date_delivered TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Account status reports table
      `CREATE TABLE IF NOT EXISTS account_status_reports (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author_id INTEGER,
        author_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Forecast status enum
      `DO $$ BEGIN
        CREATE TYPE forecast_status AS ENUM ('pending', 'confirmed', 'probable');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      // Account forecasts table
      `CREATE TABLE IF NOT EXISTS account_forecasts (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES accounts(id),
        company TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_type TEXT,
        customer_type TEXT,
        is_strategic BOOLEAN NOT NULL DEFAULT false,
        last_order_date TEXT,
        last_order_volume NUMERIC(12,2),
        forecast_date TEXT NOT NULL,
        forecast_volume NUMERIC(12,2),
        confidence INTEGER NOT NULL DEFAULT 50,
        status forecast_status NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Weekly activities table
      `CREATE TABLE IF NOT EXISTS weekly_activities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start DATE NOT NULL,
        activities JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Procurement requests table
      `CREATE TABLE IF NOT EXISTS procurement_requests (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        quantity NUMERIC(10,2),
        unit TEXT,
        budget NUMERIC(12,2),
        required_by DATE,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_by INTEGER REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Procurement orders table
      `CREATE TABLE IF NOT EXISTS procurement_orders (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES procurement_requests(id),
        vendor_id INTEGER,
        vendor_name TEXT,
        quantity_ordered NUMERIC(10,2),
        unit_price NUMERIC(10,4),
        total_cost NUMERIC(12,2),
        order_date DATE,
        expected_delivery DATE,
        actual_delivery DATE,
        status TEXT NOT NULL DEFAULT 'ordered',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Procurement vendors table
      `CREATE TABLE IF NOT EXISTS procurement_vendors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        rating NUMERIC(3,2),
        categories TEXT[],
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Chat rooms table
      `CREATE TABLE IF NOT EXISTS chat_rooms (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_group BOOLEAN NOT NULL DEFAULT false,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Chat messages table
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Events table
      `CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        location TEXT,
        organizer_id INTEGER REFERENCES users(id),
        attendees INTEGER[],
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // Business dev table
      `CREATE TABLE IF NOT EXISTS business_dev (
        id SERIAL PRIMARY KEY,
        company TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        industry TEXT,
        potential_value NUMERIC(12,2),
        status TEXT NOT NULL DEFAULT 'prospect',
        notes TEXT,
        last_contact DATE,
        next_followup DATE,
        assigned_to INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
    ];

    for (const tableSql of tables) {
      await db.execute(sql.raw(tableSql));
    }

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