import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtime } from "./lib/realtime";
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

    // Real-time online status tracking for chat
    await db.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP NOT NULL DEFAULT NOW();`));

    // Add link field to notifications for routing to source module/chat
    await db.execute(sql.raw(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT;`));

    // Ensure the expected delivery date column exists on existing production order tables
    await db.execute(sql.raw(`ALTER TABLE account_production_orders ADD COLUMN IF NOT EXISTS expected_delivery_date TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE account_production_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS production_order_id INTEGER NOT NULL;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS account_company TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS product_name TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS expected_delivery_date TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE today_production_orders ADD COLUMN IF NOT EXISTS date_delivered TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_production_orders ADD COLUMN IF NOT EXISTS raw_material_status TEXT DEFAULT 'Pending';`));
    await db.execute(sql.raw(`ALTER TABLE mdp_floor_assignments ADD COLUMN IF NOT EXISTS assigned_volume NUMERIC(12,2);`));
    await db.execute(sql.raw(`ALTER TABLE mdp_floor_assignments ADD COLUMN IF NOT EXISTS sort_order INTEGER;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_production_floors ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Running';`));
    await db.execute(sql.raw(`ALTER TABLE mdp_production_floors ADD COLUMN IF NOT EXISTS allowed_product_types JSONB DEFAULT '[]'::jsonb;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_produced_orders ADD COLUMN IF NOT EXISTS floor_assignment_id INTEGER;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_produced_orders ADD COLUMN IF NOT EXISTS week_label TEXT;`));
    await db.execute(sql.raw(`ALTER TABLE mdp_produced_orders ADD COLUMN IF NOT EXISTS assigned_day TEXT;`));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS mdp_monthly_orders (
        id SERIAL PRIMARY KEY,
        month TEXT NOT NULL,
        account_id INTEGER,
        customer_name TEXT NOT NULL DEFAULT '',
        product_description TEXT NOT NULL DEFAULT '',
        volume_kg NUMERIC(10,2),
        date_ordered TEXT,
        expected_delivery_date TEXT,
        production_status TEXT DEFAULT 'Pending',
        distribution_type TEXT DEFAULT 'Pick Up',
        packing_status TEXT DEFAULT 'Not Packed',
        delivery_status TEXT DEFAULT 'No',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS product_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      INSERT INTO product_types (name)
      SELECT v FROM (VALUES
        ('Seasoning'), ('Snack Dusting'), ('Bread & Dough Premix'), ('Dairy Premix'),
        ('Functional Blend'), ('Pasta Sauce'), ('Sweet Flavour'), ('Savoury Flavour')
      ) AS t(v)
      WHERE NOT EXISTS (SELECT 1 FROM product_types LIMIT 1);
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS option_lists (
        id SERIAL PRIMARY KEY,
        list_key TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS option_lists_list_key_name_unique
        ON option_lists (list_key, name);
    `));
    await db.execute(sql.raw(`
      INSERT INTO option_lists (list_key, name)
      SELECT 'stage', v FROM (VALUES
        ('testing'), ('reformulation'), ('innovation'), ('cost_optimization'), ('modification'),
        ('ideation'), ('research'), ('formulation'), ('validation'), ('scale_up'), ('commercialization')
      ) AS t(v)
      WHERE NOT EXISTS (SELECT 1 FROM option_lists WHERE list_key = 'stage' LIMIT 1);
    `));
    await db.execute(sql.raw(`
      INSERT INTO option_lists (list_key, name)
      SELECT 'status', v FROM (VALUES
        ('approved'), ('awaiting_feedback'), ('on_hold'), ('in_progress'), ('new_inventory'),
        ('cancelled'), ('pushed_to_live'), ('active'), ('completed')
      ) AS t(v)
      WHERE NOT EXISTS (SELECT 1 FROM option_lists WHERE list_key = 'status' LIMIT 1);
    `));
    await db.execute(sql.raw(`
      INSERT INTO option_lists (list_key, name)
      SELECT 'priority', v FROM (VALUES
        ('low'), ('medium'), ('high'), ('critical')
      ) AS t(v)
      WHERE NOT EXISTS (SELECT 1 FROM option_lists WHERE list_key = 'priority' LIMIT 1);
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS mdp_floor_day_statuses (
        id SERIAL PRIMARY KEY,
        floor_id INTEGER NOT NULL,
        week_label TEXT NOT NULL,
        assigned_day TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Running',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS mdp_floor_day_statuses_unique
        ON mdp_floor_day_statuses (floor_id, week_label, assigned_day);
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS mdp_product_switch_downtimes (
        id SERIAL PRIMARY KEY,
        after_assignment_id INTEGER NOT NULL,
        minutes INTEGER NOT NULL DEFAULT 60,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS mdp_product_switch_downtimes_unique
        ON mdp_product_switch_downtimes (after_assignment_id);
    `));

    // Export approval workflow — admin / NPD manager must approve before a
    // module's data can be exported as CSV / XLSX.
    await db.execute(sql.raw(`
      DO $$ BEGIN
        CREATE TYPE export_request_status AS ENUM ('pending', 'approved', 'denied', 'fulfilled');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS export_requests (
        id SERIAL PRIMARY KEY,
        requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requester_name TEXT NOT NULL,
        module TEXT NOT NULL,
        file_format TEXT NOT NULL,
        reason TEXT,
        status export_request_status NOT NULL DEFAULT 'pending',
        reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewer_name TEXT,
        reviewed_at TIMESTAMP,
        deny_reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));

    // Login audit trail — every login attempt (success or failure).
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        reason TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email);
    `));
    await db.execute(sql.raw(`
      CREATE INDEX IF NOT EXISTS login_attempts_created_at_idx ON login_attempts (created_at DESC);
    `));

    // Admin → user broadcast messages with per-recipient acknowledgment.
    await db.execute(sql.raw(`
      DO $$ BEGIN
        CREATE TYPE admin_message_audience AS ENUM ('all', 'selected');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS admin_messages (
        id SERIAL PRIMARY KEY,
        from_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        from_admin_name TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        audience admin_message_audience NOT NULL DEFAULT 'selected',
        recipient_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS admin_message_recipients (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES admin_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS admin_message_recipients_unique
        ON admin_message_recipients (message_id, user_id);
    `));

    // Admin-defined custom roles with an explicit module allow-list.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS custom_roles (
        id SERIAL PRIMARY KEY,
        value TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        allowed_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));

    // One-time passcodes — persistent so they survive restarts and work
    // across multiple server instances. Replaces the previous in-memory
    // Map that lost state on every deploy.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code TEXT NOT NULL,
        data JSONB,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_email_purpose_unique
        ON otp_codes (email, purpose);
    `));

    // Migrate projects table enum columns to text so custom values are accepted
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'stage' AND data_type = 'USER-DEFINED'
        ) THEN
          ALTER TABLE projects
            ALTER COLUMN stage TYPE text USING stage::text,
            ALTER COLUMN status TYPE text USING status::text,
            ALTER COLUMN priority TYPE text USING priority::text,
            ALTER COLUMN product_type TYPE text USING product_type::text;
        END IF;
      END $$;
    `));

    // Migrate business_dev table enum columns to text
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'business_dev' AND column_name = 'stage' AND data_type = 'USER-DEFINED'
        ) THEN
          ALTER TABLE business_dev
            ALTER COLUMN stage TYPE text USING stage::text,
            ALTER COLUMN status TYPE text USING status::text,
            ALTER COLUMN product_type TYPE text USING product_type::text;
        END IF;
      END $$;
    `));

    // Migrate accounts table product_type enum column to text so custom values are accepted
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'accounts' AND column_name = 'product_type' AND data_type = 'USER-DEFINED'
        ) THEN
          ALTER TABLE accounts
            ALTER COLUMN product_type TYPE text USING product_type::text;
        END IF;
      END $$;
    `));

    // Migrate weekly_activities table product_type from enum to text so custom values persist
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'weekly_activities' AND column_name = 'product_type' AND data_type = 'USER-DEFINED'
        ) THEN
          ALTER TABLE weekly_activities
            ALTER COLUMN product_type TYPE text USING product_type::text;
        END IF;
      END $$;
    `));

    // Add sms_verified_at column for SMS MFA feature
    await db.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_verified_at TIMESTAMP;`));

    // ── Phase 1 user-table additions ───────────────────────────────
    // First-time admin approval lifecycle. Existing users default to
    // `approved` so this migration is non-breaking; new users will be
    // inserted as `pending` by the registration / OAuth-callback flows.
    await db.execute(sql.raw(`
      DO $$ BEGIN
        CREATE TYPE user_approval_status AS ENUM ('pending', 'approved', 'denied');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `));
    await db.execute(sql.raw(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS approval_status user_approval_status NOT NULL DEFAULT 'approved',
        ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS denied_reason TEXT;
    `));

    // TOTP MFA columns. Null mfa_secret = user has not yet enrolled.
    // mfa_backup_codes stores bcrypt hashes (never plaintext) as a JSON
    // array. mfa_failed_attempts gates the "show fallback options" UI.
    await db.execute(sql.raw(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
        ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB,
        ADD COLUMN IF NOT EXISTS mfa_failed_attempts INTEGER NOT NULL DEFAULT 0;
    `));

    // Admin emergency one-time login token (the "request login approval
    // from admin" fallback). When granted, the user can log in once and
    // is forced into MFA re-enrollment.
    await db.execute(sql.raw(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS emergency_login_token_hash TEXT,
        ADD COLUMN IF NOT EXISTS emergency_login_expires TIMESTAMP;
    `));

    // Feature Flags — admin-controlled toggles for A/B testing features
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id SERIAL PRIMARY KEY,
        feature_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        category TEXT NOT NULL DEFAULT 'optimization',
        updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS feature_flag_history (
        id SERIAL PRIMARY KEY,
        feature_name TEXT NOT NULL,
        previous_value BOOLEAN NOT NULL,
        new_value BOOLEAN NOT NULL,
        changed_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        changed_by_name TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `));
    await db.execute(sql.raw(`
      INSERT INTO feature_flags (feature_name, display_name, description, enabled, category)
      VALUES
        ('floor_efficiency_dashboard', 'Floor Efficiency Dashboard', 'Show which floors are running at <80% capacity', true, 'optimization'),
        ('downtime_alerts', 'Downtime & Maintenance Alerts', 'Flag unavoidable idle time and suggest preventive maintenance windows', true, 'optimization'),
        ('efficiency_score', 'Efficiency Score', 'Show how far current plan is from theoretical max output', true, 'optimization'),
        ('production_analytics', 'Production Analytics', 'Learn from actual production data and optimize constraints', true, 'analytics')
      ON CONFLICT (feature_name) DO NOTHING;
    `));

    // Convert users.role from the fixed `user_role` enum to free TEXT so
    // admins can assign custom roles beyond the 9 built-ins. Idempotent:
    // only converts if the column is still the enum type. Existing values
    // are preserved verbatim (enum labels cast cleanly to their text).
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'role'
            AND udt_name = 'user_role'
        ) THEN
          ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
          ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
          ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';
        END IF;
      END $$;
    `));

    // ── Phase 1 Chunk 4: migrate legacy role values onto the
    // consolidated 9-role list. Idempotent — rows already on a new
    // value are unaffected. Mapping (per agreed list):
    //
    //   admin                           → admin (unchanged)
    //   ceo, managing_director          → executive
    //   manager, head_of_product_development, head_of_department → manager
    //   key_account_manager, senior_key_account_manager → sales_team
    //   commercial_team (interim value)  → sales_team (renamed)
    //   npd_technologist, scientist, project_manager → npd_team
    //   procurement                     → operations_team
    //   quality_control                 → qc_team
    //   hr, graphics_designer           → support_staff
    //   viewer, analyst                 → viewer (analyst folds in)
    //
    // We DO NOT touch the superadmin row (their role is "admin" anyway).
    await db.execute(sql.raw(`UPDATE users SET role = 'executive' WHERE role IN ('ceo');`));
    await db.execute(sql.raw(`UPDATE users SET role = 'manager' WHERE role IN ('head_of_product_development', 'head_of_department');`));
    // "Commercial Team" was renamed to "Sales Team". Migrate the original
    // KAM roles AND anyone already on the interim commercial_team value.
    await db.execute(sql.raw(`UPDATE users SET role = 'sales_team' WHERE role IN ('key_account_manager', 'senior_key_account_manager', 'commercial_team');`));
    await db.execute(sql.raw(`UPDATE users SET role = 'npd_team' WHERE role IN ('npd_technologist', 'scientist', 'project_manager');`));
    await db.execute(sql.raw(`UPDATE users SET role = 'operations_team' WHERE role IN ('procurement');`));
    await db.execute(sql.raw(`UPDATE users SET role = 'qc_team' WHERE role IN ('quality_control');`));
    await db.execute(sql.raw(`UPDATE users SET role = 'support_staff' WHERE role IN ('hr', 'graphics_designer');`));
    await db.execute(sql.raw(`UPDATE users SET role = 'viewer' WHERE role IN ('analyst');`));

    // Repair chat rooms whose creator was never inserted into
    // chat_room_members. This happened to the superadmin because the
    // POST /api/chat/rooms handler filtered them out of the member list even
    // when they were the one starting the conversation — leaving every DM
    // they created visible only to the other participant. Idempotent: only
    // touches rooms where the creator is genuinely missing.
    await db.execute(sql.raw(`
      INSERT INTO chat_room_members (room_id, user_id)
      SELECT cr.id, cr.created_by_id
      FROM chat_rooms cr
      WHERE cr.created_by_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM chat_room_members crm
          WHERE crm.room_id = cr.id AND crm.user_id = cr.created_by_id
        );
    `));

    logger.info("Database tables created or verified successfully");
  } catch (err) {
    logger.error({ err }, "Failed to create database tables");
    throw err;
  }
}

