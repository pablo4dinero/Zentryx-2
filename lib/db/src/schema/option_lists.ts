import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Generic server-synced list store. Holds editable picklists used across the
 * app — project stages, statuses, priorities, etc. — so every client sees the
 * same set instead of each browser keeping its own localStorage copy.
 *
 * Each row is one option under one list_key. The (list_key, name) pair is
 * unique. Add/rename/delete is exposed via /api/option-lists/:listKey.
 */
export const optionListsTable = pgTable(
  "option_lists",
  {
    id: serial("id").primaryKey(),
    listKey: text("list_key").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  table => ({
    listKeyNameUniq: uniqueIndex("option_lists_list_key_name_unique").on(table.listKey, table.name),
  }),
);

export type OptionListEntry = typeof optionListsTable.$inferSelect;
