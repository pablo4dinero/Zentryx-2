import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2, Table2, RefreshCw,
  ChevronLeft, ChevronRight, Trash2, AlertTriangle,
  Play, Pause, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { authHeaders } from "./lib/helpers";
import { BASE } from "./lib/constants";

// ── Validated categorical palette (dataviz skill, slots 3→2→1) ─────────────
const SERIES = [
  { key: "assigned",       label: "Assigned",        colorLight: "#1baf7a", colorDark: "#199e70" },
  { key: "unassigned",     label: "Unassigned",       colorLight: "#eb6834", colorDark: "#d95926" },
  { key: "volumeAdjusted", label: "Volume Adjusted",  colorLight: "#2a78d6", colorDark: "#3987e5" },
] as const;

type Period = "daily" | "weekly" | "monthly" | "yearly";

type ChartRow = { label: string; assigned: number; unassigned: number; volumeAdjusted: number };

type TrackingStatus = {
  status: "stopped" | "active" | "paused";
  startedAt: string | null;
  pausedAt: string | null;
  baselineCount: number;
  totalEvents: number;
  changedOrders: number;
  changeRate: number;
};

type LogEntry = {
  id: number;
  change_type: string;
  changed_at: string;
  week_label: string | null;
  production_order_id: number | null;
  floor_id: number | null;
  floor_name: string | null;
  company: string | null;
  product_name: string | null;
  changed_by_name: string | null;
  changed_by_email: string | null;
};

// ── Date helpers ─────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_LONG = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];

function buildQueryString(period: Period, date: Date, year: number, month: number): string {
  const p = new URLSearchParams({ period });
  if (period === "daily")        p.set("date", toISODate(date));
  else if (period === "weekly")  p.set("weekStart", toISODate(getMonday(date)));
  else if (period === "monthly") { p.set("year", String(year)); p.set("month", String(month)); }
  else                            p.set("year", String(year));
  return p.toString();
}

function formatPeriodLabel(period: Period, date: Date, year: number, month: number): string {
  if (period === "daily") {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === -1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (period === "weekly") {
    const mon = getMonday(date);
    const sun = new Date(mon.getTime() + 6 * 86_400_000);
    const sameYear = mon.getFullYear() === sun.getFullYear();
    const monStr = mon.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const sunStr = sun.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
    return `${monStr} – ${sunStr}, ${sun.getFullYear()}`;
  }
  if (period === "monthly") return `${MONTH_LONG[month - 1]} ${year}`;
  return String(year);
}

function navigate(period: Period, date: Date, year: number, month: number, dir: 1 | -1) {
  if (period === "daily")   return { date: new Date(date.getTime() + dir * 86_400_000), year, month };
  if (period === "weekly")  return { date: new Date(date.getTime() + dir * 7 * 86_400_000), year, month };
  if (period === "monthly") {
    let m = month + dir, y = year;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    return { date, year: y, month: m };
  }
  return { date, year: year + dir, month };
}

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CHANGE_LABELS: Record<string, string> = {
  assigned: "Assigned",
  unassigned: "Unassigned",
  volume_adjusted: "Vol. Adjusted",
};

// ── Tooltip ──────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  if (!active || !payload?.length) return null;
  const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className={cn(
      "rounded-xl border shadow-xl px-3 py-2.5 text-xs min-w-[160px]",
      isLight ? "bg-white border-slate-200 text-slate-800" : "bg-zinc-900 border-white/10 text-slate-200",
    )}>
      <p className="font-semibold mb-1.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
      {(payload as any[]).map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill }} />
            <span>{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
      <div className={cn("flex items-center justify-between pt-1.5 mt-1 border-t font-semibold",
        isLight ? "border-slate-100" : "border-white/10",
      )}>
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </div>
  );
}

