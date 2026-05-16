import { pgTable, serial, text, integer, timestamp, pgEnum, numeric, boolean, json } from "drizzle-orm/pg-core";

export const urgencyLevelEnum = pgEnum("urgency_level", ["urgent", "medium", "normal"]);
export const customerTypeSfEnum = pgEnum("customer_type_sf", ["new", "existing"]);
export const productTypeSfEnum = pgEnum("product_type_sf", [
  "seasoning", "snacks_dusting", "dairy_premix",
  "bakery_dough_premix", "sweet_flavours", "savoury_flavour"
]);
export const approvalStatusSfEnum = pgEnum("approval_status_sf", ["approved", "not_yet_approved", "cancelled"]);
export const accountTaskStatusEnum = pgEnum("account_task_status", ["todo", "in_progress", "review", "done"]);
export const accountActiveStatusEnum = pgEnum("account_active_status", ["active", "on_hold"]);

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  company: text("company").notNull(),
  productName: text("product_name").notNull(),
  accountManagers: json("account_managers").$type<number[]>().default([]),
  contactPerson: text("contact_person"),
  cpPhone: text("cp_phone"),
  cpEmail: text("cp_email"),
  customerType: customerTypeSfEnum("customer_type").default("new"),
  productType: text("product_type").notNull(),
  application: text("application"),
  targetPrice: numeric("target_price", { precision: 10, scale: 2 }),
  volume: numeric("volume", { precision: 10, scale: 2 }),
  urgencyLevel: urgencyLevelEnum("urgency_level").default("normal"),
  competitorReference: text("competitor_reference"),
  sellingPrice: numeric("selling_price", { precision: 10, scale: 2 }),
  margin: text("margin"),
  approvalStatus: approvalStatusSfEnum("approval_status").default("not_yet_approved"),
  isActive: boolean("is_active").notNull().default(true),
  status: accountActiveStatusEnum("status").notNull().default("active"),
  createdById: integer("created_by_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accountTasksTable = pgTable("account_tasks", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  title: text("title").notNull(),
  status: accountTaskStatusEnum("status").default("todo"),
  description: text("description"),
  assigneeId: integer("assignee_id"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accountProductionOrdersTable = pgTable("account_production_orders", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  price: numeric("price", { precision: 10, scale: 4 }),
  volume: numeric("volume", { precision: 10, scale: 2 }),
  dateOrdered: text("date_ordered"),
  expectedDeliveryDate: text("expected_delivery_date"),
  dateDelivered: text("date_delivered"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const todayProductionOrdersTable = pgTable("today_production_orders", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id").notNull(),
  accountId: integer("account_id").notNull(),
  accountCompany: text("account_company"),
  productName: text("product_name"),
  price: numeric("price", { precision: 10, scale: 4 }),
  volume: numeric("volume", { precision: 10, scale: 2 }),
  dateOrdered: text("date_ordered"),
  expectedDeliveryDate: text("expected_delivery_date"),
  dateDelivered: text("date_delivered"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accountStatusReportsTable = pgTable("account_status_reports", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id"),
  authorName: text("author_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const forecastStatusEnum = pgEnum("forecast_status", ["pending", "confirmed", "probable"]);

export const accountForecastsTable = pgTable("account_forecasts", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id"),
  company: text("company").notNull(),
  productName: text("product_name").notNull(),
  productType: text("product_type"),
  customerType: text("customer_type"),
  isStrategic: boolean("is_strategic").notNull().default(false),
  lastOrderDate: text("last_order_date"),
  lastOrderVolume: numeric("last_order_volume", { precision: 12, scale: 2 }),
  forecastDate: text("forecast_date").notNull(),
  forecastVolume: numeric("forecast_volume", { precision: 12, scale: 2 }),
  confidence: integer("confidence").notNull().default(50),
  status: forecastStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Account = typeof accountsTable.$inferSelect;
export type AccountTask = typeof accountTasksTable.$inferSelect;
export type AccountProductionOrder = typeof accountProductionOrdersTable.$inferSelect;
export type AccountStatusReport = typeof accountStatusReportsTable.$inferSelect;
export type AccountForecast = typeof accountForecastsTable.$inferSelect;
