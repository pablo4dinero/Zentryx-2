import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users as UsersIcon, Lock, FileCheck2, ScrollText,
  Search, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, Activity, KeyRound, UserCheck, UserX,
  Crown, Mail, RefreshCw, Download, Globe,
  Megaphone, Send, Trash2, ChevronDown, ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useGetCurrentUser } from "@/api-client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const apiHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}`,
});
const apiGet = (path: string) => fetch(`${BASE}api${path}`, { headers: apiHeaders() }).then(r => r.ok ? r.json() : null);
const apiPatch = (path: string, body: any) => fetch(`${BASE}api${path}`, { method: "PATCH", headers: apiHeaders(), body: JSON.stringify(body) }).then(r => r.json());
const apiPost = (path: string, body: any) => fetch(`${BASE}api${path}`, { method: "POST", headers: apiHeaders(), body: JSON.stringify(body) }).then(r => r.json());
const apiDelete = (path: string) => fetch(`${BASE}api${path}`, { method: "DELETE", headers: apiHeaders() }).then(r => r.json());

const TABS = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "users", label: "Users", icon: UsersIcon },
  { id: "messages", label: "Messages", icon: Megaphone },
  { id: "mfa", label: "MFA Resets", icon: KeyRound },
  { id: "security", label: "Security & Logins", icon: Lock },
  { id: "approvals", label: "Approvals", icon: FileCheck2 },
  { id: "audit", label: "Audit Log", icon: ScrollText },
] as const;
type TabId = typeof TABS[number]["id"];

