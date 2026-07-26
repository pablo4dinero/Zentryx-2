import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const weeklyDigestsTable = pgTable("weekly_digests", {
  id: serial("id").primaryKey(),
  weekStartDate: text("week_start_date").notNull(),
  weekEndDate: text("week_end_date").notNull(),
  briefText: text("brief_text").notNull(),
  sections: jsonb("sections").notNull().default({}),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WeeklyDigest = typeof weeklyDigestsTable.$inferSelect;
