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
import { SkeletonGrid } from "../components/SkeletonGrid";

export function OverviewTab({ isLight }: { isLight: boolean }) {
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
// Sentinel select value that triggers the "add a new role" prompt.

