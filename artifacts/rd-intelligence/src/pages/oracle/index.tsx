import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, FlaskConical, Star, ShieldCheck, TrendingUp, AlertTriangle,
  Zap, TestTube, Lightbulb, Send, Loader2, ChevronRight, CheckCircle2,
  XCircle, AlertCircle, Info, MapPin,
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from "recharts";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentId = "formulation" | "sensory" | "compliance" | "trendScout" | "risk" | "optimizer" | "experiment" | "insight";
type AgentStatus = "pending" | "thinking" | "done" | "error";
type OracleStatus = "idle" | "streaming" | "done" | "error";

interface AgentState { status: AgentStatus; data?: unknown; error?: string; }
interface Message { role: "user" | "assistant"; content: string; }

// ─── Agent meta ───────────────────────────────────────────────────────────────

const AGENT_META: Record<AgentId, { label: string; icon: React.ElementType; color: string; bg: string; accent: string }> = {
  formulation: { label: "Formulation", icon: FlaskConical, color: "text-violet-400",  bg: "bg-violet-500/10",  accent: "#8b5cf6" },
  sensory:     { label: "Sensory",     icon: Star,         color: "text-amber-400",   bg: "bg-amber-500/10",   accent: "#f59e0b" },
  compliance:  { label: "Compliance",  icon: ShieldCheck,  color: "text-green-400",   bg: "bg-green-500/10",   accent: "#22c55e" },
  trendScout:  { label: "Trends",      icon: TrendingUp,   color: "text-blue-400",    bg: "bg-blue-500/10",    accent: "#3b82f6" },
  risk:        { label: "Risk",        icon: AlertTriangle, color: "text-red-400",    bg: "bg-red-500/10",     accent: "#ef4444" },
  optimizer:   { label: "Optimizer",   icon: Zap,          color: "text-yellow-400",  bg: "bg-yellow-500/10",  accent: "#eab308" },
  experiment:  { label: "Experiment",  icon: TestTube,     color: "text-cyan-400",    bg: "bg-cyan-500/10",    accent: "#06b6d4" },
  insight:     { label: "Insights",    icon: Lightbulb,    color: "text-pink-400",    bg: "bg-pink-500/10",    accent: "#ec4899" },
};

const ALL_AGENTS: AgentId[] = ["formulation", "sensory", "compliance", "trendScout", "risk", "optimizer", "experiment", "insight"];

// ─── WhyTooltip ───────────────────────────────────────────────────────────────

function WhyTooltip({ why }: { why: string }) {
  const [show, setShow] = useState(false);
  if (!why) return null;
  return (
    <span className="relative inline-flex ml-1 align-middle">
      <span
        className="w-4 h-4 rounded-full bg-white/10 text-[9px] font-bold flex items-center justify-center cursor-help text-muted-foreground hover:text-primary hover:bg-primary/15 transition-colors select-none"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        ?
      </span>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.1 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[200] w-56 text-xs px-3 py-2.5 rounded-xl bg-gray-900 text-gray-100 shadow-2xl leading-relaxed pointer-events-none"
          >
            {why}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Shared section label ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">{children}</p>
  );
}

// ─── Formulation ─────────────────────────────────────────────────────────────

