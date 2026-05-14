import { pgTable, serial, text, integer, timestamp, boolean, numeric, pgEnum } from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────────────
// MDP Module Tables
// ──────────────────────────────────────────────────────

export const mdpProductStatusEnum = pgEnum("mdp_product_status", ["Ordered", "Produced", "Delivered", "Cancelled"]);
export const mdpPlanStatusEnum = pgEnum("mdp_plan_status", ["Planned", "In Progress", "Completed", "Pending"]);
export const mdpDeliveryStatusEnum = pgEnum("mdp_delivery_status", ["Pending", "In Transit", "Delivered", "Cancelled"]);

/**
 * MDP Customer Products
 * Tracks customer demand and product requirements for planning
 */
export const mdpCustomerProductsTable = pgTable("mdp_customer_products", {
  id: serial("id").primaryKey(),
  accountName: text("account_name").notNull(),
  company: text("company").notNull(),
  productType: text("product_type").notNull(),
  urgency: text("urgency").default("normal"),
  priority: text("priority").default("medium"),
  volume: integer("volume").default(0),
  accountManager: text("account_manager"),
  dateAdded: timestamp("date_added").notNull().defaultNow(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * MDP Production Orders
 * Core production order records linked to Sales Force orders
 */
export const mdpProductionOrdersTable = pgTable("mdp_production_orders", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id"),
  rawMaterialStatus: text("raw_material_status").default("Pending"),
  microbialAnalysis: text("microbial_analysis").default("Normal"),
  remarks: text("remarks").default(""),
  orderStatus: text("order_status").default("Ordered"),
  isPlanned: boolean("is_planned").default(false),
  isProduced: boolean("is_produced").default(false),
  isDelivered: boolean("is_delivered").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * MDP Production Floors
 * Represents production facility floors and their capacity
 */
export const mdpProductionFloorsTable = pgTable("mdp_production_floors", {
  id: serial("id").primaryKey(),
  floorName: text("floor_name").notNull(),
  blendCategory: text("blend_category").notNull(),
  maxCapacityKg: integer("max_capacity_kg").notNull(),
  blenderCapacityPerBatch: integer("blender_capacity_per_batch"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * MDP Floor Assignments
 * Schedules production orders to specific floors for specific days/weeks
 */
export const mdpFloorAssignmentsTable = pgTable("mdp_floor_assignments", {
  id: serial("id").primaryKey(),
  floorId: integer("floor_id").notNull(),
  productionOrderId: integer("production_order_id").notNull(),
  weekLabel: text("week_label").notNull(),
  assignedDay: text("assigned_day").notNull(),
  planStatus: text("plan_status").default("Planned"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  producedAt: timestamp("produced_at"),
});

/**
 * MDP Produced Orders
 * Records completed production runs and delivery status
 */
export const mdpProducedOrdersTable = pgTable("mdp_produced_orders", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id"),
  accountName: text("account_name").notNull(),
  productName: text("product_name").notNull(),
  productType: text("product_type").notNull(),
  volume: integer("volume").notNull(),
  floorId: integer("floor_id"),
  producedAt: timestamp("produced_at").notNull().defaultNow(),
  deliveryStatus: text("delivery_status").default("Pending"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────
// Exported Types (Drizzle $inferSelect)
// ──────────────────────────────────────────────────────

export type MdpCustomerProduct = typeof mdpCustomerProductsTable.$inferSelect;
export type MdpProductionOrder = typeof mdpProductionOrdersTable.$inferSelect;
export type MdpProductionFloor = typeof mdpProductionFloorsTable.$inferSelect;
export type MdpFloorAssignment = typeof mdpFloorAssignmentsTable.$inferSelect;
export type MdpProducedOrder = typeof mdpProducedOrdersTable.$inferSelect;
