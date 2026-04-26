import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Loader2, TrendingUp, Package, Clock, AlertTriangle,
  Maximize2, Minimize2, BarChart2, PieChart as PieIcon, List,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

function DonutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  );
}

const BASE = import.meta.env.BASE_URL;
function authH() { return { Authorization: `Bearer ${localStorage.getItem("rd_token")}` }; }

const DARK_COLORS = [
  "hsl(252,89%,65%)", "hsl(190,90%,50%)", "hsl(280,80%,60%)",
  "hsl(320,80%,60%)", "hsl(150,80%,50%)", "hsl(50,90%,55%)",
  "hsl(10,80%,60%)", "hsl(230,80%,60%)",
];
const LIGHT_COLORS = [
  "#4F46E5", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6",
];

function useChartTheme() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  return {
    isLight,
    colors: isLight ? LIGHT_COLORS : DARK_COLORS,
    gridStroke: isLight ? "#E5E7EB" : "rgba(255,255,255,0.05)",
    axisColor: isLight ? "#374151" : "rgba(255,255,255,0.6)",
    axisStroke: isLight ? "#9CA3AF" : "rgba(255,255,255,0.3)",
    tooltipCss: {
      backgroundColor: isLight ? "#FFFFFF" : "rgba(15,17,26,0.95)",
      borderColor: isLight ? "#E5E7EB" : "rgba(255,255,255,0.1)",
      borderRadius: "10px",
      color: isLight ? "#111827" : "#fff",
      fontSize: 13,
    },
  };
}