function CustomLegend({ colors }: { colors: Record<string, string> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
      {SERIES.map(s => (
        <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colors[s.key] }} />
          {s.label}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductionAnalyticsTab({ isLight }: { isLight: boolean }) {
  const queryClient = useQueryClient();

  const [period, setPeriod]   = useState<Period>("weekly");
  const [date, setDate]       = useState(() => new Date());
  const [year, setYear]       = useState(() => new Date().getFullYear());
  const [month, setMonth]     = useState(() => new Date().getMonth() + 1);
  const [showTable, setShowTable]     = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const qs = useMemo(() => buildQueryString(period, date, year, month), [period, date, year, month]);
  const periodLabel = useMemo(() => formatPeriodLabel(period, date, year, month), [period, date, year, month]);

  const chartQuery = useQuery({
    queryKey: ["/api/mdp/plan-activity", qs],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity?${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<ChartRow[]>;
    },
    staleTime: 60_000,
  });

  const logQuery = useQuery({
    queryKey: ["/api/mdp/plan-activity/log", qs],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity/log?${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<LogEntry[]>;
    },
    staleTime: 60_000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to clear log");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/plan-activity"] });
      setClearConfirm(false);
    },
  });

  // ── Tracking ──
  const trackingQuery = useQuery({
    queryKey: ["/api/mdp/plan-activity/tracking"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity/tracking`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<TrackingStatus>;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const startTracking = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity/tracking/start`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mdp/plan-activity/tracking"] }),
  });

  const pauseTracking = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity/tracking/pause`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mdp/plan-activity/tracking"] }),
  });

  const tracking = trackingQuery.data;

  const nav = (dir: 1 | -1) => {
    const next = navigate(period, date, year, month, dir);
    setDate(next.date); setYear(next.year); setMonth(next.month);
  };

  const chartData = chartQuery.data ?? [];
  const totals = useMemo(() => ({
    assigned:        chartData.reduce((s, r) => s + r.assigned, 0),
    unassigned:      chartData.reduce((s, r) => s + r.unassigned, 0),
    volumeAdjusted:  chartData.reduce((s, r) => s + r.volumeAdjusted, 0),
  }), [chartData]);

  const colors = useMemo(
    () => Object.fromEntries(SERIES.map(s => [s.key, isLight ? s.colorLight : s.colorDark])),
    [isLight],
  );

  const card = cn(
    "rounded-2xl border p-5",
    isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5",
  );

  const totalEvents = totals.assigned + totals.unassigned + totals.volumeAdjusted;
  const hasData = totalEvents > 0;

  // For daily mode skip hours that have no activity to avoid 24 bars all at zero
  const displayChart = period === "daily"
    ? chartData.filter(r => r.assigned + r.unassigned + r.volumeAdjusted > 0)
    : chartData;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className={cn("text-xl font-semibold mb-1", isLight ? "text-slate-900" : "text-foreground")}>
            Production Analytics
          </h2>
          <p className={cn("text-sm", isLight ? "text-slate-600" : "text-muted-foreground")}>
            Tracks how often production floor assignments are changed after initial planning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { chartQuery.refetch(); logQuery.refetch(); }}
            disabled={chartQuery.isFetching}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              isLight ? "border-slate-200 hover:bg-slate-100 text-slate-500" : "border-white/10 hover:bg-white/5 text-muted-foreground",
            )}
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", chartQuery.isFetching && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowTable(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              showTable
                ? isLight ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                : isLight ? "border-slate-200 hover:bg-slate-100 text-slate-600" : "border-white/10 hover:bg-white/5 text-muted-foreground",
            )}
          >
            {showTable ? <BarChart2 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            {showTable ? "Chart view" : "Table view"}
          </button>
        </div>
      </div>

      {/* ── Tracking banner + summary cards ── */}
      {(() => {
        const isActive  = tracking?.status === "active";
        const isPaused  = tracking?.status === "paused";
        const isStopped = !tracking || tracking.status === "stopped";
        const actionPending = startTracking.isPending || pauseTracking.isPending;

        const bannerBg = isActive
          ? isLight ? "border-emerald-200 bg-emerald-50" : "border-emerald-500/20 bg-emerald-500/10"
          : isPaused
          ? isLight ? "border-amber-200 bg-amber-50"     : "border-amber-500/20 bg-amber-500/10"
          : isLight ? "border-slate-200 bg-slate-50"     : "border-white/10 bg-white/5";

        const dotColor  = isActive ? "#10b981" : isPaused ? "#f59e0b" : (isLight ? "#94a3b8" : "#64748b");
        const statusLabel = isActive ? "Tracking Active" : isPaused ? "Tracking Paused" : "Not Tracking";

        return (
          <div className="space-y-3">
            {/* Banner row */}
            <div className={cn("flex items-center justify-between gap-4 rounded-xl border px-4 py-3", bannerBg)}>
              <div className="flex items-center gap-2.5">
                <span className="relative flex w-2.5 h-2.5">
                  {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: dotColor }} />}
                  <span className="relative inline-flex rounded-full w-2.5 h-2.5" style={{ background: dotColor }} />
                </span>
                <span className={cn("text-sm font-semibold",
                  isActive ? (isLight ? "text-emerald-800" : "text-emerald-400") :
                  isPaused ? (isLight ? "text-amber-800"   : "text-amber-400")   :
                  "text-muted-foreground"
                )}>
                  {statusLabel}
                </span>
                {tracking?.startedAt && (
                  <span className="text-xs text-muted-foreground">
                    · since {new Date(tracking.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isActive ? (
                  <button
                    onClick={() => pauseTracking.mutate()}
                    disabled={actionPending}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                      isLight ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300"
                               : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30",
                    )}
                  >
                    <Pause className="w-3 h-3" />
                    {pauseTracking.isPending ? "Pausing…" : "Pause Tracking"}
                  </button>
                ) : (
                  <button
                    onClick={() => startTracking.mutate()}
                    disabled={actionPending}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                      isLight ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                               : "bg-emerald-600 hover:bg-emerald-700 text-white",
                    )}
                  >
                    <Play className="w-3 h-3" />
                    {startTracking.isPending ? "Starting…" : isPaused ? "Resume Tracking" : "Start Tracking"}
                  </button>
                )}
              </div>
            </div>

            {/* Summary cards (only when tracking has been started at least once) */}
            {tracking?.startedAt && (
              <div className="grid grid-cols-3 gap-3">
                {/* Change Rate */}
                <div className={cn(card, "relative overflow-hidden")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Change Rate
                  </p>
                  <p className={cn("text-3xl font-bold tabular-nums",
                    (tracking.changeRate ?? 0) > 30
                      ? (isLight ? "text-red-600" : "text-red-400")
                      : (isLight ? "text-slate-900" : "text-foreground"),
                  )}>
                    {trackingQuery.isLoading ? "—" : `${tracking.changeRate}%`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    of {tracking.baselineCount} assigned orders
                  </p>
                  <Activity className="absolute right-4 bottom-3 w-8 h-8 opacity-5" />
                </div>

                {/* Events since start */}
                <div className={cn(card, "relative overflow-hidden")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Events Since Start
                  </p>
                  <p className={cn("text-3xl font-bold tabular-nums", isLight ? "text-slate-900" : "text-foreground")}>
                    {trackingQuery.isLoading ? "—" : tracking.totalEvents.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    changes logged
                  </p>
                  <Activity className="absolute right-4 bottom-3 w-8 h-8 opacity-5" />
                </div>

                {/* Orders changed */}
                <div className={cn(card, "relative overflow-hidden")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Orders Changed
                  </p>
                  <p className={cn("text-3xl font-bold tabular-nums", isLight ? "text-slate-900" : "text-foreground")}>
                    {trackingQuery.isLoading ? "—" : tracking.changedOrders.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    distinct orders affected
                  </p>
                  <Activity className="absolute right-4 bottom-3 w-8 h-8 opacity-5" />
                </div>
              </div>
            )}

            {/* First-time hint */}
            {isStopped && !tracking?.startedAt && (
              <p className="text-xs text-muted-foreground text-center py-1">
                Complete your floor planning, then click <strong>Start Tracking</strong> to begin recording post-planning changes.
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Period selector + Date navigator ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Period tabs */}
        <div className={cn(
          "flex rounded-lg border overflow-hidden divide-x text-xs font-medium",
          isLight ? "border-slate-200 divide-slate-200" : "border-white/10 divide-white/10",
        )}>
          {(["daily","weekly","monthly","yearly"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3.5 py-1.5 capitalize transition-colors",
                period === p
                  ? isLight ? "bg-indigo-600 text-white" : "bg-indigo-500 text-white"
                  : isLight ? "bg-white text-slate-600 hover:bg-slate-50" : "bg-transparent text-muted-foreground hover:bg-white/5",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={() => nav(-1)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-muted-foreground",
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className={cn(
            "min-w-[190px] text-center text-sm font-medium px-1",
            isLight ? "text-slate-800" : "text-foreground",
          )}>
            {periodLabel}
          </span>
          <button
            onClick={() => nav(1)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-muted-foreground",
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Summary stat tiles ── */}
      <div className="grid grid-cols-3 gap-3">
        {SERIES.map(s => (
          <div key={s.key} className={card}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: isLight ? s.colorLight : s.colorDark }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {s.label}
              </p>
            </div>
            <p className={cn("text-2xl font-bold mt-0.5", isLight ? "text-slate-900" : "text-foreground")}>
              {chartQuery.isLoading ? "—" : totals[s.key as keyof typeof totals].toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">events this {period === "daily" ? "day" : period === "weekly" ? "week" : period === "monthly" ? "month" : "year"}</p>
          </div>
        ))}
      </div>

      {/* ── Chart / Table card ── */}
      <div className={card}>
        <p className={cn("text-sm font-semibold mb-4", isLight ? "text-slate-800" : "text-foreground")}>
          Plan Change Frequency
          <span className={cn("ml-2 text-xs font-normal", isLight ? "text-slate-500" : "text-muted-foreground")}>
            {period === "daily" ? "by hour" : period === "weekly" ? "by day" : period === "monthly" ? "by week" : "by month"}
          </span>
        </p>

        {chartQuery.isLoading ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading…
          </div>
        ) : !hasData ? (
          <div className="h-56 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <BarChart2 className="w-8 h-8 opacity-30" />
            <p className="font-medium">No activity for this period</p>
            <p className="text-xs text-center max-w-xs">
              Changes to floor assignments will appear here as they happen.
            </p>
          </div>
        ) : showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={cn("border-b text-left", isLight ? "border-slate-200" : "border-white/10")}>
                  <th className="py-2 pr-4 font-semibold text-muted-foreground">Period</th>
                  {SERIES.map(s => (
                    <th key={s.key} className="py-2 px-3 font-semibold text-right text-muted-foreground">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: isLight ? s.colorLight : s.colorDark }} />
                        {s.label}
                      </div>
                    </th>
                  ))}
                  <th className="py-2 pl-3 font-semibold text-right text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {chartData.filter(r => r.assigned + r.unassigned + r.volumeAdjusted > 0).map(row => (
                  <tr key={row.label} className={cn("border-b last:border-0", isLight ? "border-slate-100" : "border-white/5")}>
                    <td className="py-2 pr-4 text-foreground font-medium">{row.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.assigned}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.unassigned}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.volumeAdjusted}</td>
                    <td className="py-2 pl-3 text-right tabular-nums font-semibold text-foreground">
                      {row.assigned + row.unassigned + row.volumeAdjusted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={displayChart}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                barCategoryGap={period === "daily" ? "20%" : "32%"}
              >
                <CartesianGrid vertical={false} stroke={isLight ? "#e1e0d9" : "#2c2c2a"} strokeWidth={1} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#898781" }}
                  axisLine={{ stroke: isLight ? "#c3c2b7" : "#383835" }}
                  tickLine={false}
                  interval={period === "daily" ? "preserveStartEnd" : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="assigned"       name="Assigned"        stackId="a"
                  fill={colors.assigned}       stroke={isLight ? "#fcfcfb" : "#1a1a19"} strokeWidth={1.5}
                  radius={[0,0,0,0]}
                />
                <Bar dataKey="unassigned"     name="Unassigned"      stackId="a"
                  fill={colors.unassigned}     stroke={isLight ? "#fcfcfb" : "#1a1a19"} strokeWidth={1.5}
                  radius={[0,0,0,0]}
                />
                <Bar dataKey="volumeAdjusted" name="Volume Adjusted" stackId="a"
                  fill={colors.volumeAdjusted} stroke={isLight ? "#fcfcfb" : "#1a1a19"} strokeWidth={1.5}
                  radius={[4,4,0,0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <CustomLegend colors={colors} />
          </>
        )}
      </div>

      {/* ── Changes log ── */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <p className={cn("text-sm font-semibold", isLight ? "text-slate-800" : "text-foreground")}>
            Changes Log
            <span className={cn("ml-2 text-xs font-normal", isLight ? "text-slate-500" : "text-muted-foreground")}>
              {logQuery.isLoading ? "loading…" : `${logQuery.data?.length ?? 0} entries`}
            </span>
          </p>
        </div>

        {logQuery.isLoading ? (
          <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading…
          </div>
        ) : !logQuery.data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">No changes recorded for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={cn("border-b text-left", isLight ? "border-slate-200" : "border-white/10")}>
                  <th className="py-2 pr-4 font-semibold text-muted-foreground whitespace-nowrap">Time</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">Type</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">Order / Account</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">Floor</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">Week</th>
                  <th className="py-2 pl-3 font-semibold text-muted-foreground whitespace-nowrap">Changed By</th>
                </tr>
              </thead>
              <tbody>
                {logQuery.data.map(entry => {
                  const ctColor = entry.change_type === "assigned"
                    ? (isLight ? "#1baf7a" : "#199e70")
                    : entry.change_type === "unassigned"
                    ? (isLight ? "#eb6834" : "#d95926")
                    : (isLight ? "#2a78d6" : "#3987e5");
                  const orderLabel = entry.company
                    ? entry.product_name ? `${entry.company} — ${entry.product_name}` : entry.company
                    : entry.production_order_id ? `Order #${entry.production_order_id}` : "—";
                  const floorLabel = entry.floor_name ?? (entry.floor_id ? `Floor ${entry.floor_id}` : "—");
                  const byLabel = entry.changed_by_name ?? entry.changed_by_email ?? "—";
                  return (
                    <tr key={entry.id} className={cn("border-b last:border-0", isLight ? "border-slate-100" : "border-white/5")}>
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(entry.changed_at)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: ctColor + "22", color: ctColor }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ctColor }} />
                          {CHANGE_LABELS[entry.change_type] ?? entry.change_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-[180px] truncate text-foreground">{orderLabel}</td>
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{floorLabel}</td>
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{entry.week_label ?? "—"}</td>
                      <td className="py-2 pl-3 text-muted-foreground whitespace-nowrap">{byLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Clear log ── */}
      <div className="flex justify-end">
        {clearConfirm ? (
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm",
            isLight ? "border-red-200 bg-red-50 text-red-800" : "border-red-500/30 bg-red-500/10 text-red-400",
          )}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>This will permanently delete <strong>all</strong> logged events. Continue?</span>
            <div className="flex gap-2 ml-2">
              <button
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                  isLight ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white",
                )}
              >
                {clearMutation.isPending ? "Clearing…" : "Yes, clear all"}
              </button>
              <button
                onClick={() => setClearConfirm(false)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                  isLight ? "hover:bg-red-100 text-red-700" : "hover:bg-red-500/10 text-red-400",
                )}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setClearConfirm(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              isLight
                ? "border-slate-200 hover:border-red-200 hover:text-red-600 hover:bg-red-50 text-slate-500"
                : "border-white/10 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 text-muted-foreground",
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All Log
          </button>
        )}
      </div>

    </div>
  );
}
