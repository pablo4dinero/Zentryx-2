import { useState, type Dispatch, type SetStateAction } from "react";
import { useListProjects } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { TrendingUp, Maximize2, Minimize2, BarChart2, PieChart as PieIcon, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const PRODUCT_TYPES = ["Seasoning", "Snack Dusting", "Bread & Dough Premix", "Dairy Premix", "Functional Blend", "Pasta Sauce", "Sweet Flavour", "Savoury Flavour"];
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
        backgroundColor: isLight ? "#FFFFFF" : "rgba(15,17,26,0.95)",
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

export default function Analytics() {
  const { data: projects, isLoading } = useListProjects({});
  const ct = useChartTheme();
  const [stageType, setStageType] = useState<StageChartType>("donut");
  const [radarType, setRadarType] = useState<RadarChartType>("radar");

  if (isLoading) return <PageLoader />;
  const projectsList = projects || [];
  const typedProjects = projectsList as any[];

  const byProductType = PRODUCT_TYPES.map(type => ({
    name: type,
    count: typedProjects.filter(p => p.productType === type).length,
    approved: typedProjects.filter(p => p.productType === type && p.status === "approved").length,
    inProgress: typedProjects.filter(p => p.productType === type && p.status === "in_progress").length,
  })).filter(d => d.count > 0);

  const byStage = Object.entries(
    typedProjects.reduce((acc: Record<string, number>, p: any) => {
      acc[p.stage] = (acc[p.stage] || 0) + 1;
      return acc;
    }, {})
  ).map(([stage, count]) => ({ stage: stage.replace(/_/g, ' '), count }));

  const byStatus = Object.entries(
    typedProjects.reduce((acc: Record<string, number>, p: any) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([status, count]) => ({ status: status.replace(/_/g, ' '), count }));

  const radarData = PRODUCT_TYPES.slice(0, 6).map(type => ({
    subject: type.length > 12 ? type.slice(0, 12) + '…' : type,
    Approved: typedProjects.filter(p => p.productType === type && p.status === "approved").length,
    InProgress: typedProjects.filter(p => p.productType === type && p.status === "in_progress").length,
  }));

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
        <h1 className={cn("text-3xl font-display font-bold", ct.isLight ? "text-gray-900" : "text-foreground")}>Analytics</h1>
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
          {() => byStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} horizontal={false} />
                <XAxis type="number" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} tickLine={false} />
                <YAxis type="category" dataKey="status" stroke={ct.axisStroke} tick={{ fill: ct.axisColor, fontSize: 11 }} width={100} />
                <RechartsTooltip {...ct.tooltipStyle} />
                <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                  {byStatus.map((_, i) => <Cell key={i} fill={ct.colors[i % ct.colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState label="No status data" />}
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
      </div>
    </div>
  );
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
