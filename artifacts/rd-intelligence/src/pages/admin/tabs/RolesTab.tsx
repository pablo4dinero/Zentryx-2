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
import { roleLabel, useServerRoles, createCustomRole, ZENTRYX_MODULES, getEffectiveAllowedPaths, setRoleModules, renameRole, MODULE_SECTIONS } from "@/lib/roles";
import { BASE, apiHeaders, apiGet, apiPatch, apiPost, apiDelete } from "../lib/api";

export function RolesTab({ isLight }: { isLight: boolean }) {
  const { roles, version, refresh } = useServerRoles();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border p-4 text-sm flex items-start gap-3",
        isLight ? "border-slate-200 bg-slate-50 text-slate-600" : "border-white/10 bg-white/[0.02] text-muted-foreground")}>
        <SlidersHorizontal className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <div>
          <p className={cn("font-medium", isLight ? "text-slate-900" : "text-foreground")}>Module visibility per role</p>
          <p className="mt-0.5">
            Tick which modules each role can see in the sidebar. Changes apply to everyone on that role and sync to all browsers. The <strong>Admin</strong> role always keeps full access. The Admin Dashboard itself is never grantable to other roles, and everyone always keeps their own Profile.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {roles.map(role => (
          <RoleAccessRow
            key={role.value}
            role={role}
            isLight={isLight}
            expanded={expanded === role.value}
            onToggleExpand={() => setExpanded(e => (e === role.value ? null : role.value))}
            onSaved={refresh}
            cacheVersion={version}
          />
        ))}
      </div>
    </div>
  );
}

