import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, Clock, DollarSign, CheckCircle } from "lucide-react";

const COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

interface Props { projects: any[] }

export function AnalyticsView({ projects }: Props) {
  const stats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => ["approved", "pushed_to_live"].includes(p.status)).length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const avgProgress = total > 0
      ? Math.round(projects.reduce((acc, p) => acc + (p.taskCount > 0 ? (p.completedTaskCount / p.taskCount) * 100 : 0), 0) / total)
      : 0;
    const avgCost = projects.filter(p => p.costTarget).length > 0
      ? Math.round(projects.filter(p => p.costTarget).reduce((acc, p) => acc + parseFloat(p.costTarget || "0"), 0) / projects.filter(p => p.costTarget).length)
      : 0;
    const active = projects.filter(p => p.status === "in_progress").length;
    return { total, successRate, avgProgress, avgCost, active };
  }, [projects]);

  const stageData = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => { counts[p.stage] = (counts[p.stage] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [projects]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [projects]);

  const progressByType = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    projects.forEach(p => {
      const type = p.productType || "Other";
      if (!map[type]) map[type] = { total: 0, count: 0 };
      map[type].total += p.taskCount > 0 ? (p.completedTaskCount / p.taskCount) * 100 : 0;
      map[type].count += 1;
    });
    return Object.entries(map).map(([name, v]) => ({ name, progress: Math.round(v.total / v.count) }));
  }, [projects]);

  const costData = useMemo(() => {
    return projects
      .filter(p => p.costTarget)
      .map(p => ({
        name: p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name,
        cost: parseFloat(p.costTarget),
        progress: p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);
  }, [projects]);

  const tooltipStyle = {
    backgroundColor: "rgba(15,15,25,0.95)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    color: "#e2e8f0",
    fontSize: "12px",
  };

  const KPI_CARDS = [
    { label: "Success Rate", value: `${stats.successRate}%`, icon: <TrendingUp className="w-5 h-5" />, color: "from-violet-600 to-violet-400", bg: "rgba(124,58,237,0.12)" },
    { label: "Avg Progress", value: `${stats.avgProgress}%`, icon: <CheckCircle className="w-5 h-5" />, color: "from-blue-600 to-blue-400", bg: "rgba(59,130,246,0.12)" },
    { label: "Active Projects", value: stats.active, icon: <Clock className="w-5 h-5" />, color: "from-amber-500 to-amber-300", bg: "rgba(245,158,11,0.12)" },
    { label: "Avg Cost Target", value: stats.avgCost ? `R${stats.avgCost.toLocaleString()}` : "—", icon: <DollarSign className="w-5 h-5" />, color: "from-emerald-500 to-emerald-300", bg: "rgba(16,185,129,0.12)" },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-5 border border-white/10" style={{ background: k.bg }}>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center text-white mb-3`}>
              {k.icon}
            </div>
            <p className="text-2xl font-bold font-display text-foreground">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={fadeUp} className="glass-card rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects by Stage</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={stageData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {stageData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeUp} className="glass-card rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-foreground mb-4">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeUp} className="glass-card rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-foreground mb-4">Progress by Product Type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={progressByType}>
              <defs>
                <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Avg Progress"]} />
              <Area type="monotone" dataKey="progress" stroke="#7c3aed" strokeWidth={2} fill="url(#pgGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeUp} className="glass-card rounded-2xl p-6 border border-white/10">
          <h3 className="text-sm font-semibold text-foreground mb-4">Cost Target vs Progress</h3>
          {costData.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No cost data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={costData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{v}</span>} />
                <Bar yAxisId="left" dataKey="cost" name="Cost (R)" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="progress" name="Progress %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
