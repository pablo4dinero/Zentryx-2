import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users as UsersIcon, Lock, FileCheck2, ScrollText,
  Search, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, Activity, KeyRound, UserCheck, UserX,
  Crown, Mail, RefreshCw, Download, Globe,
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

const TABS = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "users", label: "Users", icon: UsersIcon },
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
  const [subTab, setSubTab] = useState<"exports" | "access">("exports");
  const [exports, setExports] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (subTab === "exports") setExports((await apiGet("/admin/approvals/exports")) || []);
      else setAccess((await apiGet("/admin/approvals/access")) || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [subTab]);

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
      <div className="flex gap-2">
        {(["exports", "access"] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors capitalize",
              subTab === t
                ? "bg-primary text-white border-primary"
                : isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}>
            {t === "exports" ? "Export Requests" : "Access Requests"}
          </button>
        ))}
      </div>

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
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonGrid({ isLight }: { isLight: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={cn("rounded-2xl border p-5 animate-pulse h-28", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")} />
      ))}
    </div>
  );
}
