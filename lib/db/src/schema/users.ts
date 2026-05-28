import { pgTable, serial, text, boolean, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Note: the legacy 16-role enum is still here for backwards compatibility.
// Chunk 4 of Phase 1 will run a migration that consolidates these into
// 9 roles (admin, executive, manager, commercial_team, npd_team,
// operations_team, qc_team, support_staff, viewer). The new values are
// added below alongside the legacy ones so the migration can flip users
// one by one without dropping the column.
export const userRoleEnum = pgEnum("user_role", [
  // Legacy values (will be migrated away in chunk 4)
  "admin",
  "manager",
  "ceo",
  "npd_technologist",
  "head_of_product_development",
  "head_of_department",
  "key_account_manager",
  "senior_key_account_manager",
  "project_manager",
  "procurement",
  "scientist",
  "analyst",
  "hr",
  "quality_control",
  "graphics_designer",
  "viewer",
  // New consolidated values (Phase 1 chunk 4 target list)
  "executive",
  "commercial_team",
  "npd_team",
  "operations_team",
  "qc_team",
  "support_staff",
]);

// Approval lifecycle for newly-created accounts. `approved` is the only
// state that grants login access. New OAuth signups and `/register`
// signups both default to `pending` and need admin approval before they
// can log in. Existing users are backfilled to `approved` via the SQL
// migration so we don't accidentally lock everyone out.
export const userApprovalStatusEnum = pgEnum("user_approval_status", [
  "pending",
  "approved",
  "denied",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("viewer"),
  department: text("department"),
  jobPosition: text("job_position"),
  phone: text("phone"),
  country: text("country"),
  avatar: text("avatar"),
  isActive: boolean("is_active").notNull().default(true),
  smsVerifiedAt: timestamp("sms_verified_at"),

  // ─── First-time admin approval ────────────────────────────────────
  approvalStatus: userApprovalStatusEnum("approval_status").notNull().default("approved"),
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  deniedReason: text("denied_reason"),

  // ─── TOTP MFA enrollment state ────────────────────────────────────
  // mfaSecret is the base32 shared secret. Null = user has not yet
  // enrolled. Stored as-is for now; future hardening can switch to
  // application-level encryption.
  mfaSecret: text("mfa_secret"),
  mfaEnrolledAt: timestamp("mfa_enrolled_at"),
  // backupCodes is a JSON array of bcrypt-hashed codes. We never store
  // backup codes in plaintext; the user sees them once at enrollment
  // time and must save them externally.
  mfaBackupCodes: jsonb("mfa_backup_codes").$type<string[]>(),
  // Per-session failure counter — resets on success, gates the
  // "show fallback options" UI once it reaches 3.
  mfaFailedAttempts: integer("mfa_failed_attempts").notNull().default(0),

  // ─── Admin emergency one-time login token ─────────────────────────
  // When an admin grants emergency MFA bypass, we set these. The token
  // is hashed (bcrypt); the user uses it once and then MUST re-enroll.
  emergencyLoginTokenHash: text("emergency_login_token_hash"),
  emergencyLoginExpires: timestamp("emergency_login_expires"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
