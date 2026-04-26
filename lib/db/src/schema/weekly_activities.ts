import { pgTable, serial, text, integer, timestamp, pgEnum, boolean, numeric } from "drizzle-orm/pg-core";

export const weeklyActivityStatusEnum = pgEnum("weekly_activity_status", [
  "not_started", "ongoing", "completed"
]);

export const weeklyActivityPriorityEnum = pgEnum("weekly_activity_priority", [
  "low", "medium", "high"
]);

export const weeklyActivityProductTypeEnum = pgEnum("weekly_activity_product_type", [
  "seasoning", "dairy_premix", "dough_and_bread_premix",
  "snack_dusting", "functional_blend", "sweet_flavors", "savoury_flavours"
]);

export const weeklyReportsTable = pgTable("weekly_reports", {
  id: serial("id").primaryKey(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  weekNumber: integer("week_number").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  label: text("label").notNull(),
  samplesSent: text("samples_sent").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const weeklyActivitiesTable = pgTable("weekly_activities", {
  id: serial("id").primaryKey(),
  weeklyReportId: integer("weekly_report_id").notNull(),
  assignedUserId: integer("assigned_user_id"),
  projectTitle: text("project_title").notNull().default(""),
  productType: weeklyActivityProductTypeEnum("product_type"),
  status: weeklyActivityStatusEnum("status").notNull().default("not_started"),
  priority: weeklyActivityPriorityEnum("priority").notNull().default("medium"),
  remarks: text("remarks").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dispatchProductTypeEnum = pgEnum("dispatch_product_type", ["sweet", "savory"]);

export const dispatchRecordsTable = pgTable("dispatch_records", {
  id: serial("id").primaryKey(),
  sampleCode: text("sample_code").notNull().default(""),
  productDescription: text("product_description").notNull().default(""),
  customer: text("customer").notNull().default(""),
  quantity: numeric("quantity", { precision: 12, scale: 3 }),
  sentByUserId: integer("sent_by_user_id"),
  dispatchMethod: text("dispatch_method").notNull().default(""),
  productType: dispatchProductTypeEnum("product_type"),
  dateSent: text("date_sent"),
  recipientName: text("recipient_name").notNull().default(""),
  recipientPhone: text("recipient_phone").notNull().default(""),
  recipientMail: text("recipient_mail").notNull().default(""),
  followUpMailSent: boolean("follow_up_mail_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type WeeklyReport = typeof weeklyReportsTable.$inferSelect;
export type WeeklyActivity = typeof weeklyActivitiesTable.$inferSelect;
export type DispatchRecord = typeof dispatchRecordsTable.$inferSelect;
