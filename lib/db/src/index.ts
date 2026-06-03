import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // max simultaneous DB connections (match your DB plan's limit)
  min: 2,                // keep 2 warm so first requests don't pay connection cost
  idleTimeoutMillis: 30_000,    // release idle connections after 30s
  connectionTimeoutMillis: 5_000, // fail fast if pool exhausted (don't queue forever)
  allowExitOnIdle: false, // keep process alive on Render
});

// Log pool errors so they don't silently swallow connection issues
pool.on("error", (err) => {
  console.error("[pg-pool] Unexpected error on idle client:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
