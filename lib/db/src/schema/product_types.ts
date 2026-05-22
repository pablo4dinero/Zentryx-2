import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Shared product type list used by Sales Force account creation, MDP
 * production orders, MDP floor allow-lists, Projects, Business Dev, and
 * Weekly Activities. Editable from any of those forms; lives server-side
 * so all clients see the same set.
 */
export const productTypesTable = pgTable("product_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProductType = typeof productTypesTable.$inferSelect;
