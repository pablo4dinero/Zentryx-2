import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, FlaskConical, Star, ShieldCheck, TrendingUp, AlertTriangle,
  Zap, TestTube, Lightbulb, Send, Loader2, ChevronRight, CheckCircle2,
  XCircle, AlertCircle, Info,
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentId = "formulation" | "sensory" | "compliance" | "trendScout" | "risk" | "optimizer" | "experiment" | "insight";
type AgentStatus = "pending" | "thinking" | "done" | "error";
type OracleStatus = "idle" | "streaming" | "done" | "error";

interface AgentState {
  status: AgentStatus;
  data?: unknown;
  error?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── Agent meta ───────────────────────────────────────────────────────────────

const AGENT_META: Record<AgentId, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  formulation: { label: "Formulation", icon: FlaskConical, color: "text-violet-400",  bg: "bg-violet-500/10" },
  sensory:     { label: "Sensory",     icon: Star,         color: "text-amber-400",   bg: "bg-amber-500/10" },
  compliance:  { label: "Compliance",  icon: ShieldCheck,  color: "text-green-400",   bg: "bg-green-500/10" },
  trendScout:  { label: "Trends",      icon: TrendingUp,   color: "text-blue-400",    bg: "bg-blue-500/10" },
  risk:        { label: "Risk",        icon: AlertTriangle, color: "text-red-400",    bg: "bg-red-500/10" },
  optimizer:   { label: "Optimizer",   icon: Zap,          color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  experiment:  { label: "Experiment",  icon: TestTube,     color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  insight:     { label: "Insights",    icon: Lightbulb,    color: "text-pink-400",    bg: "bg-pink-500/10" },
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
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[200] w-52 text-xs px-3 py-2 rounded-xl bg-gray-900 text-gray-100 shadow-2xl leading-relaxed pointer-events-none"
          >
            {why}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Agent output renderers ───────────────────────────────────────────────────

function FormulationOutput({ data }: { data: any }) {
  const chartData = (data.ingredients || []).map((i: any) => ({ name: i.name, pct: i.pct }));
  return (
    <div className="space-y-4">
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-35} textAnchor="end" interval={0} />
            <YAxis unit="%" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${v}%`, "Amount"]}
            />
            <Bar dataKey="pct" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="space-y-2">
        {(data.ingredients || []).map((ing: any, i: number) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">{ing.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{ing.role}</span>
              <WhyTooltip why={ing.why} />
            </div>
            <span className="text-sm font-bold text-violet-400 ml-4 shrink-0">{ing.pct}%</span>
          </div>
        ))}
      </div>
      {data.notes && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2">{data.notes}</p>}
      {data.why && <p className="text-xs text-muted-foreground italic">{data.why}</p>}
    </div>
  );
}

function SensoryOutput({ data }: { data: any }) {
  const chartData = (data.profile || []).map((p: any) => ({
    subject: p.attribute,
    score: p.score,
    benchmark: p.benchmark,
  }));
  return (
    <div className="space-y-4">
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={chartData}>
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Radar name="Score" dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.35} />
            <Radar name="Benchmark" dataKey="benchmark" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeDasharray="4 2" />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      )}
      <div className="space-y-2">
        {(data.profile || []).map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
            <span className="text-sm text-foreground w-28 shrink-0">{p.attribute}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${(p.score / 10) * 100}%` }} />
            </div>
            <span className="text-sm font-bold text-amber-400 w-8 text-right shrink-0">{p.score}</span>
            <span className="text-xs text-muted-foreground shrink-0">/10</span>
            <WhyTooltip why={p.why} />
          </div>
        ))}
      </div>
      {data.overall && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2">{data.overall}</p>}
    </div>
  );
}

const STATUS_ICON = {
  pass: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />,
  warn: <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />,
  fail: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
};
const STATUS_COLOR = { pass: "text-green-400", warn: "text-yellow-400", fail: "text-red-400" };
const RISK_COLOR = { low: "bg-green-500/15 text-green-400", medium: "bg-yellow-500/15 text-yellow-400", high: "bg-red-500/15 text-red-400" };

