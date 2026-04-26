import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productTypeEnum, projectStatusEnum, projectStageEnum } from "./projects";

export const businessDevTable = pgTable("business_dev", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stage: projectStageEnum("stage").notNull().default("innovation"),
  status: projectStatusEnum("status").notNull().default("in_progress"),
  leadId: integer("lead_id").references(() => usersTable.id),
  assigneeIds: integer("assignee_ids").array().notNull().default([]),
  startDate: timestamp("start_date"),
  targetDate: timestamp("target_date"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  costTarget: numeric("cost_target", { precision: 15, scale: 2 }),
  productType: productTypeEnum("product_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBusinessDevSchema = createInsertSchema(businessDevTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessDev = z.infer<typeof insertBusinessDevSchema>;
export type BusinessDev = typeof businessDevTable.$inferSelect;
