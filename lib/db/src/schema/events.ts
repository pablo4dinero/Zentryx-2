import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const eventTypeEnum = pgEnum("event_type", [
  "general", "meeting", "workshop", "review", "celebration", "deadline", "training", "conference"
]);

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  location: text("location"),
  attendeeIds: integer("attendee_ids").array().notNull().default([]),
  createdById: integer("created_by_id").references(() => usersTable.id),
  eventType: eventTypeEnum("event_type").notNull().default("general"),
  color: text("color").notNull().default("#6c5ce7"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