export default function AdminDashboard() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { data: me } = useGetCurrentUser();
  const isAdmin = (me?.role || "").toLowerCase() === "admin";
  const [tab, setTab] = useState<TabId>("overview");

  if (!me) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-center">
        <ShieldCheck className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground">This module is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn("text-3xl font-display font-bold flex items-center gap-3", isLight ? "text-slate-900" : "text-foreground")}>
          <Crown className="w-8 h-8 text-primary" /> Admin Dashboard
        </h1>
        <p className={cn("mt-1 text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
          Oversee users, approve gated actions, and audit every meaningful event across Zentryx.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border",
                active
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                  : isLight
                    ? "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "overview" && <OverviewTab isLight={isLight} />}
        {tab === "users" && <UsersTab isLight={isLight} />}
        {tab === "messages" && <MessagesTab isLight={isLight} />}
        {tab === "mfa" && <MfaResetsTab isLight={isLight} />}
        {tab === "security" && <SecurityTab isLight={isLight} />}
        {tab === "approvals" && <ApprovalsTab isLight={isLight} />}
        {tab === "audit" && <AuditTab isLight={isLight} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ isLight }: { isLight: boolean }) {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    setRefreshing(true);
    try { setData(await apiGet("/admin/overview")); } finally { setRefreshing(false); }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (!data) return <SkeletonGrid isLight={isLight} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button onClick={load} disabled={refreshing}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
            isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
            refreshing && "opacity-50",
          )}>
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi isLight={isLight} icon={UsersIcon} color="indigo"
          label="Total Users" value={data.users.total}
          hint={`${data.users.active} active`} />
        <Kpi isLight={isLight} icon={Activity} color="emerald"
          label="Online Now" value={data.users.onlineNow}
          hint="last 5 minutes" />
        <Kpi isLight={isLight} icon={FileCheck2} color="amber"
          label="Pending Approvals" value={(data.approvals.pendingExports ?? 0) + (data.approvals.pendingAccessRequests ?? 0)}
          hint={`${data.approvals.pendingExports} exports · ${data.approvals.pendingAccessRequests} access`} />
        <Kpi isLight={isLight} icon={Lock} color="rose"
          label="Failed Logins (24h)" value={data.activity.failedLogins24h}
          hint={data.activity.failedLogins24h > 0 ? "Review under Security" : "All clear"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ActivityCard isLight={isLight} label="Successful Logins" value={data.activity.successfulLogins24h} icon={UserCheck} trend="up" />
        <ActivityCard isLight={isLight} label="Exports Issued" value={data.activity.exports24h} icon={Download} trend="flat" />
        <ActivityCard isLight={isLight} label="New Records (Accounts + Projects)" value={data.activity.newAccounts24h + data.activity.newProjects24h} icon={TrendingUp} trend="up" />
      </div>

      <div className={cn("glass-card rounded-2xl p-6 border", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={cn("font-semibold", isLight ? "text-slate-900" : "text-foreground")}>Login Activity — Last 7 Days</h3>
          <span className={cn("text-xs", isLight ? "text-slate-500" : "text-muted-foreground")}>Daily success vs. failure</span>
        </div>
        <LoginSparkline isLight={isLight} series={data.loginSeries || []} />
      </div>
    </div>
  );
}

function Kpi({ isLight, icon: Icon, color, label, value, hint }: { isLight: boolean; icon: any; color: "indigo" | "emerald" | "amber" | "rose"; label: string; value: number | string; hint?: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    indigo: { bg: "bg-indigo-500/10", text: "text-indigo-500" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-500" },
  };
  return (
    <div className={cn("glass-card rounded-2xl p-5 border", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-xs font-semibold uppercase tracking-wider", isLight ? "text-slate-500" : "text-muted-foreground")}>{label}</p>
        <div className={cn("p-2 rounded-xl", colors[color].bg)}>
          <Icon className={cn("w-4 h-4", colors[color].text)} />
        </div>
      </div>
      <p className={cn("text-3xl font-bold font-display mt-2", isLight ? "text-slate-900" : "text-foreground")}>{value}</p>
      {hint && <p className={cn("text-xs mt-1", isLight ? "text-slate-500" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}

function ActivityCard({ isLight, label, value, icon: Icon, trend }: { isLight: boolean; label: string; value: number; icon: any; trend: "up" | "down" | "flat" }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  return (
    <div className={cn("glass-card rounded-2xl p-5 border flex items-center gap-4", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
      <div className={cn("p-3 rounded-xl shrink-0", isLight ? "bg-slate-100" : "bg-white/5")}>
        <Icon className={cn("w-5 h-5", isLight ? "text-slate-700" : "text-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs", isLight ? "text-slate-500" : "text-muted-foreground")}>{label}</p>
        <p className={cn("text-2xl font-bold font-display mt-0.5", isLight ? "text-slate-900" : "text-foreground")}>{value}</p>
        <p className={cn("text-[10px] mt-0.5 flex items-center gap-1", isLight ? "text-slate-400" : "text-muted-foreground")}>
          <TrendIcon className="w-3 h-3" /> last 24h
        </p>
      </div>
    </div>
  );
}

function LoginSparkline({ isLight, series }: { isLight: boolean; series: Array<{ day: string; success: number; failure: number }> }) {
  if (!series.length) {
    return <p className={cn("text-sm text-center py-6", isLight ? "text-slate-400" : "text-muted-foreground")}>No login data yet.</p>;
  }
  const maxVal = Math.max(1, ...series.flatMap(s => [s.success, s.failure]));
  return (
    <div className="flex items-end gap-2 h-32">
      {series.map(s => {
        const sh = Math.round((s.success / maxVal) * 100);
        const fh = Math.round((s.failure / maxVal) * 100);
        return (
          <div key={s.day} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex gap-0.5 items-end h-24">
              <div className="flex-1 rounded-t bg-emerald-500" style={{ height: `${sh}%`, minHeight: s.success ? 2 : 0 }} title={`${s.success} successful`} />
              <div className="flex-1 rounded-t bg-rose-500" style={{ height: `${fh}%`, minHeight: s.failure ? 2 : 0 }} title={`${s.failure} failed`} />
            </div>
            <span className={cn("text-[9px]", isLight ? "text-slate-400" : "text-muted-foreground")}>
              {format(new Date(s.day), "MMM d")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  "admin", "manager", "ceo", "managing_director",
  "head_of_product_development", "head_of_department",
  "npd_technologist", "key_account_manager", "senior_key_account_manager",
  "project_manager", "procurement", "scientist", "analyst",
  "hr", "quality_control", "graphics_designer", "viewer",
];

function UsersTab({ isLight }: { isLight: boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setUsers((await apiGet("/admin/users")) || []); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

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
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
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
            <table className="w-full text-sm min-w-[840px]">
              <thead className={cn("text-xs uppercase", isLight ? "bg-slate-50 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
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
                        onChange={e => patchUser(u.id, { role: e.target.value })}
                        disabled={savingId === u.id}
                        className={cn(
                          "h-8 px-2 rounded-lg border text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40 capitalize",
                          isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground",
                        )}
                      >
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        defaultValue={u.department || ""}
                        onBlur={e => { if (e.target.value !== (u.department || "")) patchUser(u.id, { department: e.target.value }); }}
                        placeholder="—"
                        className={cn(
                          "h-8 px-2 rounded-lg border text-xs w-32 focus:outline-none focus:ring-1 focus:ring-primary/40",
                          isLight ? "bg-white border-slate-200 text-slate-700 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
                        )}
                      />
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security & Logins
// ─────────────────────────────────────────────────────────────────────────────
function SecurityTab({ isLight }: { isLight: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyFailed, setOnlyFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const qs = onlyFailed ? "?failed=true&limit=200" : "?limit=200";
      setRows((await apiGet(`/admin/login-attempts${qs}`)) || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [onlyFailed]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOnlyFailed(f => !f)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
            onlyFailed
              ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
              : isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> {onlyFailed ? "Showing Failed Only" : "Show Only Failed"}
        </button>
        <button onClick={load} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border",
          isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No login activity recorded yet.</div>}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[760px]">
              <thead className={cn("text-xs uppercase", isLight ? "bg-slate-50 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">When</th>
                  <th className="px-4 py-3 text-left font-medium">User / Email</th>
                  <th className="px-4 py-3 text-left font-medium">Result</th>
                  <th className="px-4 py-3 text-left font-medium">IP</th>
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={cn("border-t", isLight ? "border-slate-100" : "border-white/5")}>
                    <td className="px-4 py-3">
                      <p className={cn("text-xs", isLight ? "text-slate-700" : "text-foreground")}>
                        {format(new Date(r.createdAt), "MMM d, HH:mm:ss")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={cn("text-sm font-medium", isLight ? "text-slate-900" : "text-foreground")}>{r.userName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.success ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                          <CheckCircle2 className="w-3 h-3" /> {r.reason || "ok"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-500">
                          <XCircle className="w-3 h-3" /> {r.reason || "failed"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs flex items-center gap-1", isLight ? "text-slate-600" : "text-muted-foreground")}>
                        <Globe className="w-3 h-3" /> {r.ipAddress || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">
                      <span className={cn("text-[10px]", isLight ? "text-slate-500" : "text-muted-foreground")} title={r.userAgent || ""}>
                        {r.userAgent ? r.userAgent.slice(0, 60) + (r.userAgent.length > 60 ? "…" : "") : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Approvals (history)
// ─────────────────────────────────────────────────────────────────────────────
function ApprovalsTab({ isLight }: { isLight: boolean }) {
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
function AuditTab({ isLight }: { isLight: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows((await apiGet("/admin/audit-log?limit=300")) || []); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.action || "").toLowerCase().includes(s)
      || (r.entityType || "").toLowerCase().includes(s)
      || (r.userName || "").toLowerCase().includes(s)
      || (r.details || "").toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", isLight ? "text-slate-400" : "text-muted-foreground")} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by action, entity, user, details…"
            className={cn(
              "w-full h-10 rounded-xl border pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />
        </div>
        <button onClick={load} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border",
          isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No audit entries.</div>}
        {!loading && filtered.length > 0 && (
          <ul className={cn("divide-y", isLight ? "divide-slate-100" : "divide-white/5")}>
            {filtered.map(r => (
              <li key={r.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ScrollText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", isLight ? "text-slate-900" : "text-foreground")}>
                    <span className="font-semibold">{r.userName || "Unknown"}</span>
                    <span className={cn("mx-1", isLight ? "text-slate-500" : "text-muted-foreground")}>·</span>
                    <span className="capitalize">{r.action?.replace(/_/g, " ")}</span>
                    <span className={cn("mx-1", isLight ? "text-slate-500" : "text-muted-foreground")}>on</span>
                    <span className="capitalize font-medium">{r.entityType?.replace(/_/g, " ")}{r.entityId ? ` #${r.entityId}` : ""}</span>
                  </p>
                  {r.details && <p className={cn("text-xs mt-0.5 line-clamp-2", isLight ? "text-slate-500" : "text-muted-foreground")}>{r.details}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(r.createdAt), "MMM d, yyyy HH:mm:ss")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages (broadcast / targeted, with acknowledgment tracking)
// ─────────────────────────────────────────────────────────────────────────────
function MessagesTab({ isLight }: { isLight: boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [acks, setAcks] = useState<Record<number, any[]>>({});

  const loadAll = async () => {
    setLoading(true);
    try {
      const [u, m] = await Promise.all([
        apiGet("/admin/users"),
        apiGet("/admin/messages"),
      ]);
      setUsers(u || []);
      setMessages(m || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const filteredUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    if (!s) return users;
    return users.filter(u =>
      (u.name || "").toLowerCase().includes(s)
      || (u.email || "").toLowerCase().includes(s)
      || (u.department || "").toLowerCase().includes(s));
  }, [users, userSearch]);

  const toggleRecipient = (id: number) => {
    setRecipientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    if (audience === "selected" && recipientIds.length === 0) {
      alert("Pick at least one recipient or switch to All Users.");
      return;
    }
    setSending(true);
    try {
      const r = await apiPost("/admin/messages", { title: title.trim(), body: body.trim(), audience, recipientIds });
      if (r && r.id) {
        setTitle(""); setBody(""); setRecipientIds([]); setAudience("all");
        await loadAll();
      } else {
        alert("Failed to send message.");
      }
    } finally { setSending(false); }
  };

  const expand = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!acks[id]) {
      const rows = await apiGet(`/admin/messages/${id}/acknowledgments`);
      setAcks(prev => ({ ...prev, [id]: rows || [] }));
    }
  };

  const removeMessage = async (id: number) => {
    if (!confirm("Delete this message? Recipients who haven't acknowledged will no longer see it.")) return;
    await apiDelete(`/admin/messages/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
    if (expanded === id) setExpanded(null);
  };

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className={cn("glass-card rounded-2xl border p-6", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        <h3 className={cn("font-semibold mb-1 flex items-center gap-2", isLight ? "text-slate-900" : "text-foreground")}>
          <Megaphone className="w-4 h-4 text-primary" /> New Message
        </h3>
        <p className={cn("text-xs mb-4", isLight ? "text-slate-500" : "text-muted-foreground")}>
          Sends a popup to every selected user. Each recipient must acknowledge it before it goes away.
        </p>

        <div className="space-y-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (e.g. System maintenance tonight at 22:00)"
            className={cn(
              "w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Message body — keep it clear and actionable. Markdown isn't rendered, just plain text."
            rows={4}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />

          {/* Audience toggle */}
          <div className="flex gap-2">
            {(["all", "selected"] as const).map(a => (
              <button key={a} onClick={() => setAudience(a)}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                  audience === a
                    ? "bg-primary text-white border-primary"
                    : isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}>
                {a === "all" ? "All Active Users" : "Selected Users"}
              </button>
            ))}
            <span className={cn("inline-flex items-center px-2 text-xs", isLight ? "text-slate-500" : "text-muted-foreground")}>
              {audience === "all"
                ? `${Math.max(0, users.filter(u => u.isActive).length - 1)} recipients`
                : `${recipientIds.length} selected`}
            </span>
          </div>

          {/* Selected-user picker */}
          {audience === "selected" && (
            <div className={cn("rounded-xl border p-3 space-y-2", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/10")}>
              <div className="relative">
                <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5", isLight ? "text-slate-400" : "text-muted-foreground")} />
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search users by name, email, department…"
                  className={cn(
                    "w-full h-8 rounded-lg border pl-8 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40",
                    isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
                  )}
                />
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredUsers.filter(u => u.isActive).map(u => {
                  const checked = recipientIds.includes(u.id);
                  return (
                    <label key={u.id} className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs",
                      checked
                        ? "bg-primary/10 border border-primary/30 text-primary"
                        : isLight ? "border border-transparent hover:bg-white" : "border border-transparent hover:bg-white/5",
                    )}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRecipient(u.id)} className="accent-primary" />
                      <span className={cn("truncate", checked ? "" : isLight ? "text-slate-700" : "text-foreground")}>{u.name}</span>
                      <span className="ml-auto text-[10px] opacity-60 capitalize truncate">{(u.role || "").replace(/_/g, " ")}</span>
                    </label>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <p className={cn("col-span-2 text-center text-xs py-4", isLight ? "text-slate-400" : "text-muted-foreground")}>No users match.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={send}
              disabled={sending || !title.trim() || !body.trim() || (audience === "selected" && recipientIds.length === 0)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : "Send Message"}
            </button>
          </div>
        </div>
      </div>

      {/* Sent messages list */}
      <div>
        <h3 className={cn("font-semibold mb-3", isLight ? "text-slate-900" : "text-foreground")}>Sent Messages</h3>
        {loading && <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Loading…</p>}
        {!loading && messages.length === 0 && (
          <div className={cn("rounded-2xl border p-8 text-center", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
            <Megaphone className={cn("w-8 h-8 mx-auto mb-2", isLight ? "text-slate-300" : "text-muted-foreground/40")} />
            <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>No messages sent yet.</p>
          </div>
        )}
        {!loading && messages.length > 0 && (
          <ul className="space-y-2">
            {messages.map(m => {
              const isOpen = expanded === m.id;
              const ackList = acks[m.id] || [];
              const ackPct = m.recipientCount > 0 ? Math.round((m.acknowledgedCount / m.recipientCount) * 100) : 0;
              return (
                <li key={m.id} className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
                  <button
                    onClick={() => expand(m.id)}
                    className={cn("w-full text-left px-5 py-4 flex items-start gap-3 transition-colors",
                      isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.02]",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className={cn("w-4 h-4", isLight ? "text-slate-400" : "text-muted-foreground")} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={cn("font-semibold text-sm truncate", isLight ? "text-slate-900" : "text-foreground")}>{m.title}</p>
                          <p className={cn("text-xs mt-0.5 line-clamp-2", isLight ? "text-slate-600" : "text-muted-foreground")}>{m.body}</p>
                          <p className={cn("text-[10px] mt-1", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                            {format(new Date(m.createdAt), "MMM d, yyyy HH:mm")} · {m.audience === "all" ? "All Active Users" : "Selected"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-xs font-semibold", isLight ? "text-slate-700" : "text-foreground")}>
                            {m.acknowledgedCount} / {m.recipientCount}
                          </p>
                          <div className={cn("h-1.5 w-24 mt-1 rounded-full overflow-hidden", isLight ? "bg-slate-200" : "bg-white/10")}>
                            <div className="h-full bg-emerald-500" style={{ width: `${ackPct}%` }} />
                          </div>
                          <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>{ackPct}% ack'd</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); removeMessage(m.id); }}
                          title="Delete message"
                          className={cn("p-1.5 rounded-lg shrink-0", isLight ? "text-slate-400 hover:text-red-500 hover:bg-red-50" : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className={cn("px-5 pb-5 border-t", isLight ? "border-slate-100" : "border-white/5")}>
                      <p className={cn("text-xs uppercase tracking-wider font-semibold mt-3 mb-2", isLight ? "text-slate-500" : "text-muted-foreground")}>Recipients</p>
                      {ackList.length === 0 && <p className="text-xs text-muted-foreground">Loading…</p>}
                      {ackList.length > 0 && (
                        <ul className="space-y-1">
                          {ackList.map((r: any) => (
                            <li key={r.userId} className="flex items-center gap-3 text-xs">
                              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                                r.acknowledgedAt
                                  ? "bg-emerald-500/15 text-emerald-500"
                                  : isLight ? "bg-slate-100 text-slate-400" : "bg-white/5 text-muted-foreground",
                              )}>
                                {r.acknowledgedAt ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={cn("truncate", isLight ? "text-slate-700" : "text-foreground")}>{r.userName || "Unknown"}</p>
                                <p className={cn("text-[10px] truncate", isLight ? "text-slate-400" : "text-muted-foreground")}>{r.userEmail}</p>
                              </div>
                              <span className={cn("text-[10px] shrink-0", isLight ? "text-slate-500" : "text-muted-foreground")}>
                                {r.acknowledgedAt ? `Ack'd ${formatDistanceToNow(new Date(r.acknowledgedAt), { addSuffix: true })}` : "Pending"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MFA Resets — handle the emergency-login fallback requests from users
// ─────────────────────────────────────────────────────────────────────────────
function MfaResetsTab({ isLight }: { isLight: boolean }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ email: string; token: string; expiresAt: string } | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await apiGet("/mfa/admin/emergency-requests");
      setRequests(Array.isArray(rows) ? rows : []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const approve = async (userId: number) => {
    setBusy(userId);
    try {
      const data = await apiPost(`/mfa/admin/emergency-approve/${userId}`, {});
      if (data?.oneTimeToken) {
        setIssuedToken({ email: data.email, token: data.oneTimeToken, expiresAt: data.expiresAt });
        await load();
      } else {
        alert(data?.message || "Approval failed");
      }
    } finally { setBusy(null); }
  };

  const deny = async (userId: number) => {
    if (!confirm("Deny this emergency login request? The user will be told to contact you.")) return;
    setBusy(userId);
    try {
      await apiPost(`/mfa/admin/emergency-deny/${userId}`, { reason: denyReason });
      setDenyReason("");
      await load();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className={cn("glass-card rounded-2xl border p-6", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        <h3 className={cn("font-semibold mb-1 flex items-center gap-2", isLight ? "text-slate-900" : "text-foreground")}>
          <KeyRound className="w-4 h-4 text-primary" /> MFA Emergency Requests
        </h3>
        <p className={cn("text-xs mb-4", isLight ? "text-slate-500" : "text-muted-foreground")}>
          Users who couldn't complete MFA and need a one-time login. Approving generates a single-use token —
          deliver it to the user out-of-band (verified phone call, in person). On use, their existing MFA is
          wiped and they must re-enroll.
        </p>

        {loading && <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Loading…</p>}

        {!loading && requests.length === 0 && (
          <div className={cn("rounded-xl border p-8 text-center", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")}>
            <KeyRound className={cn("w-8 h-8 mx-auto mb-2", isLight ? "text-slate-300" : "text-muted-foreground/40")} />
            <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>No pending emergency requests.</p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className={cn("rounded-xl border px-4 py-3 flex items-center gap-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")}>
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0", isLight ? "bg-primary/10 text-primary" : "bg-primary/20 text-primary")}>
                  {(r.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold text-sm truncate", isLight ? "text-slate-900" : "text-foreground")}>{r.name}</p>
                  <p className={cn("text-xs truncate", isLight ? "text-slate-500" : "text-muted-foreground")}>{r.email} · {r.role}</p>
                  {r.phone && (
                    <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-400" : "text-muted-foreground")}>
                      ☎ {r.phone}
                    </p>
                  )}
                  <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                    Expires {new Date(r.expires).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => approve(r.id)}
                  disabled={busy === r.id}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
                </button>
                <button
                  onClick={() => deny(r.id)}
                  disabled={busy === r.id}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50", isLight ? "border border-slate-200 text-slate-600 hover:bg-slate-100" : "border border-white/10 text-muted-foreground hover:bg-white/5")}
                >
                  Deny
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* One-time token reveal modal */}
      {issuedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setIssuedToken(null)}>
          <div onClick={(e) => e.stopPropagation()} className={cn("w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-[#1a1a2e] border-white/10")}>
            <div className={cn("px-5 py-4 border-b", isLight ? "border-slate-100 bg-gradient-to-r from-primary/5 to-emerald-500/5" : "border-white/10 bg-gradient-to-r from-primary/10 to-emerald-500/10")}>
              <p className={cn("text-[10px] font-bold uppercase tracking-wider", isLight ? "text-emerald-700" : "text-emerald-400")}>One-time login code</p>
              <p className={cn("font-semibold text-base mt-0.5", isLight ? "text-slate-900" : "text-foreground")}>Deliver this to {issuedToken.email}</p>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
                <strong>Share this code only via a verified channel</strong> — a phone call you initiated, in person,
                or another channel where you're certain the recipient is the legitimate user. This code is valid for
                30 minutes and works exactly once.
              </p>
              <code className={cn("block p-3 rounded-lg font-mono text-xs break-all select-all", isLight ? "bg-slate-100 text-slate-900" : "bg-white/5 text-foreground")}>{issuedToken.token}</code>
              <button
                onClick={() => navigator.clipboard.writeText(issuedToken.token)}
                className={cn("w-full text-xs py-2 rounded-lg border", isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}
              >
                Copy to clipboard
              </button>
              <p className={cn("text-[10px]", isLight ? "text-slate-500" : "text-muted-foreground")}>
                Expires {new Date(issuedToken.expiresAt).toLocaleString()}
              </p>
            </div>
            <div className={cn("px-5 py-4 border-t flex justify-end gap-2", isLight ? "border-slate-100 bg-slate-50" : "border-white/10 bg-white/[0.02]")}>
              <button onClick={() => setIssuedToken(null)} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonGrid({ isLight }: { isLight: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={cn("rounded-2xl border p-5 animate-pulse h-28", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")} />
      ))}
    </div>
  );
}