// ── Reusable ChartCard with fullscreen overlay ────────────────────────────────
function ChartCard({
  title, controls, children,
}: {
  title: string;
  controls?: React.ReactNode;
  children: (full: boolean) => React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const { isLight } = useChartTheme();
  return (
    <>
      <div className={cn("p-6 rounded-2xl glass-card", isLight && "border border-slate-200 bg-white")}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold font-display">{title}</h3>
          <div className="flex items-center gap-2">
            {controls}
            <button
              onClick={() => setFull(f => !f)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title={full ? "Exit fullscreen" : "Expand"}
            >
              {full ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        {children(false)}
      </div>

      {full && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setFull(false)} />
          <div className={cn(
            "relative w-full max-w-5xl rounded-2xl p-6 border shadow-2xl",
            isLight ? "bg-white border-slate-200" : "glass-panel border-white/10",
          )}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold font-display">{title}</h3>
              <div className="flex items-center gap-3">
                {controls}
                <button onClick={() => setFull(false)} className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground">
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {children(true)}
          </div>
        </div>
      )}
    </>
  );
}

// ── Toggle button strip (donut / pie / bar / list) ────────────────────────────
type ChartMode = "donut" | "pie" | "bar" | "list";

function ModeToggle({
  mode, setMode, options, isLight,
}: {
  mode: ChartMode;
  setMode: (m: ChartMode) => void;
  options: { value: ChartMode; icon: React.ElementType }[];
  isLight: boolean;
}) {
  return (
    <div className={cn("flex rounded-xl border overflow-hidden", isLight ? "border-slate-200" : "border-white/10")}>
      {options.map(({ value, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          className={cn(
            "p-1.5 transition-colors",
            mode === value
              ? "bg-primary text-white"
              : isLight
              ? "bg-white text-slate-500 hover:bg-slate-50"
              : "bg-transparent text-muted-foreground hover:bg-white/5",
          )}
          title={value}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

// ── List view: ranked rows with progress bar ──────────────────────────────────
function ListChart({ data, nameKey, valueKey, colors, isLight, suffix = "" }: any) {
  const max = Math.max(...data.map((d: any) => d[valueKey] ?? 0), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d: any, i: number) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground truncate max-w-[60%]">{d[nameKey]}</span>
            <span className="font-mono text-muted-foreground">
              {typeof d[valueKey] === "number"
                ? d[valueKey].toLocaleString(undefined, { maximumFractionDigits: 1 })
                : d[valueKey]}{suffix}
            </span>
          </div>
          <div className={cn("h-1.5 rounded-full overflow-hidden", isLight ? "bg-slate-100" : "bg-white/5")}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d[valueKey] / max) * 100}%`, backgroundColor: colors[i % colors.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared empty state ─────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-muted-foreground text-sm text-center px-4">
      {message}
    </div>
  );
}

// ── 1. Spend by Category ─────────────────────────────────────────────────────
function SpendByCategoryChart({ data }: { data: { category: string; spend: number }[] }) {
  const ct = useChartTheme();
  const [mode, setMode] = useState<ChartMode>("donut");

  const formatted = data.map(d => ({
    name: d.category.charAt(0).toUpperCase() + d.category.slice(1),
    value: Math.round(d.spend),
  }));

  const innerRadius = mode === "donut" ? "55%" : "0%";
  const isEmpty = formatted.length === 0;

  return (
    <ChartCard
      title="Spend by Category"
      controls={!isEmpty ? (
        <ModeToggle
          mode={mode}
          setMode={setMode}
          isLight={ct.isLight}
          options={[
            { value: "donut", icon: DonutIcon },
            { value: "pie", icon: PieIcon },
            { value: "bar", icon: BarChart2 },
            { value: "list", icon: List },
          ]}
        />
      ) : undefined}
    >
      {(full) => {
        if (isEmpty) return <EmptyState message="No purchase order spend data yet — create and receive POs to see category breakdown." />;
        const h = full ? 420 : 260;
        if (mode === "list") {
          return (
            <div style={{ height: h }} className="overflow-y-auto pr-1">
              <ListChart data={formatted} nameKey="name" valueKey="value" colors={ct.colors} isLight={ct.isLight} />
            </div>
          );
        }
        if (mode === "bar") {
          return (
            <div style={{ height: h }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={{ stroke: ct.axisStroke }} />
                  <YAxis tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={{ stroke: ct.axisStroke }} />
                  <Tooltip contentStyle={ct.tooltipCss} />
                  <Bar dataKey="value" name="Spend" radius={[4, 4, 0, 0]}>
                    {formatted.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }
        return (
          <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={formatted} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius="70%"
                  innerRadius={innerRadius}
                  paddingAngle={mode === "donut" ? 2 : 0}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {formatted.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Pie>
                <Tooltip contentStyle={ct.tooltipCss} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      }}
    </ChartCard>
  );
}

// ── 2. Top Vendors by Spend ──────────────────────────────────────────────────
function TopVendorsChart({ data }: { data: { name: string; spend: number }[] }) {
  const ct = useChartTheme();
  const top8 = data.slice(0, 8);
  const isEmpty = top8.length === 0;

  return (
    <ChartCard title="Top Vendors by Spend">
      {(full) => {
        if (isEmpty) return <EmptyState message="No vendor spend data yet — create purchase orders to see top vendors by spend." />;
        const h = full ? 420 : Math.max(220, top8.length * 36 + 40);
        return (
          <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top8}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 100, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: ct.axisColor }}
                  axisLine={{ stroke: ct.axisStroke }}
                  tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <YAxis
                  type="category" dataKey="name" width={96}
                  tick={{ fontSize: 11, fill: ct.axisColor }}
                  axisLine={{ stroke: ct.axisStroke }}
                />
                <Tooltip
                  contentStyle={ct.tooltipCss}
                  formatter={(v: any) => [Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }), "Total Spend"]}
                />
                <Bar dataKey="spend" name="Total Spend" radius={[0, 4, 4, 0]}>
                  {top8.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      }}
    </ChartCard>
  );
}

// ── 3. PO Status Distribution ────────────────────────────────────────────────
function POStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const ct = useChartTheme();
  const [mode, setMode] = useState<ChartMode>("donut");

  const formatted = data.map(d => ({
    name: d.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    value: d.count,
  }));

  const innerRadius = mode === "donut" ? "55%" : "0%";
  const isEmpty = formatted.length === 0;

  return (
    <ChartCard
      title="PO Status Distribution"
      controls={!isEmpty ? (
        <ModeToggle
          mode={mode}
          setMode={setMode}
          isLight={ct.isLight}
          options={[
            { value: "donut", icon: DonutIcon },
            { value: "pie", icon: PieIcon },
            { value: "bar", icon: BarChart2 },
            { value: "list", icon: List },
          ]}
        />
      ) : undefined}
    >
      {(full) => {
        if (isEmpty) return <EmptyState message="No purchase orders yet — status breakdown will appear once POs are created." />;
        const h = full ? 420 : 260;
        if (mode === "list") {
          return (
            <div style={{ height: h }} className="overflow-y-auto pr-1">
              <ListChart data={formatted} nameKey="name" valueKey="value" colors={ct.colors} isLight={ct.isLight} />
            </div>
          );
        }
        if (mode === "bar") {
          return (
            <div style={{ height: h }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
                  <XAxis
                    dataKey="name" tick={{ fontSize: 10, fill: ct.axisColor }}
                    axisLine={{ stroke: ct.axisStroke }} interval={0} angle={-30} textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={{ stroke: ct.axisStroke }} />
                  <Tooltip contentStyle={ct.tooltipCss} />
                  <Bar dataKey="value" name="POs" radius={[4, 4, 0, 0]}>
                    {formatted.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }
        return (
          <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={formatted} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius="65%"
                  innerRadius={innerRadius}
                  paddingAngle={mode === "donut" ? 2 : 0}
                >
                  {formatted.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Pie>
                <Tooltip contentStyle={ct.tooltipCss} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      }}
    </ChartCard>
  );
}

// ── 4. Approval Cycle Time ───────────────────────────────────────────────────
function ApprovalCycleChart({ data }: { data: { dept: string; avgDays: number }[] }) {
  const ct = useChartTheme();

  if (!data.length) {
    return (
      <ChartCard title="Approval Cycle Time (by Dept)">
        {() => (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            No approved requests yet — data will appear once requests are approved.
          </div>
        )}
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Approval Cycle Time (avg days, by dept)">
      {(full) => {
        const h = full ? 420 : 260;
        return (
          <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
                <XAxis
                  dataKey="dept"
                  tick={{ fontSize: 11, fill: ct.axisColor }}
                  axisLine={{ stroke: ct.axisStroke }}
                  interval={0} angle={-30} textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: ct.axisColor }}
                  axisLine={{ stroke: ct.axisStroke }}
                  label={{
                    value: "Avg Days",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    style: { fontSize: 10, fill: ct.axisColor },
                  }}
                />
                <Tooltip
                  contentStyle={ct.tooltipCss}
                  formatter={(v: any) => [`${v} days`, "Avg Approval Time"]}
                />
                <Bar dataKey="avgDays" name="Avg Days" radius={[4, 4, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      }}
    </ChartCard>
  );
}

// ── 5. Delivery Performance (On Time vs Late) ─────────────────────────────────
function DeliveryPerformanceChart({ data }: { data: { name: string; onTime: number; late: number }[] }) {
  const ct = useChartTheme();
  const onTimeColor = ct.isLight ? "#10B981" : "hsl(150,80%,50%)";
  const lateColor = ct.isLight ? "#EF4444" : "hsl(10,80%,60%)";

  if (!data.length) {
    return (
      <ChartCard title="Delivery Performance (last 6 months)">
        {() => (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            No received deliveries yet — data will appear once POs are marked received.
          </div>
        )}
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Delivery Performance — On Time vs Late (last 6 months)">
      {(full) => {
        const h = full ? 420 : 280;
        return (
          <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
                barCategoryGap="25%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: ct.axisColor }}
                  axisLine={{ stroke: ct.axisStroke }}
                  interval={0} angle={-30} textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: ct.axisColor }}
                  axisLine={{ stroke: ct.axisStroke }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={ct.tooltipCss}
                  formatter={(v: any, name: string) => [v, name === "onTime" ? "On Time" : "Late"]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => value === "onTime" ? "On Time" : "Late"}
                />
                <Bar dataKey="onTime" name="onTime" fill={onTimeColor} radius={[4, 4, 0, 0]} />
                <Bar dataKey="late" name="late" fill={lateColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      }}
    </ChartCard>
  );
}

// ── Monthly Spend Trend ───────────────────────────────────────────────────────
function SpendTrendChart({ data }: { data: { month: string; spend: number }[] }) {
  const ct = useChartTheme();
  return (
    <ChartCard title="Monthly Spend Trend">
      {(full) => (
        <div style={{ height: full ? 420 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="procSpendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ct.colors[0]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={ct.colors[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: ct.axisColor }} axisLine={{ stroke: ct.axisStroke }} />
              <YAxis
                tick={{ fontSize: 11, fill: ct.axisColor }}
                axisLine={{ stroke: ct.axisStroke }}
                tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <Tooltip
                contentStyle={ct.tooltipCss}
                formatter={(v: any) => [Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }), "Total Spend"]}
              />
              <Area type="monotone" dataKey="spend" stroke={ct.colors[0]} fill="url(#procSpendGrad)" strokeWidth={2.5} name="Spend" dot={{ r: 3, fill: ct.colors[0] }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

// ── Main Analytics Tab ────────────────────────────────────────────────────────
export default function AnalyticsTab() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/procurement/analytics"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/analytics`, { headers: authH() });
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) return null;

  const kpiCls = cn("rounded-2xl border p-5 space-y-2", isLight ? "bg-white border-slate-200" : "glass-card border-white/10");

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Total Spend This Month",
            value: (data.totalSpendMonth ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
            icon: TrendingUp,
            color: "text-blue-400 bg-blue-500/10",
          },
          {
            label: "POs Raised This Month",
            value: data.posThisMonth ?? 0,
            icon: Package,
            color: "text-violet-400 bg-violet-500/10",
          },
          {
            label: "Pending Approvals",
            value: data.pendingApprovals ?? 0,
            icon: Clock,
            color: "text-amber-400 bg-amber-500/10",
          },
          {
            label: "Overdue Deliveries",
            value: data.overdueDeliveries ?? 0,
            icon: AlertTriangle,
            color: (data.overdueDeliveries ?? 0) > 0 ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10",
          },
        ].map(k => (
          <div key={k.label} className={kpiCls}>
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", k.color)}>
              <k.icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold font-display">{k.value}</p>
            <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
          </div>
        ))}
      </div>

      {/* 1. Monthly Spend Trend (full width) */}
      <SpendTrendChart data={data.monthlyTrend ?? []} />

      {/* 2 & 3. Category + Status side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpendByCategoryChart data={data.categorySpend ?? []} />
        <POStatusChart data={data.statusDistribution ?? []} />
      </div>

      {/* 4. Top Vendors (full width) */}
      <TopVendorsChart data={data.topVendors ?? []} />

      {/* 5 & 6. Approval Cycle + Delivery Performance side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ApprovalCycleChart data={data.approvalCycleTime ?? []} />
        <DeliveryPerformanceChart data={data.deliveryPerformance ?? []} />
      </div>
    </div>
  );
}
