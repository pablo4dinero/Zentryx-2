import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const chatMessageTypeEnum = pgEnum("chat_message_type", [
  "text", "image", "voice_note"
]);

export const chatRoomsTable = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isGroup: boolean("is_group").notNull().default(true),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatRoomMembersTable = pgTable("chat_room_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  messageType: chatMessageTypeEnum("message_type").notNull().default("text"),
  content: text("content"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatReadReceiptsTable = pgTable("chat_read_receipts", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  lastReadMessageId: integer("last_read_message_id"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertChatRoomSchema = createInsertSchema(chatRoomsTable).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatRoom = z.infer<typeof insertChatRoomSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatRoom = typeof chatRoomsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