function RoleAccessRow({ role, isLight, expanded, onToggleExpand, onSaved, cacheVersion }: {
  role: { value: string; label: string };
  isLight: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSaved: () => Promise<void> | void;
  cacheVersion: number;
}) {
  const isAdminRole = role.value === "admin";
  const [selected, setSelected] = useState<string[]>(() => getEffectiveAllowedPaths(role.value));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Inline rename state.
  const [editingName, setEditingName] = useState(false);
  const [draftLabel, setDraftLabel] = useState(role.label);
  const [renaming, setRenaming] = useState(false);

  // Re-sync ticks whenever the role cache changes (server roles finished
  // loading, or another role was just saved).
  useEffect(() => {
    setSelected(getEffectiveAllowedPaths(role.value));
    if (!editingName) setDraftLabel(role.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheVersion, role.value, role.label]);

  const toggle = (path: string) => {
    setSelected(s => {
      if (s.includes(path)) {
        // Removing a module: also remove all its section paths
        return s.filter(p => p !== path && !p.startsWith(`${path}/`));
      }
      return [...s, path];
    });
  };

  // ── Section helpers ──────────────────────────────────────────────────────
  /** True when the section is effectively visible (explicitly in selected, or no section config = all visible). */
  const isSectionSelected = (modulePath: string, sectionValue: string): boolean => {
    const prefix = `${modulePath}/`;
    const hasAny = selected.some(p => p.startsWith(prefix));
    if (!hasAny) return true; // default: all visible
    return selected.includes(`${prefix}${sectionValue}`);
  };

  /** Toggle one section. On first restriction, stores ALL remaining sections explicitly. */
  const toggleSection = (modulePath: string, sectionValue: string) => {
    const sectionPath = `${modulePath}/${sectionValue}`;
    const prefix = `${modulePath}/`;
    const sections = MODULE_SECTIONS[modulePath] ?? [];
    const hasAny = selected.some(p => p.startsWith(prefix));

    if (!hasAny) {
      // Going from "all visible" → explicit: store every section EXCEPT the one being unchecked
      const rest = sections
        .filter(s => s.value !== sectionValue)
        .map(s => `${modulePath}/${s.value}`);
      setSelected(s => [...s, ...rest]);
    } else if (selected.includes(sectionPath)) {
      setSelected(s => s.filter(p => p !== sectionPath));
    } else {
      setSelected(s => [...s, sectionPath]);
    }
  };

  const selectAllSections = (modulePath: string) => {
    // All sections visible = remove all section paths (no restriction)
    setSelected(s => s.filter(p => !p.startsWith(`${modulePath}/`)));
  };

  const clearAllSections = (modulePath: string) => {
    // No sections visible = keep only section paths that are empty (edge case — just clear all)
    // Since 0 stored paths = all visible, we encode "none" by removing the module path too.
    // Practical choice: clear just means "no section paths" which reverts to "all visible".
    // To prevent confusion, remove the module path as well so the user knows to re-enable.
    setSelected(s => s.filter(p => p !== modulePath && !p.startsWith(`${modulePath}/`)));
  };

  const normalize = (paths: string[]): string[] => {
    // If ALL sections for a module are stored, remove them (redundant — all visible by default)
    let result = [...paths];
    for (const [modulePath, sections] of Object.entries(MODULE_SECTIONS)) {
      const prefix = `${modulePath}/`;
      const stored = result.filter(p => p.startsWith(prefix));
      if (stored.length > 0 && stored.length === sections.length) {
        result = result.filter(p => !p.startsWith(prefix));
      }
    }
    return result;
  };

  const save = async () => {
    setSaving(true);
    const ok = await setRoleModules(role.value, role.label, normalize(selected));
    setSaving(false);
    if (ok) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      await onSaved();
    }
  };

  const startEdit = () => { setDraftLabel(role.label); setEditingName(true); };
  const cancelEdit = () => { setEditingName(false); setDraftLabel(role.label); };
  const saveRename = async () => {
    const next = draftLabel.trim();
    if (!next || next === role.label) { cancelEdit(); return; }
    setRenaming(true);
    const ok = await renameRole(role.value, next);
    setRenaming(false);
    if (ok) { setEditingName(false); await onSaved(); }
  };

  return (
    <div className={cn("rounded-xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/[0.02]")}>
      <div className={cn("w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors",
        !editingName && (isLight ? "hover:bg-slate-50" : "hover:bg-white/5"))}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button onClick={onToggleExpand} className="p-0.5 shrink-0" aria-label={expanded ? "Collapse" : "Expand"}>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
          {editingName ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                autoFocus
                value={draftLabel}
                onChange={e => setDraftLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") cancelEdit(); }}
                className={cn("h-8 px-2 rounded-lg border text-sm flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-primary/40",
                  isLight ? "bg-white border-slate-200 text-slate-900" : "bg-black/20 border-white/10 text-foreground")}
              />
              <button onClick={saveRename} disabled={renaming} title="Save name"
                className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 shrink-0">
                {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={cancelEdit} title="Cancel"
                className={cn("p-1.5 rounded-lg shrink-0", isLight ? "text-slate-500 hover:bg-slate-100" : "text-muted-foreground hover:bg-white/5")}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <button onClick={onToggleExpand} className={cn("font-medium truncate text-left", isLight ? "text-slate-900" : "text-foreground")}>
                {role.label}
              </button>
              {isAdminRole && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">Full access</span>
              )}
              <button onClick={startEdit} title="Rename role"
                className={cn("p-1 rounded-md shrink-0 transition-colors", isLight ? "text-slate-400 hover:text-slate-900 hover:bg-slate-100" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
        {!editingName && (
          <button onClick={onToggleExpand} className={cn("text-xs shrink-0", isLight ? "text-slate-500" : "text-muted-foreground")}>
            {isAdminRole ? "All modules" : `${selected.length} / ${ZENTRYX_MODULES.length} modules`}
          </button>
        )}
      </div>

      {expanded && (
        <div className={cn("px-4 pb-4 border-t", isLight ? "border-slate-100" : "border-white/10")}>
          {isAdminRole ? (
            <p className={cn("text-xs mt-3", isLight ? "text-slate-500" : "text-muted-foreground")}>
              The Admin role always has full access to every module, including this dashboard. It can't be restricted — this prevents an admin from accidentally locking themselves out.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mt-3 mb-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelected(ZENTRYX_MODULES.map(m => m.path))} className="text-[11px] text-primary hover:underline">Select all</button>
                  <button onClick={() => setSelected([])} className={cn("text-[11px]", isLight ? "text-slate-500 hover:text-slate-900" : "text-muted-foreground hover:text-foreground")}>Clear</button>
                </div>
                <span className={cn("text-[10px]", isLight ? "text-slate-400" : "text-muted-foreground")}>{selected.length} selected</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {ZENTRYX_MODULES.map(m => {
                  const checked = selected.includes(m.path);
                  const hasSections = !!MODULE_SECTIONS[m.path];
                  const prefix = `${m.path}/`;
                  const storedSections = selected.filter(p => p.startsWith(prefix));
                  const totalSections = MODULE_SECTIONS[m.path]?.length ?? 0;
                  const effectiveSectionCount = storedSections.length === 0
                    ? totalSections          // all visible (no restriction)
                    : storedSections.length; // explicit subset

                  return (
                    <label key={m.path} className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors border",
                      checked
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-foreground hover:bg-white/5",
                    )}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(m.path)} className="accent-primary" />
                      <span className="flex-1">{m.label}</span>
                      {checked && hasSections && (
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0",
                          storedSections.length > 0 && storedSections.length < totalSections
                            ? "bg-amber-500/20 text-amber-600"
                            : "bg-primary/20 text-primary"
                        )}>
                          {effectiveSectionCount}/{totalSections}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className={cn("text-[10px] mt-2", isLight ? "text-slate-400" : "text-muted-foreground")}>
                If this role gets Sales Force, members see only accounts they're tagged on (same as Sales Team).
              </p>

              {/* ── Section-level access control ──────────────────────────── */}
              {(() => {
                const configurableModules = ZENTRYX_MODULES.filter(
                  m => selected.includes(m.path) && MODULE_SECTIONS[m.path]
                );
                if (configurableModules.length === 0) return null;
                return (
                  <div className={cn("mt-4 rounded-xl border p-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/[0.07] bg-white/[0.02]")}>
                    <p className={cn("text-[11px] font-semibold uppercase tracking-wider mb-3", isLight ? "text-slate-500" : "text-muted-foreground")}>
                      Section Access — restrict which tabs are visible within each module
                    </p>
                    <div className="space-y-4">
                      {configurableModules.map(m => {
                        const sections = MODULE_SECTIONS[m.path]!;
                        const prefix = `${m.path}/`;
                        const hasAnySection = selected.some(p => p.startsWith(prefix));
                        return (
                          <div key={m.path}>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className={cn("text-xs font-medium", isLight ? "text-slate-800" : "text-foreground")}>{m.label}</p>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => selectAllSections(m.path)}
                                  className="text-[10px] text-primary hover:underline"
                                >All</button>
                                <button
                                  type="button"
                                  onClick={() => clearAllSections(m.path)}
                                  className={cn("text-[10px] hover:underline", isLight ? "text-slate-500" : "text-muted-foreground")}
                                >None</button>
                              </div>
                            </div>
                            {!hasAnySection && (
                              <p className={cn("text-[10px] mb-1.5", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                                All sections currently visible — uncheck specific sections to restrict access
                              </p>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                              {sections.map(s => {
                                const sChecked = isSectionSelected(m.path, s.value);
                                return (
                                  <label key={s.value} className={cn(
                                    "flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-[11px] transition-colors border",
                                    sChecked
                                      ? isLight ? "bg-primary/10 border-primary/20 text-primary" : "bg-primary/10 border-primary/20 text-primary"
                                      : isLight ? "border-slate-200 text-slate-500 hover:bg-slate-100" : "border-white/5 text-muted-foreground hover:bg-white/5",
                                  )}>
                                    <input
                                      type="checkbox"
                                      checked={sChecked}
                                      onChange={() => toggleSection(m.path, s.value)}
                                      className="accent-primary"
                                    />
                                    {s.label}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end mt-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors",
                    justSaved ? "bg-emerald-500 text-white" : "bg-primary text-white hover:bg-primary/90")}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : justSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {justSaved ? "Saved" : "Save changes"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security & Logins
// ─────────────────────────────────────────────────────────────────────────────
