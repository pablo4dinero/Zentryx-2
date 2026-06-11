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

export function ApprovalsTab({ isLight }: { isLight: boolean }) {
  const [subTab, setSubTab] = useState<"exports" | "access" | "new-users">("new-users");
  const [exports, setExports] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [newUsers, setNewUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [denyTargetId, setDenyTargetId] = useState<number | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      if (subTab === "exports") setExports((await apiGet("/admin/approvals/exports")) || []);
      else if (subTab === "access") setAccess((await apiGet("/admin/approvals/access")) || []);
      else setNewUsers((await apiGet("/admin/pending-approvals")) || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [subTab]);

  const approveNewUser = async (id: number) => {
    await apiPost(`/admin/users/${id}/approve`, {});
    await load();
  };
  const denyNewUser = async (id: number) => {
    if (!denyReason.trim()) return;
    await apiPost(`/admin/users/${id}/deny`, { reason: denyReason.trim() });
    setDenyTargetId(null);
    setDenyReason("");
    await load();
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: "border-amber-500/30 bg-amber-500/10 text-amber-500",
      approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
      denied: "border-rose-500/30 bg-rose-500/10 text-rose-500",
      fulfilled: "border-blue-500/30 bg-blue-500/10 text-blue-500",
    };
    const Icon = s === "approved" || s === "fulfilled" ? CheckCircle2 : s === "denied" ? XCircle : Clock;
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", colors[s] || "border-white/10 text-muted-foreground")}>
        <Icon className="w-3 h-3" /> {s}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["new-users", "exports", "access"] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors capitalize",
              subTab === t
                ? "bg-primary text-white border-primary"
                : isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}>
            {t === "exports" ? "Export Requests" : t === "access" ? "Access Requests (legacy)" : `New Users (${newUsers.length || 0})`}
          </button>
        ))}
      </div>

      {subTab === "new-users" && (
        <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
          {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && newUsers.length === 0 && (
            <div className="p-8 text-center">
              <UserCheck className={cn("w-8 h-8 mx-auto mb-2", isLight ? "text-slate-300" : "text-muted-foreground/40")} />
              <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>No new users awaiting approval.</p>
            </div>
          )}
          {!loading && newUsers.length > 0 && (
            <ul className="divide-y divide-border">
              {newUsers.map((u) => (
                <li key={u.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0", isLight ? "bg-primary/10 text-primary" : "bg-primary/20 text-primary")}>
                      {(u.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-semibold text-sm truncate", isLight ? "text-slate-900" : "text-foreground")}>{u.name}</p>
                      <p className={cn("text-xs truncate", isLight ? "text-slate-500" : "text-muted-foreground")}>{u.email}</p>
                      <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                        Requested {new Date(u.createdAt).toLocaleString()}
                        {u.phone ? ` · ☎ ${u.phone}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => approveNewUser(u.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setDenyTargetId(u.id); setDenyReason(""); }}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", isLight ? "border border-slate-200 text-slate-600 hover:bg-slate-100" : "border border-white/10 text-muted-foreground hover:bg-white/5")}
                    >
                      Deny
                    </button>
                  </div>

                  {denyTargetId === u.id && (
                    <div className={cn("mt-3 rounded-lg border p-3 space-y-2", isLight ? "border-rose-200 bg-rose-50" : "border-rose-500/30 bg-rose-500/5")}>
                      <p className={cn("text-xs font-semibold", isLight ? "text-rose-800" : "text-rose-300")}>Why are you denying access?</p>
                      <input
                        autoFocus
                        value={denyReason}
                        onChange={(e) => setDenyReason(e.target.value)}
                        placeholder="e.g. external email, not an employee"
                        className={cn("w-full h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40", isLight ? "bg-white border-rose-200 text-slate-900" : "bg-black/20 border-rose-500/30 text-foreground")}
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setDenyTargetId(null); setDenyReason(""); }} className={cn("px-3 py-1 rounded-lg text-xs", isLight ? "text-slate-600 hover:bg-slate-100" : "text-muted-foreground hover:bg-white/5")}>Cancel</button>
                        <button
                          onClick={() => denyNewUser(u.id)}
                          disabled={!denyReason.trim()}
                          className="px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 disabled:opacity-50"
                        >
                          Confirm deny
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {subTab === "exports" && (
        <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
          {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && exports.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No export requests yet.</div>}
          {!loading && exports.length > 0 && (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm min-w-[760px]">
                <thead className={cn("text-xs uppercase", isLight ? "bg-slate-50 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">Requester</th>
                    <th className="px-4 py-3 text-left font-medium">Module / Format</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map(r => (
                    <tr key={r.id} className={cn("border-t", isLight ? "border-slate-100" : "border-white/5")}>
                      <td className="px-4 py-3"><p className={cn("text-xs", isLight ? "text-slate-700" : "text-foreground")}>{format(new Date(r.createdAt), "MMM d, HH:mm")}</p></td>
                      <td className="px-4 py-3"><p className={cn("text-sm", isLight ? "text-slate-900" : "text-foreground")}>{r.requesterName}</p></td>
                      <td className="px-4 py-3">
                        <p className={cn("text-xs capitalize", isLight ? "text-slate-700" : "text-foreground")}>{String(r.module).replace(/-/g, " ")}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{r.fileFormat}</p>
                      </td>
                      <td className="px-4 py-3">{statusBadge(r.status)}</td>
                      <td className="px-4 py-3">
                        <p className={cn("text-xs", isLight ? "text-slate-700" : "text-muted-foreground")}>{r.reviewerName || "—"}</p>
                        {r.reviewedAt && <p className="text-[10px] text-muted-foreground">{format(new Date(r.reviewedAt), "MMM d, HH:mm")}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === "access" && (
        <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
          {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && access.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No access requests yet.</div>}
          {!loading && access.length > 0 && (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm min-w-[600px]">
                <thead className={cn("text-xs uppercase", isLight ? "bg-slate-50 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {access.map((r: any) => (
                    <tr key={r.id} className={cn("border-t", isLight ? "border-slate-100" : "border-white/5")}>
                      <td className="px-4 py-3"><p className={cn("text-xs", isLight ? "text-slate-700" : "text-foreground")}>{format(new Date(r.requestedAt), "MMM d, HH:mm")}</p></td>
                      <td className="px-4 py-3">
                        <p className={cn("text-sm", isLight ? "text-slate-900" : "text-foreground")}>{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </td>
                      <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log
// ─────────────────────────────────────────────────────────────────────────────
