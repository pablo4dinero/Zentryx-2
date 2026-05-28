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

/** Human-friendly label for any role value, new or legacy. */
export function roleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const exact = ZENTRYX_ROLES.find(r => r.value === value);
  if (exact) return exact.label;
  if (LEGACY_LABELS[value]) return LEGACY_LABELS[value];
  // Last-resort: prettify the raw value.
  return value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
