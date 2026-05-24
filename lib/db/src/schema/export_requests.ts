import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const exportRequestStatusEnum = pgEnum("export_request_status", [
  "pending",
  "approved",
  "denied",
  "fulfilled",
]);

// Approval gate for module-level data exports. The requester submits a
// row; an admin or NPD manager flips the status to approved/denied; the
// frontend polls and, on approval, triggers the actual file download and
// flips the row to "fulfilled" so the same approval can't be reused.
export const exportRequestsTable = pgTable("export_requests", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  requesterName: text("requester_name").notNull(),
  module: text("module").notNull(),
  fileFormat: text("file_format").notNull(),
  reason: text("reason"),
  status: exportRequestStatusEnum("status").notNull().default("pending"),
  reviewerId: integer("reviewer_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewerName: text("reviewer_name"),
  reviewedAt: timestamp("reviewed_at"),
  denyReason: text("deny_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExportRequestSchema = createInsertSchema(exportRequestsTable).omit({ id: true, createdAt: true });
export type InsertExportRequest = z.infer<typeof insertExportRequestSchema>;
export type ExportRequest = typeof exportRequestsTable.$inferSelect;
