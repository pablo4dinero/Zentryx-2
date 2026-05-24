import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Every login attempt (success or failure) is appended here so admins
// can audit credential use, spot brute-force attempts, see where users
// are signing in from, and revoke / lock accounts when needed.
export const loginAttemptsTable = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  // Null when the email doesn't match any user (failed attempt against a
  // non-existent account) — we still record the attempted email so the
  // admin can see brute-force patterns.
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  success: boolean("success").notNull(),
  reason: text("reason"),         // "invalid_password", "user_inactive", "user_not_found", "mfa_required", "ok"
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLoginAttemptSchema = createInsertSchema(loginAttemptsTable).omit({ id: true, createdAt: true });
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;
export type LoginAttempt = typeof loginAttemptsTable.$inferSelect;
