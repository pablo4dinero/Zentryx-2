import { useEffect, useState } from "react";

// Single source of truth for Zentryx's roles + module list.
// Built-in roles are fixed (drive hardcoded permissions). Custom roles
// are admin-defined, server-synced, and carry an explicit module
// allow-list so no code change is needed to grant access.

const BASE = import.meta.env.BASE_URL;

export interface RoleDef {
  value: string;
  label: string;
}

export interface CustomRole extends RoleDef {
  allowedPaths: string[];
}

export const ZENTRYX_ROLES: RoleDef[] = [
  { value: "admin", label: "Admin" },
  { value: "executive", label: "Executive" },
  { value: "manager", label: "Manager" },
  { value: "sales_team", label: "Sales Team" },
  { value: "npd_team", label: "NPD Team" },
  { value: "operations_team", label: "Operations Team" },
  { value: "qc_team", label: "QC Team" },
  { value: "support_staff", label: "Support Staff" },
  { value: "viewer", label: "Viewer" },
];

// The modules a custom role can be granted. /admin is intentionally
// excluded — the Admin Dashboard is reserved for the built-in admin role.
// /profile is intentionally excluded too — every user always keeps access
// to their own profile (can't be locked out of their MFA settings).
export const ZENTRYX_MODULES: { path: string; label: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/news-feed", label: "News Feed" },
  { path: "/projects", label: "Project Portfolio" },
  { path: "/analytics", label: "Analytics" },
  { path: "/oracle", label: "Oracle" },
  { path: "/weekly-activities", label: "Weekly Activities" },
  { path: "/business-dev", label: "Business Development" },
  { path: "/sales-force", label: "Sales Force" },
  { path: "/materials-demand-planning", label: "Materials & Demand Planning" },
  { path: "/strategy-evaluator", label: "Strategy Evaluator" },
  { path: "/procurement", label: "Procurement" },
  { path: "/team", label: "Team Directory" },
  { path: "/events", label: "Events" },
  { path: "/activity", label: "Activity Feed" },
  { path: "/chat", label: "Chat Room" },
];

// Module paths that every authenticated user always keeps, regardless of
// role — so a custom role with zero modules still isn't fully locked out.
export const ALWAYS_ALLOWED_PATHS = ["/profile"];

const LEGACY_LABELS: Record<string, string> = {
  ceo: "Executive",
  managing_director: "Executive",
  head_of_product_development: "Manager",
  head_of_department: "Manager",
  key_account_manager: "Sales Team",
  senior_key_account_manager: "Sales Team",
  customer_service_lead: "Sales Team",
  commercial_team: "Sales Team",
  npd_technologist: "NPD Team",
  scientist: "NPD Team",
  project_manager: "NPD Team",
  procurement: "Operations Team",
  materials_demand_planner: "Operations Team",
  quality_control: "QC Team",
  hr: "Support Staff",
  graphics_designer: "Support Staff",
  analyst: "Viewer",
};

// ── Server-synced custom roles ─────────────────────────────────────────
// A module-level cache so synchronous helpers (roleLabel, getBlockedPaths)
// can read custom roles without prop-drilling. The useServerRoles() hook
// keeps it fresh.
let _customRoles: CustomRole[] = [];

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}` };
}

export async function refreshCustomRoles(): Promise<CustomRole[]> {
  try {
    const res = await fetch(`${BASE}api/custom-roles`, { headers: authHeaders() });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        _customRoles = rows.map((r: any) => ({
          value: r.value,
          label: r.label,
          allowedPaths: Array.isArray(r.allowedPaths) ? r.allowedPaths : [],
        }));
      }
    }
  } catch { /* keep prior cache */ }
  return _customRoles;
}

export function getCachedCustomRoles(): CustomRole[] {
  return _customRoles;
}

/** Allowed module paths for a custom role, or null if not a custom role. */
export function getCustomRoleAllowedPaths(roleValue: string | null | undefined): string[] | null {
  if (!roleValue) return null;
  const found = _customRoles.find(r => r.value === roleValue);
  return found ? found.allowedPaths : null;
}

export async function createCustomRole(label: string, allowedPaths: string[]): Promise<CustomRole | null> {
  try {
    const res = await fetch(`${BASE}api/custom-roles`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ label, allowedPaths }),
    });
    if (!res.ok) return null;
    const row = await res.json();
    await refreshCustomRoles();
    return { value: row.value, label: row.label, allowedPaths: row.allowedPaths || [] };
  } catch {
    return null;
  }
}

/**
 * Set the visible-module allow-list for ANY role (built-in or custom).
 * Used by the Role Editor. Upserts the row server-side keyed by the role
 * value, then refreshes the cache so resolution updates everywhere.
 * The "admin" role is rejected server-side (always full access).
 */
export async function setRoleModules(value: string, label: string, allowedPaths: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}api/custom-roles/${encodeURIComponent(value)}`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ label, allowedPaths }),
    });
    if (!res.ok) return false;
    await refreshCustomRoles();
    return true;
  } catch {
    return false;
  }
}

/**
 * Rename ANY role (built-in or custom). Only the display label changes;
 * the `value` identifier all logic keys off stays fixed. Module access is
 * preserved — we seed the row with the role's current effective modules so
 * a first-time rename of a built-in doesn't accidentally restrict it.
 */
export async function renameRole(value: string, label: string): Promise<boolean> {
  return setRoleModules(value, label, getEffectiveAllowedPaths(value));
}

