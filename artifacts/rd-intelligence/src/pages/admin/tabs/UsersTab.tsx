import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users as UsersIcon, Lock, FileCheck2, ScrollText,
  Search, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, Activity, KeyRound, UserCheck, UserX,
  Crown, Mail, RefreshCw, Download, Globe,
  Megaphone, Send, Trash2, ChevronDown, ChevronRight,
  SlidersHorizontal, Save, Check, Pencil, X, Settings, Zap,
} from "lucide-react";
import { format, formatDistanceToNow, subHours, subDays, subMonths } from "date-fns";
import * as XLSX from "xlsx";
import { useGetCurrentUser } from "@/api-client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { roleLabel, useServerRoles, createCustomRole, ZENTRYX_MODULES, getEffectiveAllowedPaths, setRoleModules, renameRole } from "@/lib/roles";
import { BASE, apiHeaders, apiGet, apiPatch, apiPost, apiDelete } from "../lib/api";
const ADD_ROLE_SENTINEL = "__add_new_role__";

export function UsersTab({ isLight }: { isLight: boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  // Roles (built-ins + server-synced custom roles).
  const { roles: roleOptions, refresh: refreshRoles } = useServerRoles();
  // userId awaiting a brand-new role from the Add-Role modal.
  const [addRoleForUser, setAddRoleForUser] = useState<number | null>(null);
  // Departments for the department dropdown.
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try { setUsers((await apiGet("/admin/users")) || []); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    apiGet("/departments").then(d => { if (Array.isArray(d)) setDepartments(d); });
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter !== "all" && (u.role || "").toLowerCase() !== roleFilter) return false;
      if (!s) return true;
      return (u.name || "").toLowerCase().includes(s)
          || (u.email || "").toLowerCase().includes(s)
          || (u.department || "").toLowerCase().includes(s);
    });
  }, [users, search, roleFilter]);

  const patchUser = async (id: number, body: any) => {
    setSavingId(id);
    try {
      const updated = await apiPatch(`/admin/users/${id}`, body);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u));
    } finally { setSavingId(null); }
  };

  // Role dropdown change. "Add new role…" opens the modal (which lets the
  // admin pick the role's module access); otherwise just assign.
  const handleRoleChange = (userId: number, value: string) => {
    if (value === ADD_ROLE_SENTINEL) {
      setAddRoleForUser(userId);
      return;
    }
    patchUser(userId, { role: value });
  };

  // Called by the Add-Role modal once the role is created server-side.
  const handleRoleCreated = async (roleValue: string) => {
    await refreshRoles();
    if (addRoleForUser != null) await patchUser(addRoleForUser, { role: roleValue });
    setAddRoleForUser(null);
  };

  const resetPassword = async (id: number, name: string) => {
    if (!confirm(`Reset password for ${name}? A new temporary password will be generated.`)) return;
    const res = await apiPost(`/admin/users/${id}/reset-password`, {});
    if (res?.tempPassword) {
      alert(`Temporary password for ${name}:\n\n${res.tempPassword}\n\nShare this securely. The user should change it on next login.`);
    } else {
      alert("Password reset failed.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={cn("relative flex-1 max-w-md")}>
          <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", isLight ? "text-slate-400" : "text-muted-foreground")} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, department…"
            className={cn(
              "w-full h-10 rounded-xl border pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className={cn(
            "h-10 rounded-xl border px-3 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40",
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-black/20 border-white/10 text-foreground",
          )}
        >
          <option value="all">All Roles</option>
          {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button onClick={load} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border",
          isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        {loading && <div className={cn("p-6 text-center text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Loading users…</div>}
        {!loading && filtered.length === 0 && (
          <div className={cn("p-6 text-center text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>No users match.</div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className={cn("text-xs uppercase", isLight ? "bg-slate-50 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Job Position</th>
                  <th className="px-4 py-3 text-left font-medium">Department</th>
                  <th className="px-4 py-3 text-left font-medium">Last Login</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className={cn("border-t", isLight ? "border-slate-100 hover:bg-slate-50/50" : "border-white/5 hover:bg-white/[0.02]")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(u.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={cn("text-sm font-medium truncate", isLight ? "text-slate-900" : "text-foreground")}>{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        disabled={savingId === u.id}
                        className={cn(
                          "h-8 px-2 rounded-lg border text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40",
                          isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground",
                        )}
                      >
                        {/* If the user is on a value not in the current list
                            (legacy or a custom role from another browser),
                            surface it so the select shows their real role. */}
                        {!roleOptions.some(r => r.value === u.role) && (
                          <option value={u.role}>{roleLabel(u.role)}</option>
                        )}
                        {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        <option value={ADD_ROLE_SENTINEL}>+ Add new role…</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        defaultValue={u.jobPosition || ""}
                        onBlur={e => { if (e.target.value !== (u.jobPosition || "")) patchUser(u.id, { jobPosition: e.target.value }); }}
                        placeholder="—"
                        className={cn(
                          "h-8 px-2 rounded-lg border text-xs w-36 focus:outline-none focus:ring-1 focus:ring-primary/40",
                          isLight ? "bg-white border-slate-200 text-slate-700 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
                        )}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.department || ""}
                        onChange={e => patchUser(u.id, { department: e.target.value })}
                        disabled={savingId === u.id}
                        className={cn(
                          "h-8 px-2 rounded-lg border text-xs w-40 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40",
                          isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground",
                        )}
                      >
                        <option value="">— None —</option>
                        {/* Surface the user's current value even if it's not
                            in the departments list (so it isn't silently lost). */}
                        {u.department && !departments.some(d => d.name === u.department) && (
                          <option value={u.department}>{u.department}</option>
                        )}
                        {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
                        {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : "Never"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => patchUser(u.id, { isActive: !u.isActive })}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors",
                          u.isActive
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                            : "border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20",
                        )}
                      >
                        {u.isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                        {u.isActive ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => resetPassword(u.id, u.name)}
                        title="Reset password"
                        className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors",
                          isLight ? "text-slate-500 hover:text-slate-900 hover:bg-slate-100" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                        )}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addRoleForUser != null && (
        <AddRoleModal
          isLight={isLight}
          onClose={() => setAddRoleForUser(null)}
          onCreated={handleRoleCreated}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Custom Role modal — name + explicit module allow-list
// ─────────────────────────────────────────────────────────────────────────────
function AddRoleModal({ isLight, onClose, onCreated }: {
  isLight: boolean;
  onClose: () => void;
  onCreated: (roleValue: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<string[]>([]); // Option A: start with nothing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (path: string) =>
    setSelected(s => s.includes(path) ? s.filter(p => p !== path) : [...s, path]);

  const save = async () => {
    if (!label.trim()) { setError("Give the role a name."); return; }
    setSaving(true);
    setError("");
    const created = await createCustomRole(label.trim(), selected);
    setSaving(false);
    if (!created) { setError("Could not create the role. A role with that name may already exist."); return; }
    onCreated(created.value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={cn("w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]", isLight ? "bg-white border-slate-200" : "bg-[#1a1a2e] border-white/10")}
      >
        <div className={cn("px-5 py-4 border-b", isLight ? "border-slate-100" : "border-white/10")}>
          <p className={cn("font-semibold text-base", isLight ? "text-slate-900" : "text-foreground")}>Add a new role</p>
          <p className={cn("text-xs mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>
            Pick exactly which modules this role can see. Nothing is granted by default. The Admin Dashboard is never available to custom roles, and everyone always keeps their own Profile.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto custom-scrollbar space-y-4">
          <div>
            <label className={cn("text-xs font-medium mb-1 block", isLight ? "text-slate-700" : "text-muted-foreground")}>Role name</label>
            <input
              autoFocus
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Marketing Lead"
              className={cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
                isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground")}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={cn("text-xs font-medium", isLight ? "text-slate-700" : "text-muted-foreground")}>Modules this role can access</label>
              <span className={cn("text-[10px]", isLight ? "text-slate-400" : "text-muted-foreground")}>{selected.length} selected</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ZENTRYX_MODULES.map(m => {
                const checked = selected.includes(m.path);
                return (
                  <label key={m.path} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors border",
                    checked
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-foreground hover:bg-white/5",
                  )}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(m.path)} className="accent-primary" />
                    {m.label}
                  </label>
                );
              })}
            </div>
            <p className={cn("text-[10px] mt-2", isLight ? "text-slate-400" : "text-muted-foreground")}>
              If this role gets Sales Force, members see only accounts they're tagged on (same as Sales Team).
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className={cn("px-5 py-4 border-t flex justify-end gap-2", isLight ? "border-slate-100 bg-slate-50" : "border-white/10 bg-white/[0.02]")}>
          <button onClick={onClose} className={cn("px-4 py-2 rounded-xl text-sm font-medium", isLight ? "text-slate-600 hover:bg-slate-100" : "text-muted-foreground hover:bg-white/5")}>Cancel</button>
          <button
            onClick={save}
            disabled={saving || !label.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create &amp; assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles & Access — per-role module visibility editor
// ─────────────────────────────────────────────────────────────────────────────
