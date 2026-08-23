import { useState, type Dispatch, type SetStateAction } from "react";
import { useListProjects } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { TrendingUp, Maximize2, Minimize2, BarChart2, Activity, LineChart, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DARK_COLORS = ['hsl(252,89%,65%)', 'hsl(190,90%,50%)', 'hsl(280,80%,60%)', 'hsl(320,80%,60%)', 'hsl(150,80%,50%)', 'hsl(50,90%,55%)', 'hsl(10,80%,60%)', 'hsl(230,80%,60%)'];
const LIGHT_COLORS = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#3B82F6'];

function useChartTheme() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  return {
    isLight,
    colors: isLight ? LIGHT_COLORS : DARK_COLORS,
    gridStroke: isLight ? "#E5E7EB" : "rgba(255,255,255,0.05)",
    axisColor: isLight ? "#374151" : "rgba(255,255,255,0.6)",
    axisStroke: isLight ? "#9CA3AF" : "rgba(255,255,255,0.3)",
    tooltipStyle: {
      contentStyle: {
        backgroundColor: isLight ? "rgba(255, 255, 255, 0.95)" : "rgba(15,17,26,0.95)",
        borderColor: isLight ? "#E5E7EB" : "rgba(255,255,255,0.1)",
        borderRadius: "10px",
        color: isLight ? "#111827" : "#fff",
        fontSize: 13,
      },
      itemStyle: { color: isLight ? "#374151" : "#fff" },
    },
    polarGridStroke: isLight ? "#E5E7EB" : "rgba(255,255,255,0.1)",
    polarAxisColor: isLight ? "#374151" : "rgba(255,255,255,0.6)",
  };
}

