import { pgTable, serial, text, integer, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Audience tag — "all" (every active user gets the message) or "selected"
// (only listed recipients).
export const adminMessageAudienceEnum = pgEnum("admin_message_audience", ["all", "selected"]);

// One row per broadcast/individual message authored by an admin. Body is
// plain text (kept simple — no rich editor yet). `audience` is purely
// metadata; the actual recipient set lives in the join table below so
// "all" snapshots resolve to a concrete user list at send time.
export const adminMessagesTable = pgTable("admin_messages", {
  id: serial("id").primaryKey(),
  fromAdminId: integer("from_admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  fromAdminName: text("from_admin_name").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: adminMessageAudienceEnum("audience").notNull().default("selected"),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-recipient delivery record. `acknowledgedAt` flips to a timestamp
// when the user dismisses the popup; the admin dashboard reads this to
// show "X of Y acknowledged" + a list of who.
export const adminMessageRecipientsTable = pgTable("admin_message_recipients", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => adminMessagesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // One row per (message, user) pair — guards against double-sending.
  uniquePair: uniqueIndex("admin_message_recipients_unique").on(table.messageId, table.userId),
}));

export const insertAdminMessageSchema = createInsertSchema(adminMessagesTable).omit({ id: true, createdAt: true });
export type InsertAdminMessage = z.infer<typeof insertAdminMessageSchema>;
export type AdminMessage = typeof adminMessagesTable.$inferSelect;

export const insertAdminMessageRecipientSchema = createInsertSchema(adminMessageRecipientsTable).omit({ id: true, createdAt: true });
export type InsertAdminMessageRecipient = z.infer<typeof insertAdminMessageRecipientSchema>;
export type AdminMessageRecipient = typeof adminMessageRecipientsTable.$inferSelect;
