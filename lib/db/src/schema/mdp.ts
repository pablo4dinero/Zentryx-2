import { pgTable, serial, text, integer, timestamp, boolean, numeric, pgEnum, jsonb } from "drizzle-orm/pg-core";

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
  accountId: integer("account_id"),
  rawMaterialStatus: text("raw_material_status").default("Pending"),
  microbialAnalysis: text("microbial_analysis").default("Normal"),
  blendSpeedId: text("blend_speed_id"),
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
  status: text("status").default("Running"),
  allowedProductTypes: jsonb("allowed_product_types").$type<string[]>().default([]),
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
  // Locale-independent ISO date ("YYYY-MM-DD") of the week's Monday.
  // Used as the canonical week key for cross-browser queries.
  weekStartDate: text("week_start_date"),
  assignedDay: text("assigned_day").notNull(),
  planStatus: text("plan_status").default("Planned"),
  assignedVolume: numeric("assigned_volume"),
  // Manual display order within a floor. NULL = not manually ordered yet
  // (those sort last, by id). Set by the reorder endpoint.
  sortOrder: integer("sort_order"),
  productionNote: text("production_note"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  producedAt: timestamp("produced_at"),
});

/**
 * MDP Product Switch Downtimes
 * One row per "gap" that follows a specific floor assignment.
 * Tracks the number of minutes spent cleaning between products on the
 * same floor / day / shift.
 */
export const mdpProductSwitchDowntimesTable = pgTable("mdp_product_switch_downtimes", {
  id: serial("id").primaryKey(),
  afterAssignmentId: integer("after_assignment_id").notNull(),
  minutes: integer("minutes").notNull().default(60),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * MDP Floor Day Statuses
 * Per (floor, week, day) runtime status used by the planning board
 * to flag Under Maintenance / On Hold on a single day only.
 */
export const mdpFloorDayStatusesTable = pgTable("mdp_floor_day_statuses", {
  id: serial("id").primaryKey(),
  floorId: integer("floor_id").notNull(),
  weekLabel: text("week_label").notNull(),
  weekStartDate: text("week_start_date"),
  assignedDay: text("assigned_day").notNull(),
  status: text("status").notNull().default("Running"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * MDP Produced Orders
 * Records completed production runs and delivery status
 */
export const mdpProducedOrdersTable = pgTable("mdp_produced_orders", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id"),
  floorAssignmentId: integer("floor_assignment_id"),
  weekLabel: text("week_label"),
  weekStartDate: text("week_start_date"),
  assignedDay: text("assigned_day"),
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

/**
 * MDP Monthly Orders
 * Tracks orders per month with inline status fields for production, distribution, packing, delivery
 */
export const mdpMonthlyOrdersTable = pgTable("mdp_monthly_orders", {
  id: serial("id").primaryKey(),
  month: text("month").notNull(),
  accountId: integer("account_id"),
  customerName: text("customer_name").notNull().default(""),
  productDescription: text("product_description").notNull().default(""),
  volumeKg: numeric("volume_kg", { precision: 10, scale: 2 }),
  dateOrdered: text("date_ordered"),
  expectedDeliveryDate: text("expected_delivery_date"),
  productionStatus: text("production_status").default("Pending"),
  distributionType: text("distribution_type").default("Pick Up"),
  packingStatus: text("packing_status").default("Not Packed"),
  deliveryStatus: text("delivery_status").default("No"),
  // Links this status record to a specific account_production_orders row.
  // NULL for legacy manually-created rows.
  productionOrderId: integer("production_order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────
// Exported Types (Drizzle $inferSelect)
// ──────────────────────────────────────────────────────

/**
 * MDP Plan Activity Log
 * Audit trail of every assignment change: created, removed, or volume-adjusted.
 * Used to power the "plan change frequency" analytics chart.
 */
export const mdpPlanActivityLogTable = pgTable("mdp_plan_activity_log", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id"),
  floorId: integer("floor_id"),
  weekLabel: text("week_label"),
  weekStartDate: text("week_start_date"),
  // 'assigned' | 'unassigned' | 'volume_adjusted'
  changeType: text("change_type").notNull(),
  changedByUserId: integer("changed_by_user_id"),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

/**
 * MDP Plan Tracking
 * Single-row global switch: stopped → active → paused.
 * Controls whether floor-assignment changes are recorded in the activity log.
 */
export const mdpPlanTrackingTable = pgTable("mdp_plan_tracking", {
  id: serial("id").primaryKey(),
  // 'stopped' | 'active' | 'paused'
  status: text("status").notNull().default("stopped"),
  startedAt: timestamp("started_at"),
  pausedAt: timestamp("paused_at"),
  // Snapshot of total floor assignments at the moment tracking was started
  baselineCount: integer("baseline_count").notNull().default(0),
  startedByUserId: integer("started_by_user_id"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MdpCustomerProduct = typeof mdpCustomerProductsTable.$inferSelect;
export type MdpProductionOrder = typeof mdpProductionOrdersTable.$inferSelect;
export type MdpProductionFloor = typeof mdpProductionFloorsTable.$inferSelect;
export type MdpFloorAssignment = typeof mdpFloorAssignmentsTable.$inferSelect;
export type MdpProducedOrder = typeof mdpProducedOrdersTable.$inferSelect;
export type MdpFloorDayStatus = typeof mdpFloorDayStatusesTable.$inferSelect;
export type MdpProductSwitchDowntime = typeof mdpProductSwitchDowntimesTable.$inferSelect;
export type MdpMonthlyOrder = typeof mdpMonthlyOrdersTable.$inferSelect;
export type MdpPlanActivityLog = typeof mdpPlanActivityLogTable.$inferSelect;
export type MdpPlanTracking = typeof mdpPlanTrackingTable.$inferSelect;