function FormulationOutput({ data }: { data: any }) {
  const ingredients = data.ingredients || [];
  const COLORS = ["#8b5cf6", "#a78bfa", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#ddd6fe", "#ede9fe"];
  return (
    <div className="space-y-6">
      {ingredients.length > 0 && (
        <div>
          <SectionLabel>Ingredient Breakdown</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ingredients.map((i: any) => ({ name: i.name, pct: i.pct }))} margin={{ top: 4, right: 12, left: -20, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} angle={-40} textAnchor="end" interval={0} />
              <YAxis unit="%" tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 12, padding: "8px 12px" }}
                formatter={(v: number) => [`${v}%`, "Percentage"]}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {ingredients.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <SectionLabel>Ingredient Details</SectionLabel>
        <div className="rounded-xl overflow-hidden border border-white/8">
          {ingredients.map((ing: any, i: number) => (
            <div key={i} className={cn(
              "flex items-center gap-4 px-4 py-3",
              i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent",
              i < ingredients.length - 1 && "border-b border-white/5",
            )}>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">{ing.name}</span>
                {ing.role && <span className="text-xs text-muted-foreground ml-2">· {ing.role}</span>}
                <WhyTooltip why={ing.why} />
              </div>
              <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(ing.pct, 100)}%`, background: COLORS[i % COLORS.length] }} />
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: COLORS[i % COLORS.length] }}>{ing.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {data.notes && (
        <div className="flex gap-3 p-4 rounded-xl bg-violet-500/8 border border-violet-500/15">
          <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">{data.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Sensory ─────────────────────────────────────────────────────────────────

function SensoryOutput({ data }: { data: any }) {
  const profile = data.profile || [];
  return (
    <div className="space-y-6">
      {profile.length > 0 && (
        <div>
          <SectionLabel>Sensory Radar</SectionLabel>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={profile.map((p: any) => ({ subject: p.attribute, score: p.score, benchmark: p.benchmark }))} outerRadius="75%">
              <PolarGrid stroke="rgba(255,255,255,0.07)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b" }} />
              <Radar name="Score" dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} strokeWidth={2} />
              <Radar name="Benchmark" dataKey="benchmark" stroke="#6366f1" fill="#6366f1" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="5 3" />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 12, padding: "8px 12px" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <SectionLabel>Attribute Scores</SectionLabel>
        <div className="space-y-3">
          {profile.map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-[120px_1fr_48px_auto] items-center gap-3">
              <span className="text-sm text-foreground truncate">{p.attribute}</span>
              <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-500/30" style={{ width: `${(p.benchmark / 10) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all" style={{ width: `${(p.score / 10) * 100}%` }} />
              </div>
              <span className="text-sm font-bold text-amber-400 tabular-nums text-right">{p.score}<span className="text-xs text-muted-foreground font-normal">/10</span></span>
              <WhyTooltip why={p.why} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-amber-400 inline-block" /> Score</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-indigo-500/50 inline-block" /> Benchmark</span>
        </div>
      </div>

      {data.overall && (
        <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/15">
          <Star className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">{data.overall}</p>
        </div>
      )}
    </div>
  );
}

// ─── Compliance ───────────────────────────────────────────────────────────────

const STATUS_ICON = {
  pass: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />,
  warn: <AlertCircle  className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />,
  fail: <XCircle      className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />,
};
const STATUS_BADGE = {
  pass: "bg-green-500/15 text-green-400 border-green-500/20",
  warn: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  fail: "bg-red-500/15 text-red-400 border-red-500/20",
};
const RISK_BADGE = {
  low:    "bg-green-500/15 text-green-400",
  medium: "bg-yellow-500/15 text-yellow-400",
  high:   "bg-red-500/15 text-red-400",
};

function ComplianceOutput({ data }: { data: any }) {
  const flags = data.flags || [];
  const passCount = flags.filter((f: any) => f.status === "pass").length;
  const warnCount = flags.filter((f: any) => f.status === "warn").length;
  const failCount = flags.filter((f: any) => f.status === "fail").length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className={cn("col-span-1 flex flex-col items-center p-3 rounded-xl border", RISK_BADGE[data.riskLevel as keyof typeof RISK_BADGE] || "bg-white/5 text-foreground", "border-white/8")}>
          <span className="text-lg font-bold tabular-nums">{data.riskLevel?.toUpperCase()}</span>
          <span className="text-[10px] mt-0.5 opacity-70">Risk Level</span>
        </div>
        {[
          { label: "Pass",    count: passCount, cls: "text-green-400 bg-green-500/8 border-green-500/15" },
          { label: "Warning", count: warnCount, cls: "text-yellow-400 bg-yellow-500/8 border-yellow-500/15" },
          { label: "Fail",    count: failCount, cls: "text-red-400 bg-red-500/8 border-red-500/15" },
        ].map(({ label, count, cls }) => (
          <div key={label} className={cn("flex flex-col items-center p-3 rounded-xl border", cls)}>
            <span className="text-xl font-bold tabular-nums">{count}</span>
            <span className="text-[10px] mt-0.5 opacity-70">{label}</span>
          </div>
        ))}
      </div>

      <div>
        <SectionLabel>Compliance Checks</SectionLabel>
        <div className="space-y-2.5">
          {flags.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.05] transition-colors">
              {STATUS_ICON[f.status as keyof typeof STATUS_ICON] || <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{f.rule}</span>
                  <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", STATUS_BADGE[f.status as keyof typeof STATUS_BADGE] || "bg-white/10 text-foreground border-white/10")}>
                    {f.status}
                  </span>
                  <WhyTooltip why={f.why} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.summary && (
        <div className="flex gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/15">
          <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </div>
      )}
    </div>
  );
}

// ─── Trend Scout ─────────────────────────────────────────────────────────────

const DIR_META = {
  up:     { arrow: "↑", color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Rising" },
  down:   { arrow: "↓", color: "text-red-400",     bg: "bg-red-500/10",     label: "Declining" },
  stable: { arrow: "→", color: "text-blue-400",    bg: "bg-blue-500/10",    label: "Stable" },
};

function StrengthBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const fill = pct >= 75 ? "#22c55e" : pct >= 50 ? "#3b82f6" : pct >= 30 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: fill }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: fill, minWidth: 44 }}>{value}/100</span>
    </div>
  );
}

