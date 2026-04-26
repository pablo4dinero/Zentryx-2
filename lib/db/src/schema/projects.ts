import { pgTable, serial, text, integer, numeric, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const projectStageEnum = pgEnum("project_stage", [
  "testing", "reformulation", "innovation", "cost_optimization", "modification",
  "ideation", "research", "formulation", "validation", "scale_up", "commercialization"
]);

export const projectStatusEnum = pgEnum("project_status", [
  "approved", "awaiting_feedback", "on_hold", "in_progress", "new_inventory", "cancelled", "pushed_to_live",
  "active", "completed"
]);

export const priorityEnum = pgEnum("priority", [
  "low", "medium", "high", "critical"
]);

export const productTypeEnum = pgEnum("product_type", [
  "Seasoning", "Snack Dusting", "Bread & Dough Premix", "Dairy Premix",
  "Functional Blend", "Pasta Sauce", "Sweet Flavour", "Savoury Flavour"
]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stage: projectStageEnum("stage").notNull().default("innovation"),
  status: projectStatusEnum("status").notNull().default("in_progress"),
  priority: priorityEnum("priority").notNull().default("medium"),
  leadId: integer("lead_id").references(() => usersTable.id),
  assigneeIds: integer("assignee_ids").array().notNull().default([]),
  startDate: timestamp("start_date"),
  targetDate: timestamp("target_date"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  costTarget: numeric("cost_target", { precision: 15, scale: 2 }),
  sellingPrice: numeric("selling_price", { precision: 15, scale: 2 }),
  volumeKgPerMonth: numeric("volume_kg_per_month", { precision: 15, scale: 2 }),
  productType: productTypeEnum("product_type"),
  successRate: numeric("success_rate", { precision: 5, scale: 2 }),
  revenueImpact: numeric("revenue_impact", { precision: 15, scale: 2 }),
  productCategory: text("product_category"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