function ComplianceOutput({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-muted-foreground">Overall risk:</span>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", RISK_COLOR[data.riskLevel as keyof typeof RISK_COLOR] || "bg-white/10 text-foreground")}>
          {data.riskLevel}
        </span>
      </div>
      {(data.flags || []).map((f: any, i: number) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/8">
          {STATUS_ICON[f.status as keyof typeof STATUS_ICON] || <Info className="w-4 h-4 text-muted-foreground shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{f.rule}</span>
              <span className={cn("text-[10px] font-bold uppercase", STATUS_COLOR[f.status as keyof typeof STATUS_COLOR] || "text-muted-foreground")}>
                {f.status}
              </span>
              <WhyTooltip why={f.why} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
          </div>
        </div>
      ))}
      {data.summary && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2">{data.summary}</p>}
    </div>
  );
}

const DIR_ARROW = { up: "↑", down: "↓", stable: "→" };
const DIR_COLOR = { up: "text-green-400", down: "text-red-400", stable: "text-muted-foreground" };

function TrendScoutOutput({ data }: { data: any }) {
  const chartData = (data.trends || []).map((t: any) => ({ name: t.label, strength: t.strength }));
  return (
    <div className="space-y-4">
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={100} />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${v}/100`, "Strength"]}
            />
            <Bar dataKey="strength" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="space-y-2">
        {(data.trends || []).map((t: any, i: number) => (
          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
            <span className={cn("text-base font-bold shrink-0", DIR_COLOR[t.direction as keyof typeof DIR_COLOR])}>
              {DIR_ARROW[t.direction as keyof typeof DIR_ARROW]}
            </span>
            <span className="text-sm text-foreground flex-1 min-w-0">{t.label}</span>
            <span className="text-xs font-semibold text-blue-400 shrink-0">{t.strength}/100</span>
            <WhyTooltip why={t.why} />
          </div>
        ))}
      </div>
      {data.summary && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2">{data.summary}</p>}
    </div>
  );
}

const SEV_COLOR = { low: "bg-green-500/15 text-green-400", medium: "bg-yellow-500/15 text-yellow-400", high: "bg-red-500/15 text-red-400" };

function RiskOutput({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {(data.risks || []).map((r: any, i: number) => (
        <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/8">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-medium text-foreground">{r.factor}</span>
            <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full", SEV_COLOR[r.severity as keyof typeof SEV_COLOR] || "bg-white/10 text-foreground")}>
              {r.severity}
            </span>
            <span className="text-xs text-muted-foreground">
              {r.probability}% probability
              <WhyTooltip why={r.why} />
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1"><span className="text-foreground/60">Mitigation:</span> {r.mitigation}</p>
        </div>
      ))}
      {data.overall && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2">{data.overall}</p>}
    </div>
  );
}

const IMP_COLOR = { high: "bg-pink-500/15 text-pink-400", medium: "bg-yellow-500/15 text-yellow-400", low: "bg-white/10 text-muted-foreground" };

function OptimizerOutput({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.totalSaving && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-sm font-semibold text-yellow-400">Estimated total saving: {data.totalSaving}</span>
        </div>
      )}
      {(data.suggestions || []).map((s: any, i: number) => (
        <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/8">
          <div className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{s.action}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{s.category}</span>
                <WhyTooltip why={s.why} />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-yellow-400 font-semibold">{s.saving}</span>
                <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full", IMP_COLOR[s.impact as keyof typeof IMP_COLOR] || "bg-white/10 text-foreground")}>
                  {s.impact} impact
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
      {data.priority && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2"><span className="text-foreground/60">Priority:</span> {data.priority}</p>}
    </div>
  );
}

function ExperimentOutput({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.methodology && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <TestTube className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-sm text-cyan-400 font-medium">{data.methodology}</span>
        </div>
      )}
      {(data.trials || []).map((t: any, i: number) => (
        <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/8">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">{t.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">{t.duration}</span>
            <WhyTooltip why={t.why} />
          </div>
          <p className="text-xs text-muted-foreground italic mb-1.5">H: {t.hypothesis}</p>
          <div className="flex flex-wrap gap-1.5">
            {(t.variables || []).map((v: string, j: number) => (
              <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">{v}</span>
            ))}
          </div>
        </div>
      ))}
      {data.priority && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2"><span className="text-foreground/60">Start with:</span> {data.priority}</p>}
    </div>
  );
}

const CONF_COLOR = { high: "text-green-400", medium: "text-yellow-400", low: "text-red-400" };

function InsightOutput({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.recommendation && (
        <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb className="w-4 h-4 text-pink-400 shrink-0" />
            <span className="text-xs font-semibold text-pink-400 uppercase tracking-wide">Recommendation</span>
            {data.confidence && (
              <span className={cn("text-[10px] font-bold ml-auto", CONF_COLOR[data.confidence as keyof typeof CONF_COLOR])}>
                {data.confidence} confidence
              </span>
            )}
          </div>
          <p className="text-sm text-foreground">{data.recommendation}</p>
        </div>
      )}
      {(data.keyPoints || []).map((kp: any, i: number) => (
        <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/8">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("w-2 h-2 rounded-full shrink-0", kp.importance === "high" ? "bg-pink-400" : kp.importance === "medium" ? "bg-yellow-400" : "bg-white/30")} />
            <span className="text-sm font-semibold text-foreground">{kp.title}</span>
            <WhyTooltip why={kp.why} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{kp.body}</p>
        </div>
      ))}
    </div>
  );
}

function AgentOutput({ id, state }: { id: AgentId; state: AgentState }) {
  if (state.status === "thinking") {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Analysing…</span>
      </div>
    );
  }
  if (state.status === "error") {
    return <p className="text-sm text-destructive py-4 text-center">{state.error || "Agent encountered an error"}</p>;
  }
  if (state.status !== "done" || !state.data) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>;
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

  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<Message[]>([]);
  const [status, setStatus] = useState<OracleStatus>("idle");
  const [activeAgents, setActiveAgents] = useState<AgentId[]>([]);
  const [agentStates, setAgentStates] = useState<Partial<Record<AgentId, AgentState>>>({});
  const [activeTab, setActiveTab] = useState<AgentId | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstDoneRef = useRef(true);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

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
              setAgentStates(
                Object.fromEntries((ev.agents as AgentId[]).map(a => [a, { status: "pending" }]))
              );
            } else if (ev.agent && ev.status === "thinking") {
              setAgentStates(s => ({ ...s, [ev.agent]: { status: "thinking" } }));
            } else if (ev.agent && ev.status === "done") {
              setAgentStates(s => ({ ...s, [ev.agent]: { status: "done", data: ev.data } }));
              if (firstDoneRef.current) {
                setActiveTab(ev.agent);
                firstDoneRef.current = false;
              }
            } else if (ev.agent && ev.status === "error") {
              setAgentStates(s => ({ ...s, [ev.agent]: { status: "error", error: ev.message } }));
            } else if (ev.status === "complete") {
              setStatus("done");
              setHistory(h => [...h, { role: "assistant", content: "Analysis complete. Review each agent's findings in the panel →" }]);
            }
          } catch { /* malformed SSE line, skip */ }
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
  const hasResults = Object.keys(agentStates).length > 0;

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Oracle</h1>
            <p className="text-xs text-muted-foreground">AI Food R&D Analyst · 8 specialist agents</p>
          </div>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ height: "calc(100vh - 220px)" }}>

        {/* Left — Chat */}
        <div className={cn(
          "w-[38%] flex-shrink-0 flex flex-col rounded-2xl border overflow-hidden",
          isLight ? "bg-white/80 border-slate-200 shadow-sm" : "glass-panel border-white/8"
        )}>
          {/* Chat history */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {history.length === 0 && (
              <div className="py-6 space-y-4">
                <p className="text-xs text-muted-foreground text-center">Ask Oracle anything about food R&D, formulations, compliance, trends, or costs.</p>
                <div className="space-y-2">
                  {EXAMPLE_QUERIES.map((eq, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(eq)}
                      className={cn(
                        "w-full text-left text-xs px-3 py-2.5 rounded-xl border transition-colors leading-relaxed",
                        isLight ? "border-slate-200 hover:bg-slate-50 text-slate-600" : "border-white/8 hover:bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {eq}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div className={cn(
                  "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-violet-600 to-pink-600 text-white rounded-br-sm"
                    : isLight ? "bg-slate-100 text-slate-700 rounded-bl-sm" : "bg-white/8 text-foreground rounded-bl-sm"
                )}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {status === "streaming" && history[history.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className={cn("px-3.5 py-2.5 rounded-2xl rounded-bl-sm", isLight ? "bg-slate-100" : "bg-white/8")}>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className={cn("p-3 border-t", isLight ? "border-slate-100" : "border-white/5")}>
            <div className={cn("flex gap-2 items-end rounded-xl border p-2", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
              <textarea
                ref={inputRef}
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
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-pink-600 text-white disabled:opacity-40 hover:shadow-lg hover:shadow-violet-500/30 transition-all"
              >
                {status === "streaming" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* Right — Analysis output */}
        <div className={cn(
          "flex-1 min-w-0 flex flex-col rounded-2xl border overflow-hidden",
          isLight ? "bg-white/80 border-slate-200 shadow-sm" : "glass-panel border-white/8"
        )}>
          {/* Agent tab bar */}
          <div className={cn("flex items-center gap-1 px-3 pt-3 pb-0 overflow-x-auto custom-scrollbar border-b shrink-0", isLight ? "border-slate-100" : "border-white/5")}>
            {displayAgents.map((agentId) => {
              const meta = AGENT_META[agentId];
              const state = agentStates[agentId];
              const Icon = meta.icon;
              const isActive = activeTab === agentId;
              return (
                <button
                  key={agentId}
                  onClick={() => setActiveTab(agentId)}
                  disabled={!hasResults}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0",
                    isActive
                      ? cn("border-primary", isLight ? "bg-white text-foreground" : "bg-white/8 text-foreground")
                      : cn("border-transparent", isLight ? "text-slate-500 hover:text-slate-700 hover:bg-slate-50" : "text-muted-foreground hover:text-foreground hover:bg-white/5")
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", isActive ? meta.color : "")} />
                  {meta.label}
                  {state?.status === "thinking" && <Loader2 className="w-2.5 h-2.5 animate-spin text-primary ml-0.5" />}
                  {state?.status === "done" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 ml-0.5" />}
                  {state?.status === "error" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Output area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            {!hasResults && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-12">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-600/20 to-pink-600/20 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-violet-400 opacity-60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Oracle is ready</p>
                  <p className="text-xs text-muted-foreground mt-1">Submit a query to activate the 8 specialist agents</p>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {ALL_AGENTS.map(id => {
                    const meta = AGENT_META[id];
                    const Icon = meta.icon;
                    return (
                      <div key={id} className={cn("flex flex-col items-center gap-1 p-2.5 rounded-xl", meta.bg)}>
                        <Icon className={cn("w-4 h-4", meta.color)} />
                        <span className="text-[9px] text-muted-foreground font-medium">{meta.label}</span>
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    {(() => {
                      const meta = AGENT_META[activeTab];
                      const Icon = meta.icon;
                      return (
                        <>
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", meta.bg)}>
                            <Icon className={cn("w-4 h-4", meta.color)} />
                          </div>
                          <h2 className="text-sm font-semibold text-foreground">{meta.label} Analysis</h2>
                        </>
                      );
                    })()}
                  </div>
                  <AgentOutput id={activeTab} state={agentStates[activeTab]!} />
                </motion.div>
              </AnimatePresence>
            )}

            {hasResults && !activeTab && (
              <p className="text-sm text-muted-foreground text-center py-8">Select an agent tab to view its analysis</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
