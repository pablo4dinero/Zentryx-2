import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const featureFlagsTable = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  featureName: text("feature_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  category: text("category").notNull().default("optimization"),
  updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const featureFlagHistoryTable = pgTable("feature_flag_history", {
  id: serial("id").primaryKey(),
  featureName: text("feature_name").notNull(),
  previousValue: boolean("previous_value").notNull(),
  newValue: boolean("new_value").notNull(),
  changedByUserId: integer("changed_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  changedByName: text("changed_by_name").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFeatureFlagSchema = createInsertSchema(featureFlagsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlagsTable.$inferSelect;

export const insertFeatureFlagHistorySchema = createInsertSchema(featureFlagHistoryTable).omit({
  id: true,
  createdAt: true
});
export type InsertFeatureFlagHistory = z.infer<typeof insertFeatureFlagHistorySchema>;
export type FeatureFlagHistory = typeof featureFlagHistoryTable.$inferSelect;
