import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Table2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { authHeaders } from "./lib/helpers";
import { BASE } from "./lib/constants";

// ── Validated categorical palette (dataviz skill, slots 3→2→1) ─────────────
// Light surface: #fcfcfb  Dark surface: #1a1a19
// Adjacent-pair CVD ΔE ≥ 9.2, normal-vision ΔE ≥ 26.5 in both modes.
// Aqua (#1baf7a light) is below 3:1 on light surface — relief: tooltip + table.
const SERIES = [
  {
    key: "assigned",
    label: "Assigned",
    colorLight: "#1baf7a",
    colorDark: "#199e70",
  },
  {
    key: "unassigned",
    label: "Unassigned",
    colorLight: "#eb6834",
    colorDark: "#d95926",
  },
  {
    key: "volumeAdjusted",
    label: "Volume Adjusted",
    colorLight: "#2a78d6",
    colorDark: "#3987e5",
  },
] as const;

type ActivityRow = {
  weekLabel: string;
  assigned: number;
  unassigned: number;
  volumeAdjusted: number;
};

// Shorten "Week 3: Jan 13 – Jan 17" → "Wk 3"
function shortWeek(label: string): string {
  const m = label.match(/Week (\d+)/i);
  return m ? `Wk ${m[1]}` : label.slice(0, 8);
}

// Custom tooltip rendered by Recharts
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
        isLight ? "border-slate-100" : "border-white/10"
      )}>
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </div>
  );
}

// Custom legend
function CustomLegend({ isLight, colors }: { isLight: boolean; colors: Record<string, string> }) {
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

interface AnalyticsProps {
  isLight: boolean;
}

export function ProductionAnalyticsTab({ isLight }: AnalyticsProps) {
  const { theme } = useTheme();
  const [showTable, setShowTable] = React.useState(false);

  const colors = React.useMemo(() =>
    Object.fromEntries(SERIES.map(s => [s.key, isLight ? s.colorLight : s.colorDark])),
    [isLight]
  );

  const activityQuery = useQuery({
    queryKey: ["/api/mdp/plan-activity"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/plan-activity`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load plan activity");
      return res.json() as Promise<ActivityRow[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 5,
  });

  const data = activityQuery.data ?? [];

  // Totals across all logged weeks
  const totals = React.useMemo(() => ({
    assigned: data.reduce((s, r) => s + r.assigned, 0),
    unassigned: data.reduce((s, r) => s + r.unassigned, 0),
    volumeAdjusted: data.reduce((s, r) => s + r.volumeAdjusted, 0),
  }), [data]);

  // X-axis tick: full week label → short form
  const chartData = React.useMemo(() =>
    data.map(r => ({ ...r, shortLabel: shortWeek(r.weekLabel) })),
    [data]
  );

  const cardBase = cn(
    "rounded-2xl border p-5",
    isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5",
  );

  return (
    <div className="space-y-6">
      {/* Header */}
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
            onClick={() => activityQuery.refetch()}
            disabled={activityQuery.isFetching}
            className={cn(
              "p-2 rounded-lg border text-xs transition-colors",
              isLight ? "border-slate-200 hover:bg-slate-100 text-slate-500" : "border-white/10 hover:bg-white/5 text-muted-foreground",
            )}
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", activityQuery.isFetching && "animate-spin")} />
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

      {/* Summary stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        {SERIES.map(s => (
          <div key={s.key} className={cardBase}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: isLight ? s.colorLight : s.colorDark }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {s.label}
              </p>
            </div>
            <p className={cn("text-2xl font-bold mt-0.5", isLight ? "text-slate-900" : "text-foreground")}>
              {activityQuery.isLoading ? "—" : totals[s.key as keyof typeof totals].toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">events logged</p>
          </div>
        ))}
      </div>

      {/* Chart / Table area */}
      <div className={cardBase}>
        <p className={cn("text-sm font-semibold mb-4", isLight ? "text-slate-800" : "text-foreground")}>
          Plan Change Frequency
          <span className={cn("ml-2 text-xs font-normal", isLight ? "text-slate-500" : "text-muted-foreground")}>
            by week
          </span>
        </p>

        {activityQuery.isLoading ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : data.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <BarChart2 className="w-8 h-8 opacity-30" />
            <p className="font-medium">No activity logged yet</p>
            <p className="text-xs text-center max-w-xs">
              Changes to floor assignments — assigning, unassigning, or adjusting volumes — will appear here as they happen.
            </p>
          </div>
        ) : showTable ? (
          // Table view (relief for aqua contrast WARN)
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={cn("border-b text-left", isLight ? "border-slate-200" : "border-white/10")}>
                  <th className="py-2 pr-4 font-semibold text-muted-foreground">Week</th>
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
                {data.map(row => {
                  const total = row.assigned + row.unassigned + row.volumeAdjusted;
                  return (
                    <tr key={row.weekLabel} className={cn("border-b last:border-0 hover:bg-black/5",
                      isLight ? "border-slate-100" : "border-white/5"
                    )}>
                      <td className="py-2 pr-4 text-foreground font-medium">{row.weekLabel}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{row.assigned}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{row.unassigned}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{row.volumeAdjusted}</td>
                      <td className="py-2 pl-3 text-right tabular-nums font-semibold text-foreground">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                barCategoryGap="32%"
              >
                <CartesianGrid
                  vertical={false}
                  stroke={isLight ? "#e1e0d9" : "#2c2c2a"}
                  strokeWidth={1}
                />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: isLight ? "#898781" : "#898781" }}
                  axisLine={{ stroke: isLight ? "#c3c2b7" : "#383835" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: isLight ? "#898781" : "#898781" }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }}
                />
                {/* Stack: Assigned (base) → Unassigned → Volume Adjusted (top)
                    Adjacent palette pairs: aqua↔orange and orange↔blue — both pass CVD gates. */}
                <Bar dataKey="assigned"       name="Assigned"        stackId="a"
                  fill={colors.assigned}       stroke={isLight ? "#fcfcfb" : "#1a1a19"} strokeWidth={1.5}
                  radius={[0, 0, 0, 0]}
                />
                <Bar dataKey="unassigned"     name="Unassigned"      stackId="a"
                  fill={colors.unassigned}     stroke={isLight ? "#fcfcfb" : "#1a1a19"} strokeWidth={1.5}
                  radius={[0, 0, 0, 0]}
                />
                <Bar dataKey="volumeAdjusted" name="Volume Adjusted" stackId="a"
                  fill={colors.volumeAdjusted} stroke={isLight ? "#fcfcfb" : "#1a1a19"} strokeWidth={1.5}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <CustomLegend isLight={isLight} colors={colors} />
          </>
        )}
      </div>
    </div>
  );
}