/** Built-ins (with any stored label override applied) + server custom roles. */
export function getAllRoles(): RoleDef[] {
  const builtins = ZENTRYX_ROLES.map(r => {
    const override = _customRoles.find(c => c.value === r.value);
    return override ? { value: r.value, label: override.label } : r;
  });
  const custom = _customRoles.filter(c => !ZENTRYX_ROLES.some(r => r.value === c.value));
  return [...builtins, ...custom.map(c => ({ value: c.value, label: c.label }))];
}

/** Human-friendly label for any role value — built-in, legacy, or custom. */
export function roleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  // A stored override (custom role OR a renamed built-in) wins so renames
  // show up everywhere the label is displayed.
  const override = _customRoles.find(r => r.value === value);
  if (override) return override.label;
  const exact = ZENTRYX_ROLES.find(r => r.value === value);
  if (exact) return exact.label;
  if (LEGACY_LABELS[value]) return LEGACY_LABELS[value];
  return value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Hook that loads the server custom roles into the cache and exposes a
 * `version` that bumps on refresh so consumers re-render. Returns the
 * combined role list for dropdowns.
 */
export function useServerRoles() {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    await refreshCustomRoles();
    setVersion(v => v + 1);
  };
  useEffect(() => {
    let active = true;
    refreshCustomRoles().finally(() => { if (active) { setLoading(false); setVersion(v => v + 1); } });
    return () => { active = false; };
  }, []);
  return { roles: getAllRoles(), customRoles: getCachedCustomRoles(), version, loading, refresh };
}

// ── Module visibility resolution ───────────────────────────────────────
// Single source of truth for "which modules can a role see". Consumed by
// AppLayout (to build the nav + redirect guard) and by the Role Editor
// (to show current ticks). Built on top of the server-synced custom-role
// allow-lists above, with hardcoded defaults for the built-in tiers.

// Every toggleable module path (mirrors ZENTRYX_MODULES).
export const ALL_MODULE_PATHS: string[] = ZENTRYX_MODULES.map(m => m.path);

// The default viewer-level lockout used as the catch-all fallback.
const RESTRICTED_PATHS = ["/sales-force", "/projects", "/weekly-activities", "/business-dev", "/procurement", "/materials-demand-planning", "/strategy-evaluator"];

/**
 * Module paths a role is NOT allowed to see. /admin is always blocked
 * unless the role is the literal "admin". When a role has an explicit
 * server-synced allow-list (custom role OR a built-in configured via the
 * Role Editor), that list is authoritative — everything not in it is
 * blocked. Otherwise the hardcoded built-in tiers apply.
 */
export function getBlockedPaths(role: string, jobPos: string): string[] {
  const r = (role || "viewer").toLowerCase();
  const jp = (jobPos || "").toLowerCase();

  // Admin always has full access and can never be restricted — short
  // circuit before any allow-list/override logic to prevent lockout.
  if (r === "admin") return [];

  const adminBlock = ["/admin"];

  // ── Explicit allow-list (admin-defined, server-synced) ────────────
  // Applies to custom roles AND built-in roles configured in the Role
  // Editor. Block every module NOT in the allow-list. /admin always
  // blocked, /profile always allowed (never in ALL_MODULE_PATHS).
  const explicitAllowed = getCustomRoleAllowedPaths(r);
  if (explicitAllowed) {
    const blocked = ALL_MODULE_PATHS.filter(p => !explicitAllowed.includes(p));
    return [...adminBlock, ...blocked];
  }

  // Privileged tiers — see everything (minus /admin). Post-Phase-1:
  // executive / manager. Legacy values kept for migration-safety.
  const privileged =
    ["executive", "manager", "ceo", "managing_director"].includes(r)
    || r.includes("head")
    || jp.includes("head") || jp.includes("ceo") || jp.includes("admin") || jp.includes("manager") || jp.includes("director");
  if (privileged) return [...adminBlock];

  // ── Consolidated 9-role tiers ─────────────────────────────────────
  if (r === "sales_team" || r === "commercial_team") return [...adminBlock, "/projects", "/weekly-activities", "/procurement"];
  if (r === "npd_team") return [...adminBlock, "/sales-force"];
  if (r === "operations_team") return [...adminBlock, "/sales-force", "/projects", "/business-dev"];
  if (r === "qc_team") return [...adminBlock, "/sales-force", "/business-dev"];
  if (r === "support_staff") return [...adminBlock, "/sales-force", "/projects", "/business-dev", "/procurement", "/materials-demand-planning", "/strategy-evaluator"];

  // ── Legacy values (migration-safety) ──────────────────────────────
  if (r === "viewer") return [...adminBlock, "/sales-force", "/materials-demand-planning", "/strategy-evaluator", "/projects", "/weekly-activities", "/business-dev", "/procurement"];
  if (r === "npd_technologist") return [...adminBlock, "/sales-force"];
  if (["key_account_manager", "senior_key_account_manager"].includes(r)) return [...adminBlock, "/projects", "/weekly-activities", "/business-dev", "/procurement"];
  if (r === "procurement" || jp.includes("procurement")) return [...adminBlock, "/sales-force", "/projects", "/business-dev"];

  // Catch-all (graphics_designer, hr, unknown) — viewer fallback.
  return [...adminBlock, ...RESTRICTED_PATHS];
}

/**
 * The modules a role can currently see, as an allow-list. Inverse of
 * getBlockedPaths over ALL_MODULE_PATHS. Used by the Role Editor to
 * pre-tick the current state (covers both explicit allow-lists and the
 * built-in defaults uniformly).
 */
export function getEffectiveAllowedPaths(roleValue: string, jobPos = ""): string[] {
  const blocked = getBlockedPaths(roleValue, jobPos);
  return ALL_MODULE_PATHS.filter(p => !blocked.includes(p));
}
