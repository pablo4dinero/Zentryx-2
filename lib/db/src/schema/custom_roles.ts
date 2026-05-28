import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Admin-defined roles beyond the 9 built-ins. Each carries an explicit
// allow-list of module paths (e.g. ["/", "/chat", "/analytics"]) that
// drives what the role can see — no hardcoding required. A custom role
// can never be granted "/admin" (enforced server- and client-side).
//
// Sales Force visibility for custom roles is always "tagged accounts
// only" (same as the Sales Team role); admin/executive remain the only
// roles that see all accounts.
export const customRolesTable = pgTable("custom_roles", {
  id: serial("id").primaryKey(),
  value: text("value").notNull().unique(),
  label: text("label").notNull(),
  allowedPaths: jsonb("allowed_paths").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomRoleSchema = createInsertSchema(customRolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomRole = z.infer<typeof insertCustomRoleSchema>;
export type CustomRole = typeof customRolesTable.$inferSelect;
