import { pgTable, serial, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One-time-passcode storage. Backed by Postgres rather than an in-memory
// Map so OTPs survive server restarts, work across multiple instances,
// and are auditable. The plaintext `code` is stored intentionally — the
// 6-digit space is brute-forceable in microseconds offline, so hashing
// would not raise the attacker's cost in a meaningful way; instead we
// rely on attempt counting + short expiry + rate-limiting at the route.
//
// Lifecycle:
//   1. POST /auth/otp/send → insert row (any old row for same key is replaced)
//   2. POST /auth/otp/verify → look up by (email, purpose), check expiry +
//      attempts, compare code, delete row on success or after MAX_ATTEMPTS
//   3. Periodic GC sweeps expired rows.
export const otpCodesTable = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(),
  code: text("code").notNull(),
  // Free-form payload — e.g. signup data the verify step needs to
  // complete account creation without a second roundtrip.
  data: jsonb("data"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Only one active OTP per (email, purpose) — re-sending replaces.
  uniqueKey: uniqueIndex("otp_codes_email_purpose_unique").on(table.email, table.purpose),
}));

export const insertOtpCodeSchema = createInsertSchema(otpCodesTable).omit({ id: true, createdAt: true });
export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;
export type OtpCode = typeof otpCodesTable.$inferSelect;
