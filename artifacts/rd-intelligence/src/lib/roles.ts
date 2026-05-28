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

/** Built-ins + server custom roles. */
export function getAllRoles(): RoleDef[] {
  const custom = _customRoles.filter(c => !ZENTRYX_ROLES.some(r => r.value === c.value));
  return [...ZENTRYX_ROLES, ...custom.map(c => ({ value: c.value, label: c.label }))];
}

/** Human-friendly label for any role value — built-in, legacy, or custom. */
export function roleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const exact = ZENTRYX_ROLES.find(r => r.value === value);
  if (exact) return exact.label;
  const custom = _customRoles.find(r => r.value === value);
  if (custom) return custom.label;
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
