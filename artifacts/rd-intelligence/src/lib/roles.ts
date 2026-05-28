// Single source of truth for Zentryx's consolidated system roles.
// Phase 1 reduced 16 legacy roles to these 9. Any UI that shows a role
// dropdown or label MUST import from here so the lists never drift apart
// again (the drift caused the "everyone shows as Admin" bug where the
// Admin Dashboard's stale dropdown couldn't display the new role values).

export interface RoleDef {
  value: string;
  label: string;
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

// Legacy → display-label map so old role values still render with a
// friendly name during/after migration (a user briefly on a legacy
// value won't show a raw underscore string).
const LEGACY_LABELS: Record<string, string> = {
  ceo: "Executive",
  managing_director: "Executive",
  head_of_product_development: "Manager",
  head_of_department: "Manager",
  key_account_manager: "Sales Team",
  senior_key_account_manager: "Sales Team",
  customer_service_lead: "Sales Team",
  commercial_team: "Sales Team", // renamed → sales_team
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

// ── Custom roles ──────────────────────────────────────────────────────
// Admins can add their own roles beyond the 9 built-ins. Custom roles are
// stored in localStorage (shared key with the Team Directory so both the
// Admin Dashboard and Team Directory show the same list). A custom role
// has no special permissions — it falls through to the safe viewer-level
// baseline in getBlockedPaths until a developer maps it explicitly.
const CUSTOM_ROLES_KEY = "zentryx_custom_roles";

export function getCustomRoles(): RoleDef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_ROLES_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((r: any) => r && typeof r.value === "string" && typeof r.label === "string");
  } catch {
    return [];
  }
}

/** Add a custom role from a free-text label. Returns the new role. */
export function addCustomRole(label: string): RoleDef {
  const trimmed = label.trim();
  const value = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const next = { value, label: trimmed };
  const existing = getCustomRoles();
  // Don't duplicate a value that's already built-in or custom.
  if (![...ZENTRYX_ROLES, ...existing].some(r => r.value === value)) {
    localStorage.setItem(CUSTOM_ROLES_KEY, JSON.stringify([...existing, next]));
  }
  return next;
}

/** The full role list: 9 built-ins + any custom roles the admin added. */
export function getAllRoles(): RoleDef[] {
  const custom = getCustomRoles().filter(c => !ZENTRYX_ROLES.some(r => r.value === c.value));
  return [...ZENTRYX_ROLES, ...custom];
}

/** Human-friendly label for any role value, new / legacy / custom. */
export function roleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const exact = ZENTRYX_ROLES.find(r => r.value === value);
  if (exact) return exact.label;
  const custom = getCustomRoles().find(r => r.value === value);
  if (custom) return custom.label;
  if (LEGACY_LABELS[value]) return LEGACY_LABELS[value];
  // Last-resort: prettify the raw value.
  return value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
