import { pgTable, serial, text, integer, numeric, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const formulationStatusEnum = pgEnum("formulation_status", [
  "draft", "active", "approved", "rejected"
]);

export const formulationsTable = pgTable("formulations", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: text("version").notNull().default("1.0"),
  ingredients: jsonb("ingredients").notNull().default([]),
  sensoryScores: jsonb("sensory_scores"),
  shelfLifeDays: integer("shelf_life_days"),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 4 }),
  targetMargin: numeric("target_margin", { precision: 5, scale: 2 }),
  notes: text("notes"),
  status: formulationStatusEnum("status").notNull().default("draft"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFormulationSchema = createInsertSchema(formulationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormulation = z.infer<typeof insertFormulationSchema>;
export type Formulation = typeof formulationsTable.$inferSelect;