function TrendScoutOutput({ data }: { data: any }) {
  const trends = data.trends || [];
  const sorted = [...trends].sort((a: any, b: any) => b.strength - a.strength);

  const upCount     = trends.filter((t: any) => t.direction === "up").length;
  const stableCount = trends.filter((t: any) => t.direction === "stable").length;
  const downCount   = trends.filter((t: any) => t.direction === "down").length;

  return (
    <div className="space-y-5">
      {/* Region + summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {data.region && (
          <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15 font-medium">
            <MapPin className="w-3 h-3" />{data.region}
          </span>
        )}
        {upCount > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-medium">
            ↑ {upCount} Rising
          </span>
        )}
        {stableCount > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-blue-500/8 text-blue-400 border border-blue-500/15 font-medium">
            → {stableCount} Stable
          </span>
        )}
        {downCount > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/15 font-medium">
            ↓ {downCount} Declining
          </span>
        )}
      </div>

      {/* Trend table */}
      <div>
        <SectionLabel>Trend Strength Rankings</SectionLabel>
        <div className="space-y-1">
          {/* Header row */}
          <div className="grid grid-cols-[28px_1fr_160px_auto] items-center gap-3 px-4 pb-2 border-b border-white/8">
            <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wide">#</span>
            <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wide">Trend</span>
            <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wide">Strength</span>
            <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wide w-8" />
          </div>
          {sorted.map((t: any, i: number) => {
            const dir = DIR_META[t.direction as keyof typeof DIR_META] || DIR_META.stable;
            return (
              <div
                key={i}
                className="grid grid-cols-[28px_1fr_160px_auto] items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors group"
              >
                {/* Rank + direction */}
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0", dir.bg, dir.color)}>
                  {dir.arrow}
                </div>

                {/* Trend name — full width, never truncated */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">{t.label}</p>
                  <p className={cn("text-[10px] font-medium mt-0.5", dir.color)}>{dir.label}</p>
                </div>

                {/* Animated strength bar */}
                <StrengthBar value={t.strength} color={dir.color} />

                {/* WhyTooltip */}
                <div className="shrink-0">
                  <WhyTooltip why={t.why} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.summary && (
        <div className="flex gap-3 p-4 rounded-xl bg-blue-500/8 border border-blue-500/15">
          <TrendingUp className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </div>
      )}
    </div>
  );
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

const SEV_META = {
  low:    { cls: "bg-green-500/15 text-green-400 border-green-500/20",  bar: "#22c55e" },
  medium: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", bar: "#eab308" },
  high:   { cls: "bg-red-500/15 text-red-400 border-red-500/20",       bar: "#ef4444" },
};

function RiskOutput({ data }: { data: any }) {
  const risks = data.risks || [];
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Risk Factors</SectionLabel>
        <div className="space-y-3">
          {risks.map((r: any, i: number) => {
            const sev = SEV_META[r.severity as keyof typeof SEV_META] || SEV_META.medium;
            return (
              <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/8 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-foreground">{r.factor}</span>
                      <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", sev.cls)}>
                        {r.severity}
                      </span>
                      <WhyTooltip why={r.why} />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-muted-foreground shrink-0">Probability</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${r.probability}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ background: sev.bar }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: sev.bar }}>{r.probability}%</span>
                    </div>
                  </div>
                </div>
                <div className="pl-0 flex gap-2">
                  <span className="text-xs text-muted-foreground/60 shrink-0 pt-0.5">Mitigation:</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.mitigation}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.overall && (
        <div className="flex gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/15">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">{data.overall}</p>
        </div>
      )}
    </div>
  );
}

// ─── Optimizer ────────────────────────────────────────────────────────────────

const IMP_META = {
  high:   { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  medium: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",   dot: "bg-yellow-400" },
  low:    { cls: "bg-slate-500/15 text-slate-400 border-slate-500/20",       dot: "bg-slate-400" },
};

function OptimizerOutput({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      {data.totalSaving && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <div className="w-9 h-9 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <div>
            <p className="text-xs text-yellow-400/70 font-medium uppercase tracking-wide">Estimated Total Saving</p>
            <p className="text-lg font-bold text-yellow-400">{data.totalSaving}</p>
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Optimisation Opportunities</SectionLabel>
        <div className="space-y-2.5">
          {(data.suggestions || []).map((s: any, i: number) => {
            const imp = IMP_META[s.impact as keyof typeof IMP_META] || IMP_META.medium;
            return (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.05] transition-colors">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                  <span className="text-xs font-bold text-muted-foreground/40 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <div className={cn("w-1.5 h-1.5 rounded-full", imp.dot)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground leading-snug">{s.action}</p>
                    <span className="text-sm font-bold text-yellow-400 shrink-0">{s.saving}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground capitalize bg-white/5 px-2 py-0.5 rounded-full">{s.category}</span>
                    <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border", imp.cls)}>
                      {s.impact} impact
                    </span>
                    <WhyTooltip why={s.why} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.priority && (
        <div className="flex gap-3 p-4 rounded-xl bg-yellow-500/8 border border-yellow-500/15">
          <ChevronRight className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed"><span className="text-foreground font-medium">Start with: </span>{data.priority}</p>
        </div>
      )}
    </div>
  );
}

// ─── Experiment ───────────────────────────────────────────────────────────────

function ExperimentOutput({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      {data.methodology && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
            <TestTube className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-[10px] text-cyan-400/70 font-medium uppercase tracking-wide">Methodology</p>
            <p className="text-sm font-semibold text-cyan-300">{data.methodology}</p>
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Recommended Trials</SectionLabel>
        <div className="space-y-3">
          {(data.trials || []).map((t: any, i: number) => (
            <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/8 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/15 text-cyan-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <WhyTooltip why={t.why} />
                    </div>
                    <p className="text-xs text-muted-foreground italic mt-1 leading-relaxed">{t.hypothesis}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground bg-white/5 px-2.5 py-1 rounded-lg shrink-0 font-medium">{t.duration}</span>
              </div>
              {(t.variables || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-9">
                  {t.variables.map((v: string, j: number) => (
                    <span key={j} className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 font-medium">{v}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {data.priority && (
        <div className="flex gap-3 p-4 rounded-xl bg-cyan-500/8 border border-cyan-500/15">
          <ChevronRight className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed"><span className="text-foreground font-medium">Start with: </span>{data.priority}</p>
        </div>
      )}
    </div>
  );
}

// ─── Insight ─────────────────────────────────────────────────────────────────

const CONF_META = {
  high:   { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  medium: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
  low:    { cls: "bg-red-500/15 text-red-400 border-red-500/20" },
};
const IMP_DOT = { high: "bg-pink-400", medium: "bg-yellow-400", low: "bg-white/20" };

function InsightOutput({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      {data.recommendation && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-pink-500/10 to-violet-500/10 border border-pink-500/20 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-pink-400 shrink-0" />
              <span className="text-xs font-semibold text-pink-400 uppercase tracking-wide">Key Recommendation</span>
            </div>
            {data.confidence && (
              <span className={cn("text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border", CONF_META[data.confidence as keyof typeof CONF_META]?.cls || "bg-white/10 text-foreground border-white/10")}>
                {data.confidence} confidence
              </span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed font-medium">{data.recommendation}</p>
        </div>
      )}

      <div>
        <SectionLabel>Key Insights</SectionLabel>
        <div className="space-y-2.5">
          {(data.keyPoints || []).map((kp: any, i: number) => (
            <div key={i} className="flex gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.05] transition-colors">
              <div className="flex flex-col items-center gap-2 shrink-0 pt-1">
                <div className={cn("w-2 h-2 rounded-full", IMP_DOT[kp.importance as keyof typeof IMP_DOT] || "bg-white/20")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-foreground">{kp.title}</p>
                  <WhyTooltip why={kp.why} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{kp.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Agent output dispatcher ─────────────────────────────────────────────────

function AgentOutput({ id, state }: { id: AgentId; state: AgentState }) {
  if (state.status === "thinking") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-sm">Analysing with {AGENT_META[id].label} agent…</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <XCircle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-destructive">{state.error || "Agent encountered an error"}</p>
      </div>
    );
  }
  if (state.status !== "done" || !state.data) {
    return <p className="text-sm text-muted-foreground py-12 text-center">No data yet</p>;
  }
  const d = state.data as any;
  if (id === "formulation") return <FormulationOutput data={d} />;
  if (id === "sensory")     return <SensoryOutput data={d} />;
  if (id === "compliance")  return <ComplianceOutput data={d} />;
  if (id === "trendScout")  return <TrendScoutOutput data={d} />;
  if (id === "risk")        return <RiskOutput data={d} />;
  if (id === "optimizer")   return <OptimizerOutput data={d} />;
  if (id === "experiment")  return <ExperimentOutput data={d} />;
  if (id === "insight")     return <InsightOutput data={d} />;
  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EXAMPLE_QUERIES = [
  "Analyse my jollof seasoning blend — 40% tomato, 30% onion powder, 15% salt, 10% pepper, 5% spices",
  "What are the compliance risks for launching a probiotic dairy premix in Nigeria?",
  "Suggest cost optimisation strategies for our snack dusting formulation",
  "Trending ingredients in West African savoury food products for 2025",
];

export default function OraclePage() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [query, setQuery]           = useState("");
  const [history, setHistory]       = useState<Message[]>([]);
  const [status, setStatus]         = useState<OracleStatus>("idle");
  const [activeAgents, setActiveAgents] = useState<AgentId[]>([]);
  const [agentStates, setAgentStates]   = useState<Partial<Record<AgentId, AgentState>>>({});
  const [activeTab, setActiveTab]   = useState<AgentId | null>(null);

  const chatEndRef    = useRef<HTMLDivElement>(null);
  const firstDoneRef  = useRef(true);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history]);

  const handleSubmit = async () => {
    const q = query.trim();
    if (!q || status === "streaming") return;

    setQuery("");
    setHistory(h => [...h, { role: "user", content: q }]);
    setAgentStates({});
    setActiveAgents([]);
    setActiveTab(null);
    setStatus("streaming");
    firstDoneRef.current = true;

    try {
      const res = await fetch(`${BASE}api/oracle/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Oracle unavailable" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(part.slice(6));
            if (ev.status === "started") {
              setActiveAgents(ev.agents);
              setAgentStates(Object.fromEntries((ev.agents as AgentId[]).map(a => [a, { status: "pending" }])));
            } else if (ev.agent && ev.status === "thinking") {
              setAgentStates(s => ({ ...s, [ev.agent]: { status: "thinking" } }));
            } else if (ev.agent && ev.status === "done") {
              setAgentStates(s => ({ ...s, [ev.agent]: { status: "done", data: ev.data } }));
              if (firstDoneRef.current) { setActiveTab(ev.agent); firstDoneRef.current = false; }
            } else if (ev.agent && ev.status === "error") {
              setAgentStates(s => ({ ...s, [ev.agent]: { status: "error", error: ev.message } }));
            } else if (ev.status === "complete") {
              setStatus("done");
              setHistory(h => [...h, { role: "assistant", content: "Analysis complete. Review each agent's findings in the panel →" }]);
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Oracle encountered an error";
      setStatus("error");
      setHistory(h => [...h, { role: "assistant", content: `Error: ${msg}` }]);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const displayAgents = activeAgents.length > 0 ? activeAgents : ALL_AGENTS;
  const hasResults    = Object.keys(agentStates).length > 0;

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Oracle</h1>
            <p className="text-xs text-muted-foreground mt-0.5">AI Food R&D Analyst · 8 specialist agents</p>
          </div>
        </div>
        {status === "done" && (
          <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            Analysis complete
          </span>
        )}
        {status === "streaming" && (
          <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
            <Loader2 className="w-3 h-3 animate-spin" /> Running agents…
          </span>
        )}
      </div>

      {/* ── Split panel ─────────────────────────────────────────── */}
      <div className="flex gap-5 flex-1 min-h-0" style={{ height: "calc(100vh - 200px)" }}>

        {/* Left — Chat */}
        <div className={cn(
          "w-[36%] flex-shrink-0 flex flex-col rounded-2xl border overflow-hidden",
          isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/8",
        )}>
          <div className={cn("px-4 py-3 border-b shrink-0", isLight ? "border-slate-100" : "border-white/5")}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Query</p>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {history.length === 0 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Ask about formulations, compliance, trends, costs, or any R&D question.
                </p>
                <div className="space-y-2">
                  {EXAMPLE_QUERIES.map((eq, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(eq)}
                      className={cn(
                        "w-full text-left text-xs px-3.5 py-3 rounded-xl border transition-all leading-relaxed hover:-translate-y-px",
                        isLight
                          ? "border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600"
                          : "border-white/8 hover:bg-white/5 hover:border-white/15 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {eq}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-violet-600 to-pink-600 text-white rounded-br-sm"
                    : isLight ? "bg-slate-100 text-slate-700 rounded-bl-sm" : "bg-white/8 text-foreground rounded-bl-sm",
                )}>
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {status === "streaming" && history[history.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className={cn("px-4 py-2.5 rounded-2xl rounded-bl-sm", isLight ? "bg-slate-100" : "bg-white/8")}>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className={cn("p-3 border-t shrink-0", isLight ? "border-slate-100" : "border-white/5")}>
            <div className={cn(
              "flex gap-2 items-end rounded-xl border p-2.5",
              isLight ? "border-slate-200 bg-slate-50 focus-within:border-violet-300 focus-within:bg-white" : "border-white/10 bg-white/5 focus-within:border-white/20",
              "transition-colors",
            )}>
              <textarea
                rows={2}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none leading-relaxed"
                placeholder="Describe your product or ask a question…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                disabled={status === "streaming"}
              />
              <button
                onClick={handleSubmit}
                disabled={!query.trim() || status === "streaming"}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 text-white disabled:opacity-40 hover:shadow-lg hover:shadow-violet-500/30 active:scale-95 transition-all"
              >
                {status === "streaming" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pl-1">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* Right — Analysis */}
        <div className={cn(
          "flex-1 min-w-0 flex flex-col rounded-2xl border overflow-hidden",
          isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/8",
        )}>
          {/* Tab bar */}
          <div className={cn(
            "flex items-center gap-0.5 px-4 pt-3 pb-0 border-b shrink-0 overflow-x-auto custom-scrollbar",
            isLight ? "border-slate-100" : "border-white/5",
          )}>
            {displayAgents.map((agentId) => {
              const meta  = AGENT_META[agentId];
              const state = agentStates[agentId];
              const Icon  = meta.icon;
              const isActive = activeTab === agentId;
              return (
                <button
                  key={agentId}
                  onClick={() => hasResults && setActiveTab(agentId)}
                  disabled={!hasResults}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap transition-all border-b-2 -mb-px shrink-0 rounded-t-lg",
                    isActive
                      ? cn("border-primary", isLight ? "bg-slate-50 text-foreground" : "bg-white/6 text-foreground")
                      : cn("border-transparent", isLight ? "text-slate-500 hover:text-slate-700 hover:bg-slate-50/70" : "text-muted-foreground hover:text-foreground hover:bg-white/4"),
                    !hasResults && "opacity-40 cursor-default",
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive && meta.color)} />
                  <span>{meta.label}</span>
                  {state?.status === "thinking" && <Loader2 className="w-2.5 h-2.5 animate-spin text-primary ml-0.5" />}
                  {state?.status === "done"     && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5 shrink-0" />}
                  {state?.status === "error"    && <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Output area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {!hasResults && (
              <div className="h-full flex flex-col items-center justify-center gap-6 text-center py-8">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600/15 to-pink-600/15 flex items-center justify-center border border-white/5">
                  <Brain className="w-9 h-9 text-violet-400 opacity-50" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-foreground">Oracle is ready</p>
                  <p className="text-sm text-muted-foreground max-w-xs">Submit a query to activate the specialist agents. Results stream in as each agent completes.</p>
                </div>
                <div className="grid grid-cols-4 gap-2.5 mt-2">
                  {ALL_AGENTS.map(id => {
                    const meta = AGENT_META[id];
                    const Icon = meta.icon;
                    return (
                      <div key={id} className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/5", meta.bg)}>
                        <Icon className={cn("w-4 h-4", meta.color)} />
                        <span className="text-[9px] text-muted-foreground font-medium leading-tight text-center">{meta.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasResults && activeTab && agentStates[activeTab] && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Agent output header */}
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                    {(() => {
                      const meta = AGENT_META[activeTab];
                      const Icon = meta.icon;
                      return (
                        <>
                          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
                            <Icon className={cn("w-4 h-4", meta.color)} />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-foreground">{meta.label} Analysis</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">AI-generated · Oracle specialist agent</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <AgentOutput id={activeTab} state={agentStates[activeTab]!} />
                </motion.div>
              </AnimatePresence>
            )}

            {hasResults && !activeTab && (
              <p className="text-sm text-muted-foreground text-center py-12">Select an agent tab above to view its analysis</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
