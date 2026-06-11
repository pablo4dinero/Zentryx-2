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

  const toggle = (path: string) =>
    setSelected(s => (s.includes(path) ? s.filter(p => p !== path) : [...s, path]));

  const save = async () => {
    setSaving(true);
    const ok = await setRoleModules(role.value, role.label, selected);
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