async function applyMigrations() {
  try {
    logger.info("Applying database migrations...");

    // Add accountId column to mdp_production_orders if it doesn't exist
    await db.execute(sql`
      ALTER TABLE mdp_production_orders
      ADD COLUMN IF NOT EXISTS account_id INTEGER;
    `);

    // Add blendSpeedId column to mdp_production_orders if it doesn't exist
    await db.execute(sql`
      ALTER TABLE mdp_production_orders
      ADD COLUMN IF NOT EXISTS blend_speed_id TEXT;
    `);

    // Token revocation — tokenVersion column on users table
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
    `);

    // Performance indexes on high-frequency query columns
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_floor_assignments_week_label ON mdp_floor_assignments(week_label);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_floor_assignments_floor_id ON mdp_floor_assignments(floor_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_floor_assignments_order_id ON mdp_floor_assignments(production_order_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_floor_day_statuses_week ON mdp_floor_day_statuses(week_label);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_production_orders_account_id ON account_production_orders(account_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mdp_orders_sales_order_id ON mdp_production_orders(sales_order_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at DESC);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_produced_orders_week ON mdp_produced_orders(week_label);`);

    // Persistent newsfeed cache — survives server restarts so free API
    // rate limits (100 req/day) are never exhausted by cold starts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS newsfeed_cache (
        id         SERIAL PRIMARY KEY,
        section_id TEXT NOT NULL,
        query      TEXT NOT NULL DEFAULT '',
        items      JSONB NOT NULL,
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS newsfeed_cache_section_query_idx
        ON newsfeed_cache (section_id, query);
    `);

    // Optimistic locking — ensure updatedAt exists on production orders
    await db.execute(sql`
      ALTER TABLE account_production_orders
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    logger.info("Migrations applied successfully");
  } catch (err) {
    logger.error({ err }, "Failed to apply migrations");
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

    // Apply migrations
    await applyMigrations();
  } catch (err) {
    logger.error({ err }, "Database setup failed");
    throw err;
  }

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  // Attach the realtime WebSocket signaling hub (1:1 call ringing + WebRTC
  // signaling) to the same HTTP server — no separate service or port.
  attachRealtime(server);
}

startServer();