function ExpandBtn({ full, setFull }: { full: boolean; setFull: React.Dispatch<React.SetStateAction<boolean>> }) {
  return (
    <button onClick={() => setFull(f => !f)}
      className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      title={full ? "Exit fullscreen" : "Expand"}>
      {full ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>
  );
}

function ChartCard({ title, children, controls }: { title: string; children: (full: boolean) => React.ReactNode; controls?: React.ReactNode }) {
  const [full, setFull] = useState(false);
  const { isLight } = useChartTheme();
  return (
    <>
      <div className={cn("glass-card p-6 rounded-2xl", isLight && "border border-slate-200")}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold font-display">{title}</h3>
          <div className="flex items-center gap-2">
            {controls}
            <ExpandBtn full={false} setFull={setFull} />
          </div>
        </div>
        <div className="h-[280px]">{children(false)}</div>
      </div>
      <AnimatePresence>
        {full && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={cn("fixed inset-0 z-50 backdrop-blur-sm flex flex-col p-6", isLight ? "bg-white/90" : "bg-black/90")}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={cn("text-xl font-bold", isLight ? "text-gray-900" : "text-foreground")}>{title}</h2>
              <button onClick={() => setFull(false)} className={cn("p-2 rounded-xl transition-colors", isLight ? "text-gray-800 hover:bg-gray-100 hover:text-gray-900" : "text-muted-foreground hover:bg-white/10 hover:text-foreground")}>
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1">{children(true)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

type StageChartType = "donut" | "pie" | "bar";
type RadarChartType = "radar" | "bar";
type StatusMode = "all" | "month" | "quarter" | "half" | "custom";

const STATUS_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export default function Analytics() {
  const { data: projects, isLoading } = useListProjects({});
  const ct = useChartTheme();
  const [stageType, setStageType] = useState<StageChartType>("donut");
  const [radarType, setRadarType] = useState<RadarChartType>("radar");
  const [revProductFilter, setRevProductFilter] = useState<string>("all");
  const [statusMode, setStatusMode] = useState<StatusMode>("all");
  const [statusYear, setStatusYear] = useState(() => new Date().getFullYear());
  const [statusMonth, setStatusMonth] = useState(() => new Date().getMonth() + 1);
  const [statusQuarter, setStatusQuarter] = useState<1|2|3|4>(() => Math.ceil((new Date().getMonth() + 1) / 3) as 1|2|3|4);
  const [statusHalf, setStatusHalf] = useState<"h1"|"h2">(() => new Date().getMonth() < 6 ? "h1" : "h2");
  const [statusCustomFrom, setStatusCustomFrom] = useState(() => ({ year: new Date().getFullYear(), month: 1 }));
  const [statusCustomTo, setStatusCustomTo] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 }; });

  if (isLoading) return <PageLoader />;
  const projectsList = projects || [];
  const typedProjects = projectsList as any[];

  const byProductType = Object.entries(
    typedProjects.reduce((acc: Record<string, { count: number; approved: number; inProgress: number }>, p: any) => {
      if (!p.productType) return acc;
      if (!acc[p.productType]) acc[p.productType] = { count: 0, approved: 0, inProgress: 0 };
      acc[p.productType].count++;
      if (p.status === "approved") acc[p.productType].approved++;
      if (p.status === "in_progress") acc[p.productType].inProgress++;
      return acc;
    }, {})
  ).map(([name, d]) => ({ name, ...(d as { count: number; approved: number; inProgress: number }) }));

  const byStage = Object.entries(
    typedProjects.reduce((acc: Record<string, number>, p: any) => {
      acc[p.stage] = (acc[p.stage] || 0) + 1;
      return acc;
    }, {})
  ).map(([stage, count]) => ({ stage: stage.replace(/_/g, ' '), count }));

  // All years present in the data + current year, descending
  const statusAvailableYears = (() => {
    const dataYears = typedProjects
      .map((p: any) => p.createdAt ? new Date(p.createdAt).getFullYear() : null)
      .filter((y): y is number => y !== null);
    return Array.from(new Set([...dataYears, new Date().getFullYear()])).sort((a, b) => b - a);
  })();

  const statusFilteredProjects = (() => {
    if (statusMode === "all") return typedProjects;
    return (typedProjects as any[]).filter((p: any) => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      const y = d.getFullYear();
      const m = d.getMonth() + 1; // 1-12
      switch (statusMode) {
        case "month":
          return y === statusYear && m === statusMonth;
        case "quarter": {
          const s = (statusQuarter - 1) * 3 + 1; // Q1→1, Q2→4, Q3→7, Q4→10
          return y === statusYear && m >= s && m <= s + 2;
        }
        case "half":
          return y === statusYear && (statusHalf === "h1" ? m <= 6 : m >= 7);
        case "custom": {
          const from = new Date(statusCustomFrom.year, statusCustomFrom.month - 1, 1);
          const to   = new Date(statusCustomTo.year,   statusCustomTo.month,       0); // last day of month
          return d >= from && d <= to;
        }
        default: return true;
      }
    });
  })();

  const byStatus = Object.entries(
    statusFilteredProjects.reduce((acc: Record<string, number>, p: any) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([status, count]) => ({ status: status.replace(/_/g, ' '), count }));

  const radarData = byProductType.slice(0, 6).map(d => ({
    subject: d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name,
    Approved: d.approved,
    InProgress: d.inProgress,
  }));

  const STATUS_LABELS: Record<string, string> = {
    approved: "Approved", in_progress: "In Progress", awaiting_feedback: "Awaiting Feedback",
    on_hold: "On Hold", cancelled: "Cancelled", completed: "Completed",
    pushed_to_live: "Pushed to Live", new_inventory: "New Inventory",
    pending: "Pending Approval", active: "Active",
  };

  // Revenue by Status — total estimated revenue grouped by project status
  const revenueByStatus = Object.entries(
    typedProjects.reduce((acc: Record<string, number>, p: any) => {
      if (!p.revenueImpact) return acc;
      const rv = parseFloat(p.revenueImpact);
      if (!rv) return acc;
      acc[p.status] = (acc[p.status] || 0) + rv;
      return acc;
    }, {})
  ).map(([status, revenue]) => ({
    status: STATUS_LABELS[status] ?? status.replace(/_/g, ' '),
    revenue: revenue as number,
  })).sort((a, b) => b.revenue - a.revenue);

  // Statuses that have at least one project with revenue data (for the product-type filter pills)
  const revenueStatuses = Array.from(new Set(
    typedProjects.filter((p: any) => p.revenueImpact && parseFloat(p.revenueImpact) > 0).map((p: any) => p.status).filter(Boolean)
  ));

  // Revenue by Product Type — filtered by the selected status
  const revProductProjects = revProductFilter === "all"
    ? typedProjects
    : typedProjects.filter((p: any) => p.status === revProductFilter);

  const revenueByProductType = Object.entries(
    revProductProjects.reduce((acc: Record<string, number>, p: any) => {
      if (!p.revenueImpact || !p.productType) return acc;
      const rv = parseFloat(p.revenueImpact);
      if (!rv) return acc;
      acc[p.productType] = (acc[p.productType] || 0) + rv;
      return acc;
    }, {})
  ).map(([type, revenue]) => ({ type, revenue: revenue as number }))
    .sort((a, b) => b.revenue - a.revenue);

  const typeToggleBtn = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick}
      className={cn("p-1.5 rounded-lg transition-all text-xs font-medium px-2",
        active ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn("text-3xl font-display font-bold flex items-center gap-3", ct.isLight ? "text-gray-900" : "text-foreground")}>
          <LineChart className="w-8 h-8 text-primary" /> Analytics
        </h1>
        <p className={cn("mt-1", ct.isLight ? "text-gray-500" : "text-muted-foreground")}>
          Insights, metric and powered analysis for R&D pipeline
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: typedProjects.length, color: ct.isLight ? "text-indigo-600" : "text-primary" },
          { label: "Approved", value: typedProjects.filter((p: any) => p.status === "approved").length, color: ct.isLight ? "text-emerald-600" : "text-green-400" },
          { label: "In Progress", value: typedProjects.filter((p: any) => p.status === "in_progress").length, color: ct.isLight ? "text-cyan-600" : "text-blue-400" },
          { label: "Pushed to Live", value: typedProjects.filter((p: any) => p.status === "pushed_to_live").length, color: ct.isLight ? "text-purple-600" : "text-emerald-400" },
        ].map(kpi => (
          <div key={kpi.label} className={cn("glass-card p-5 rounded-2xl", ct.isLight && "border border-slate-200")}>
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`text-3xl font-bold font-display ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects by Product Category */}
        <ChartCard title="Projects by Product Category">
          {(full) => byProductType.length > 0 ? (
            <ResponsiveContainer width="100%" height={full ? "100%" : "100%"}>
              <BarChart data={byProductType} margin={{ top: 5, right: 5, bottom: 70, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                <XAxis dataKey="name" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                <RechartsTooltip {...ct.tooltipStyle} />
                <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
                  {byProductType.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState label="No product type data. Assign product types to projects." />}
        </ChartCard>

        {/* Stage Distribution with animation and chart type toggle */}
        <ChartCard
          title="Stage Distribution"
          controls={
            <div className="flex gap-1">
              {typeToggleBtn("Donut", stageType === "donut", () => setStageType("donut"))}
              {typeToggleBtn("Pie", stageType === "pie", () => setStageType("pie"))}
              {typeToggleBtn("Bar", stageType === "bar", () => setStageType("bar"))}
            </div>
          }
        >
          {() => byStage.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div key={stageType} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="h-full">
                <ResponsiveContainer width="100%" height="100%">
                  {stageType === "bar" ? (
                    <BarChart data={byStage} margin={{ top: 5, right: 5, bottom: 40, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                      <XAxis dataKey="stage" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                      <YAxis stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <RechartsTooltip {...ct.tooltipStyle} />
                      <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
                        {byStage.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                      </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie data={byStage} cx="50%" cy="50%"
                        innerRadius={stageType === "donut" ? 60 : 0}
                        outerRadius={100} paddingAngle={stageType === "donut" ? 4 : 0}
                        dataKey="count" nameKey="stage" stroke="none"
                        isAnimationActive animationBegin={0} animationDuration={600}>
                        {byStage.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                      </Pie>
                      <RechartsTooltip {...ct.tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, color: ct.isLight ? "#374151" : undefined }} />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </motion.div>
            </AnimatePresence>
          ) : <EmptyState label="No stage data available yet" />}
        </ChartCard>

        {/* Status Breakdown */}
        <ChartCard title="Status Breakdown">
          {() => {
            const selCls = cn(
              "text-xs rounded-lg px-2 py-1 border outline-none cursor-pointer transition-colors",
              ct.isLight ? "bg-white border-slate-200 text-gray-700" : "bg-white/5 border-white/10 text-muted-foreground"
            );
            const modeBtnCls = (active: boolean) => cn(
              "text-xs px-2.5 py-1 rounded-lg font-medium transition-all whitespace-nowrap",
              active ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            );
            const subBtnCls = (active: boolean) => cn(
              "text-xs px-2 py-1 rounded-lg font-medium transition-all whitespace-nowrap",
              active ? "bg-primary/80 text-white" : "text-muted-foreground hover:bg-white/5"
            );
            return (
              <div className="flex flex-col h-full gap-2">
                {/* Mode tabs */}
                <div className="flex items-center gap-1 flex-wrap">
                  {(["all","month","quarter","half","custom"] as StatusMode[]).map(mode => (
                    <button key={mode} onClick={() => setStatusMode(mode)} className={modeBtnCls(statusMode === mode)}>
                      {mode === "all" ? "All" : mode === "month" ? "Month" : mode === "quarter" ? "Quarter" : mode === "half" ? "Half-Year" : "Custom"}
                    </button>
                  ))}
                </div>

                {/* Sub-selectors */}
                {statusMode === "month" && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select value={statusMonth} onChange={e => setStatusMonth(Number(e.target.value))} className={selCls}>
                      {STATUS_MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                    </select>
                    <select value={statusYear} onChange={e => setStatusYear(Number(e.target.value))} className={selCls}>
                      {statusAvailableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}

                {statusMode === "quarter" && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {([1,2,3,4] as const).map(q => (
                      <button key={q} onClick={() => setStatusQuarter(q)} className={subBtnCls(statusQuarter === q)}>Q{q}</button>
                    ))}
                    <select value={statusYear} onChange={e => setStatusYear(Number(e.target.value))} className={selCls}>
                      {statusAvailableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}

                {statusMode === "half" && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["h1","h2"] as const).map(h => (
                      <button key={h} onClick={() => setStatusHalf(h)} className={subBtnCls(statusHalf === h)}>
                        {h === "h1" ? "Jan – Jun" : "Jul – Dec"}
                      </button>
                    ))}
                    <select value={statusYear} onChange={e => setStatusYear(Number(e.target.value))} className={selCls}>
                      {statusAvailableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}

                {statusMode === "custom" && (
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                    <span>From</span>
                    <select value={statusCustomFrom.month} onChange={e => setStatusCustomFrom(f => ({ ...f, month: Number(e.target.value) }))} className={selCls}>
                      {STATUS_MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                    </select>
                    <select value={statusCustomFrom.year} onChange={e => setStatusCustomFrom(f => ({ ...f, year: Number(e.target.value) }))} className={selCls}>
                      {statusAvailableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <span>to</span>
                    <select value={statusCustomTo.month} onChange={e => setStatusCustomTo(f => ({ ...f, month: Number(e.target.value) }))} className={selCls}>
                      {STATUS_MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                    </select>
                    <select value={statusCustomTo.year} onChange={e => setStatusCustomTo(f => ({ ...f, year: Number(e.target.value) }))} className={selCls}>
                      {statusAvailableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}

                {/* Chart */}
                <div className="flex-1 min-h-0">
                  {byStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byStatus} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} horizontal={false} />
                        <XAxis type="number" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} />
                        <YAxis type="category" dataKey="status" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} width={110} />
                        <RechartsTooltip {...ct.tooltipStyle} />
                        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                          {byStatus.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState label="No data for selected period" />
                  )}
                </div>
              </div>
            );
          }}
        </ChartCard>

        {/* Category Performance Radar with Bar toggle */}
        <ChartCard
          title="Category Performance Radar"
          controls={
            <div className="flex gap-1">
              <button onClick={() => setRadarType("radar")}
                className={cn("p-1.5 rounded-lg transition-all", radarType === "radar" ? "bg-primary text-white" : "text-muted-foreground hover:bg-white/5")}
                title="Radar chart">
                <Activity className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setRadarType("bar")}
                className={cn("p-1.5 rounded-lg transition-all", radarType === "bar" ? "bg-primary text-white" : "text-muted-foreground hover:bg-white/5")}
                title="Bar chart">
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
            </div>
          }
        >
          {() => radarData.some(d => d.Approved > 0 || d.InProgress > 0) ? (
            <AnimatePresence mode="wait">
              <motion.div key={radarType} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="h-full">
                <ResponsiveContainer width="100%" height="100%">
                  {radarType === "radar" ? (
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke={ct.polarGridStroke} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: ct.polarAxisColor, fontSize: 10 }} />
                      <PolarRadiusAxis tick={{ fill: ct.isLight ? "#9CA3AF" : "rgba(255,255,255,0.3)", fontSize: 9 }} />
                      <Radar name="Approved" dataKey="Approved" stroke={ct.isLight ? "#10B981" : "hsl(150,80%,50%)"} fill={ct.isLight ? "#10B981" : "hsl(150,80%,50%)"} fillOpacity={0.2} />
                      <Radar name="In Progress" dataKey="InProgress" stroke={ct.isLight ? "#06B6D4" : "hsl(190,90%,50%)"} fill={ct.isLight ? "#06B6D4" : "hsl(190,90%,50%)"} fillOpacity={0.2} />
                      <Legend wrapperStyle={{ fontSize: 12, color: ct.isLight ? "#374151" : undefined }} />
                      <RechartsTooltip {...ct.tooltipStyle} />
                    </RadarChart>
                  ) : (
                    <BarChart data={radarData} margin={{ top: 5, right: 10, bottom: 40, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                      <XAxis dataKey="subject" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                      <YAxis stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <RechartsTooltip {...ct.tooltipStyle} />
                      <Bar dataKey="Approved" name="Approved" fill={ct.isLight ? "#10B981" : "hsl(150,80%,50%)"} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="InProgress" name="In Progress" fill={ct.isLight ? "#06B6D4" : "hsl(190,90%,50%)"} radius={[4, 4, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: 12, color: ct.isLight ? "#374151" : undefined }} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </motion.div>
            </AnimatePresence>
          ) : <EmptyState label="Assign product types to projects to see this chart" />}
        </ChartCard>

        {/* Estimated Revenue by Status */}
        <ChartCard
          title="Estimated Revenue by Status"
          controls={
            <div className={cn("flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg", ct.isLight ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20")}>
              <DollarSign className="w-3 h-3" /> If all completed
            </div>
          }
        >
          {() => revenueByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByStatus} layout="vertical" margin={{ top: 5, right: 80, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} horizontal={false} />
                <XAxis type="number" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} tickFormatter={fmtRevenue} />
                <YAxis type="category" dataKey="status" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} width={130} />
                <RechartsTooltip
                  {...ct.tooltipStyle}
                  formatter={(v: any) => [fmtRevenue(Number(v)), "Est. Revenue"]}
                />
                <Bar dataKey="revenue" name="Est. Revenue" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: number) => fmtRevenue(v), fill: ct.axisColor, fontSize: 10 }}>
                  {revenueByStatus.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState label="No revenue data yet. Set Revenue Impact on projects to see this chart." />}
        </ChartCard>

        {/* Estimated Revenue by Product Type (status-filterable) */}
        <ChartCard title="Estimated Revenue by Product Type">
          {() => {
            const pillCls = (active: boolean) => cn(
              "text-xs px-2.5 py-1 rounded-lg font-medium transition-all whitespace-nowrap border",
              active
                ? "bg-primary text-white border-primary"
                : ct.isLight ? "border-slate-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
            );
            return (
              <div className="flex flex-col h-full gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => setRevProductFilter("all")} className={pillCls(revProductFilter === "all")}>All</button>
                  {revenueStatuses.map(s => (
                    <button key={s} onClick={() => setRevProductFilter(s)} className={pillCls(revProductFilter === s)}>
                      {STATUS_LABELS[s] ?? (s as string).replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-h-0">
                  {revenueByProductType.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByProductType} margin={{ top: 5, right: 5, bottom: 80, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
                        <XAxis dataKey="type" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtRevenue} />
                        <RechartsTooltip
                          {...ct.tooltipStyle}
                          formatter={(v: any) => [fmtRevenue(Number(v)), "Est. Revenue"]}
                        />
                        <Bar dataKey="revenue" name="Est. Revenue" radius={[4, 4, 0, 0]}>
                          {revenueByProductType.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState label="No revenue data for this filter. Set Revenue Impact on projects." />}
                </div>
              </div>
            );
          }}
        </ChartCard>

      </div>
    </div>
  );
}

function fmtRevenue(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      <div className="text-center">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
        <p>{label}</p>
      </div>
    </div>
  );
}
