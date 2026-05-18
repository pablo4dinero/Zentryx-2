import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain, FlaskConical, Star, ShieldCheck, TrendingUp, AlertTriangle,
  Zap, TestTube, Lightbulb, Send, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertCircle, Info, MapPin, Loader2,
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
type AgentStatus = "thinking" | "done" | "error";

interface OracleMessage {
  id: string;
  role: "user" | "oracle";
  text: string;
  streaming: boolean;
  agentStatuses: Partial<Record<AgentId, AgentStatus>>;
  agentData: Partial<Record<AgentId, unknown>>;
  intent?: { kind: "conversational" | "agents"; agents: AgentId[] };
}

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

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-muted-foreground/40"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

// ─── Agent status chips ───────────────────────────────────────────────────────

function AgentChips({ statuses }: { statuses: Partial<Record<AgentId, AgentStatus>> }) {
  const entries = Object.entries(statuses) as [AgentId, AgentStatus][];
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {entries.map(([id, status]) => {
        const meta = AGENT_META[id];
        const Icon = meta.icon;
        return (
          <span key={id} className={cn(
            "flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border",
            status === "done"     ? `${meta.bg} ${meta.color} border-transparent` :
            status === "thinking" ? "bg-white/5 text-muted-foreground border-white/10" :
                                    "bg-red-500/10 text-red-400 border-red-500/15",
          )}>
            <Icon className="w-2.5 h-2.5 shrink-0" />
            {meta.label}
            {status === "thinking" && <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />}
            {status === "done"     && <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />}
            {status === "error"    && <XCircle className="w-2.5 h-2.5 shrink-0" />}
          </span>
        );
      })}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">{children}</p>;
}

function WhyTooltip({ why }: { why: string }) {
  const [show, setShow] = useState(false);
  if (!why) return null;
  return (
    <span className="relative inline-flex ml-1 align-middle">
      <span
        className="w-3.5 h-3.5 rounded-full bg-white/10 text-[9px] font-bold flex items-center justify-center cursor-help text-muted-foreground hover:text-primary transition-colors select-none"
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      >?</span>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.1 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[200] w-52 text-[11px] px-3 py-2 rounded-xl bg-gray-900 text-gray-100 shadow-2xl leading-relaxed pointer-events-none">
            {why}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Inline agent output components ──────────────────────────────────────────

function InlineFormulation({ data }: { data: any }) {
  const ingredients = data.ingredients || [];
  const COLORS = ["#8b5cf6","#a78bfa","#7c3aed","#6d28d9","#5b21b6","#4c1d95","#ddd6fe","#ede9fe"];
  return (
    <div className="space-y-3">
      {ingredients.length > 0 && (
        <div>
          <SectionLabel>Ingredient Breakdown</SectionLabel>
          <div className="rounded-xl overflow-hidden border border-white/8">
            {ingredients.map((ing: any, i: number) => (
              <div key={i} className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent",
                i < ingredients.length - 1 && "border-b border-white/5",
              )}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground">{ing.name}</span>
                  {ing.role && <span className="text-[10px] text-muted-foreground ml-1.5">· {ing.role}</span>}
                  <WhyTooltip why={ing.why} />
                </div>
                <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(ing.pct,100)}%`, background: COLORS[i%COLORS.length] }} />
                </div>
                <span className="text-xs font-bold tabular-nums shrink-0 w-10 text-right" style={{ color: COLORS[i%COLORS.length] }}>{ing.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.notes && (
        <div className="flex gap-2 p-3 rounded-xl bg-violet-500/8 border border-violet-500/15">
          <Info className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">{data.notes}</p>
        </div>
      )}
    </div>
  );
}

function InlineSensory({ data }: { data: any }) {
  const profile = data.profile || [];
  return (
    <div className="space-y-3">
      {profile.length > 0 && (
        <div>
          <SectionLabel>Sensory Radar</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={profile.map((p:any)=>({ subject: p.attribute, score: p.score, benchmark: p.benchmark }))} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.07)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "#64748b" }} />
              <Radar name="Score" dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} strokeWidth={2} />
              <Radar name="Benchmark" dataKey="benchmark" stroke="#6366f1" fill="#6366f1" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="5 3" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.overall && (
        <div className="flex gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
          <Star className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">{data.overall}</p>
        </div>
      )}
    </div>
  );
}

const STATUS_ICON = {
  pass: <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />,
  warn: <AlertCircle  className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />,
  fail: <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
};
const STATUS_BADGE = {
  pass: "bg-green-500/15 text-green-400 border-green-500/20",
  warn: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  fail: "bg-red-500/15 text-red-400 border-red-500/20",
};
const RISK_BADGE = { low: "bg-green-500/15 text-green-400", medium: "bg-yellow-500/15 text-yellow-400", high: "bg-red-500/15 text-red-400" };

function InlineCompliance({ data }: { data: any }) {
  const flags = data.flags || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("text-xs font-bold px-3 py-1 rounded-full", RISK_BADGE[data.riskLevel as keyof typeof RISK_BADGE] || "bg-white/10 text-foreground")}>
          {data.riskLevel?.toUpperCase()} RISK
        </span>
        {[{l:"Pass",c:flags.filter((f:any)=>f.status==="pass").length,cls:"text-green-400"},{l:"Warn",c:flags.filter((f:any)=>f.status==="warn").length,cls:"text-yellow-400"},{l:"Fail",c:flags.filter((f:any)=>f.status==="fail").length,cls:"text-red-400"}].map(({l,c,cls})=>(
          <span key={l} className={cn("text-xs font-semibold", cls)}>{c} {l}</span>
        ))}
      </div>
      <div className="space-y-1.5">
        {flags.map((f:any,i:number)=>(
          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/8">
            {STATUS_ICON[f.status as keyof typeof STATUS_ICON] || <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-foreground">{f.rule}</span>
                <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border", STATUS_BADGE[f.status as keyof typeof STATUS_BADGE]||"bg-white/10 text-foreground border-white/10")}>{f.status}</span>
                <WhyTooltip why={f.why} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{f.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DIR_META = {
  up:     { arrow: "↑", color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Rising" },
  down:   { arrow: "↓", color: "text-red-400",     bg: "bg-red-500/10",     label: "Declining" },
  stable: { arrow: "→", color: "text-blue-400",    bg: "bg-blue-500/10",    label: "Stable" },
};

function InlineTrends({ data }: { data: any }) {
  const sorted = [...(data.trends||[])].sort((a:any,b:any)=>b.strength-a.strength);
  return (
    <div className="space-y-3">
      {data.region && (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">
          <MapPin className="w-3 h-3" />{data.region}
        </span>
      )}
      <div className="space-y-1">
        {sorted.map((t:any,i:number)=>{
          const dir = DIR_META[t.direction as keyof typeof DIR_META] || DIR_META.stable;
          const pct = Math.min(Math.max(t.strength,0),100);
          const fill = pct>=75?"#22c55e":pct>=50?"#3b82f6":pct>=30?"#f59e0b":"#ef4444";
          return (
            <div key={i} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
              <div className={cn("w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0", dir.bg, dir.color)}>{dir.arrow}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug">{t.label}</p>
              </div>
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.5,ease:"easeOut"}}
                    className="h-full rounded-full" style={{background:fill}} />
                </div>
                <span className="text-[10px] font-bold tabular-nums shrink-0" style={{color:fill,minWidth:32}}>{t.strength}</span>
              </div>
              <WhyTooltip why={t.why} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineRisk({ data }: { data: any }) {
  const SEV = { low:{cls:"bg-green-500/15 text-green-400",bar:"#22c55e"}, medium:{cls:"bg-yellow-500/15 text-yellow-400",bar:"#eab308"}, high:{cls:"bg-red-500/15 text-red-400",bar:"#ef4444"} };
  return (
    <div className="space-y-2">
      {(data.risks||[]).map((r:any,i:number)=>{
        const sev = SEV[r.severity as keyof typeof SEV]||SEV.medium;
        return (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/8 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">{r.factor}</span>
              <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full", sev.cls)}>{r.severity}</span>
              <WhyTooltip why={r.why} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">Probability</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div initial={{width:0}} animate={{width:`${r.probability}%`}} transition={{duration:0.5,ease:"easeOut"}}
                  className="h-full rounded-full" style={{background:sev.bar}} />
              </div>
              <span className="text-xs font-bold tabular-nums shrink-0" style={{color:sev.bar}}>{r.probability}%</span>
            </div>
            <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground/60">Mitigation: </span>{r.mitigation}</p>
          </div>
        );
      })}
    </div>
  );
}

function InlineOptimizer({ data }: { data: any }) {
  const IMP = { high:{cls:"bg-emerald-500/15 text-emerald-400",dot:"bg-emerald-400"}, medium:{cls:"bg-yellow-500/15 text-yellow-400",dot:"bg-yellow-400"}, low:{cls:"bg-slate-500/15 text-slate-400",dot:"bg-slate-400"} };
  return (
    <div className="space-y-2.5">
      {data.totalSaving && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-400/70">Estimated saving:</span>
          <span className="text-sm font-bold text-yellow-400">{data.totalSaving}</span>
        </div>
      )}
      <div className="space-y-1.5">
        {(data.suggestions||[]).map((s:any,i:number)=>{
          const imp = IMP[s.impact as keyof typeof IMP]||IMP.medium;
          return (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/8">
              <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", imp.dot)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground leading-snug">{s.action}</p>
                  <span className="text-xs font-bold text-yellow-400 shrink-0">{s.saving}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={cn("text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border", imp.cls)}>{s.impact}</span>
                  <WhyTooltip why={s.why} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineExperiment({ data }: { data: any }) {
  return (
    <div className="space-y-2.5">
      {data.methodology && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <TestTube className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-cyan-300">{data.methodology}</span>
        </div>
      )}
      <div className="space-y-2">
        {(data.trials||[]).map((t:any,i:number)=>(
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/8">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-md bg-cyan-500/15 text-cyan-400 text-[10px] font-bold flex items-center justify-center shrink-0">{i+1}</span>
              <span className="text-xs font-medium text-foreground">{t.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded-md">{t.duration}</span>
              <WhyTooltip why={t.why} />
            </div>
            {(t.variables||[]).length > 0 && (
              <div className="flex flex-wrap gap-1 pl-7">
                {t.variables.map((v:string,j:number)=>(
                  <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">{v}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const CONF_META = { high:{cls:"bg-emerald-500/15 text-emerald-400"}, medium:{cls:"bg-yellow-500/15 text-yellow-400"}, low:{cls:"bg-red-500/15 text-red-400"} };

function InlineInsight({ data }: { data: any }) {
  return (
    <div className="space-y-2.5">
      {data.recommendation && (
        <div className="p-3 rounded-lg bg-gradient-to-br from-pink-500/10 to-violet-500/10 border border-pink-500/20 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span className="text-[10px] font-semibold text-pink-400 uppercase tracking-wide">Key Recommendation</span>
            </div>
            {data.confidence && (
              <span className={cn("text-[9px] font-bold uppercase px-2 py-0.5 rounded-full", CONF_META[data.confidence as keyof typeof CONF_META]?.cls||"bg-white/10 text-foreground")}>{data.confidence} confidence</span>
            )}
          </div>
          <p className="text-xs text-foreground leading-relaxed font-medium">{data.recommendation}</p>
        </div>
      )}
      <div className="space-y-1.5">
        {(data.keyPoints||[]).map((kp:any,i:number)=>(
          <div key={i} className="flex gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/8">
            <div className="w-1.5 h-1.5 rounded-full bg-pink-400 shrink-0 mt-1.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <p className="text-xs font-medium text-foreground">{kp.title}</p>
                <WhyTooltip why={kp.why} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{kp.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentDataPanel({ agentId, data }: { agentId: AgentId; data: unknown }) {
  const meta = AGENT_META[agentId];
  const Icon = meta.icon;
  const d = data as any;
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <div className={cn("flex items-center gap-2 px-3 py-2 border-b border-white/5", meta.bg)}>
        <Icon className={cn("w-3.5 h-3.5 shrink-0", meta.color)} />
        <span className={cn("text-xs font-semibold", meta.color)}>{meta.label} Analysis</span>
      </div>
      <div className="p-3">
        {agentId === "formulation" && <InlineFormulation data={d} />}
        {agentId === "sensory"     && <InlineSensory data={d} />}
        {agentId === "compliance"  && <InlineCompliance data={d} />}
        {agentId === "trendScout"  && <InlineTrends data={d} />}
        {agentId === "risk"        && <InlineRisk data={d} />}
        {agentId === "optimizer"   && <InlineOptimizer data={d} />}
        {agentId === "experiment"  && <InlineExperiment data={d} />}
        {agentId === "insight"     && <InlineInsight data={d} />}
      </div>
    </div>
  );
}

// ─── Chat bubbles ─────────────────────────────────────────────────────────────

function UserBubble({ text, isLight }: { text: string; isLight: boolean }) {
  return (
    <div className="flex justify-end">
      <div className={cn(
        "max-w-[75%] px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed",
        "bg-gradient-to-br from-violet-600 to-pink-600 text-white",
      )}>
        {text}
      </div>
    </div>
  );
}

function OracleBubble({ msg, isLight }: { msg: OracleMessage; isLight: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const agentEntries = Object.entries(msg.agentData) as [AgentId, unknown][];
  const hasAgentData = agentEntries.length > 0;
  const showExpandButton = hasAgentData && !msg.streaming;
  const isTyping = msg.streaming && msg.text === "";

  return (
    <div className="flex justify-start">
      <div className="flex gap-3 max-w-[88%]">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shrink-0 mt-1">
          <Brain className="w-3.5 h-3.5 text-white" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Agent status chips */}
          <AgentChips statuses={msg.agentStatuses} />

          {/* Main bubble */}
          <div className={cn(
            "px-4 py-3 rounded-2xl rounded-bl-sm",
            isLight ? "bg-slate-100 text-slate-800" : "bg-white/8 text-foreground",
          )}>
            {isTyping ? (
              <TypingDots />
            ) : (
              <div className="prose-oracle text-sm leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p:    ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    em:   ({ children }) => <em className="italic">{children}</em>,
                    h2:   ({ children }) => <p className="font-bold text-foreground mt-3 mb-1">{children}</p>,
                    h3:   ({ children }) => <p className="font-semibold text-foreground mt-2 mb-1">{children}</p>,
                    ul:   ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
                    ol:   ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
                    li:   ({ children }) => <li className="text-sm">{children}</li>,
                    hr:   () => <hr className="border-white/10 my-2" />,
                    code: ({ children }) => <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">{children}</code>,
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2 rounded-xl border border-white/10">
                        <table className="w-full text-xs">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-white/8">{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr:   ({ children }) => <tr className="border-t border-white/8 even:bg-white/[0.02]">{children}</tr>,
                    th:   ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground/80 whitespace-nowrap">{children}</th>,
                    td:   ({ children }) => <td className="px-3 py-2 text-muted-foreground">{children}</td>,
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
                {msg.streaming && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                    className="inline-block w-0.5 h-4 bg-current ml-0.5 align-text-bottom"
                  />
                )}
              </div>
            )}
          </div>

          {/* Inline agent data — single agent: show directly */}
          {!msg.streaming && hasAgentData && agentEntries.length === 1 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <AgentDataPanel agentId={agentEntries[0][0]} data={agentEntries[0][1]} />
            </motion.div>
          )}

          {/* Multi-agent: stream in agent cards as they arrive during streaming */}
          {msg.streaming && hasAgentData && (
            <div className="space-y-2">
              {agentEntries.map(([id, data]) => (
                <motion.div key={id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  <AgentDataPanel agentId={id} data={data} />
                </motion.div>
              ))}
            </div>
          )}

          {/* Expand full analysis — multi-agent after streaming done */}
          {showExpandButton && agentEntries.length > 1 && (
            <div>
              <button
                onClick={() => setExpanded(e => !e)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                  isLight
                    ? "border-slate-200 text-slate-500 hover:bg-slate-50"
                    : "border-white/10 text-muted-foreground hover:bg-white/5",
                )}
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Collapse" : "Expand full analysis"}
                <span className="text-[10px] opacity-60">{agentEntries.length} agents</span>
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 mt-2 overflow-hidden"
                  >
                    {agentEntries.map(([id, data]) => (
                      <AgentDataPanel key={id} agentId={id} data={data} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Example queries ──────────────────────────────────────────────────────────

const EXAMPLES = [
  "Formulate a jollof seasoning blend — 40% tomato, 30% onion powder, 15% salt, 10% pepper, 5% spices",
  "What are the compliance risks for launching a probiotic dairy premix in Nigeria?",
  "Suggest cost optimisation strategies for our snack dusting formulation",
  "What is the difference between stevia and monk fruit as sweeteners?",
  "Trending ingredients in West African savoury food products for 2025",
  "Full analysis of a new fermented locust bean (dawadawa) seasoning cube product",
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OraclePage() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [messages, setMessages] = useState<OracleMessage[]>([]);
  const [query, setQuery]       = useState("");
  const [busy, setBusy]         = useState(false);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const currentIdRef   = useRef<string>("");
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateCurrent = useCallback((updater: (msg: OracleMessage) => OracleMessage) => {
    setMessages(prev => prev.map(m => m.id === currentIdRef.current ? updater(m) : m));
  }, []);

  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;

    setQuery("");
    setBusy(true);

    const userId   = `u-${Date.now()}`;
    const oracleId = `o-${Date.now()}`;
    currentIdRef.current = oracleId;

    const historyForApi = messages.slice(-10).map(m => ({ role: m.role === "oracle" ? "assistant" : "user", content: m.text }));

    setMessages(prev => [
      ...prev,
      { id: userId, role: "user", text: q, streaming: false, agentStatuses: {}, agentData: {} },
      { id: oracleId, role: "oracle", text: "", streaming: true, agentStatuses: {}, agentData: {} },
    ]);

    try {
      const res = await fetch(`${BASE}api/oracle/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history: historyForApi }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Oracle unavailable" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader  = res.body!.getReader();
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

            if (ev.type === "intent") {
              updateCurrent(m => ({ ...m, intent: { kind: ev.kind, agents: ev.agents } }));

            } else if (ev.type === "agent_thinking") {
              updateCurrent(m => ({
                ...m,
                agentStatuses: { ...m.agentStatuses, [ev.agentId]: "thinking" as AgentStatus },
              }));

            } else if (ev.type === "agent_data") {
              updateCurrent(m => ({
                ...m,
                agentStatuses: { ...m.agentStatuses, [ev.agentId]: "done" as AgentStatus },
                agentData: { ...m.agentData, [ev.agentId]: ev.data },
              }));

            } else if (ev.type === "agent_error") {
              updateCurrent(m => ({
                ...m,
                agentStatuses: { ...m.agentStatuses, [ev.agentId]: "error" as AgentStatus },
              }));

            } else if (ev.type === "token") {
              updateCurrent(m => ({ ...m, text: m.text + ev.text }));

            } else if (ev.type === "error") {
              updateCurrent(m => ({ ...m, text: `Oracle encountered an error: ${ev.message}`, streaming: false }));

            } else if (ev.type === "done") {
              updateCurrent(m => ({ ...m, streaming: false }));
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Oracle encountered an error";
      updateCurrent(m => ({ ...m, text: msg, streaming: false }));
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }, [query, busy, messages, updateCurrent]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full gap-0" style={{ height: "calc(100vh - 80px)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Oracle</h1>
            <p className="text-xs text-muted-foreground">AI Food R&D Analyst · streams in real time</p>
          </div>
        </div>
        {busy && (
          <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
          </span>
        )}
      </div>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-1 pb-2 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-600/15 to-pink-600/15 border border-white/5 flex items-center justify-center">
              <Brain className="w-8 h-8 text-violet-400 opacity-60" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Ask Oracle anything</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Food formulation, compliance, trends, sensory science, risk — or just a question.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(ex)}
                  className={cn(
                    "text-left text-xs px-3.5 py-3 rounded-xl border transition-all leading-relaxed hover:-translate-y-px",
                    isLight
                      ? "border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600"
                      : "border-white/8 hover:bg-white/5 hover:border-white/15 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: i === messages.length - 1 ? 0 : 0 }}>
            {msg.role === "user"
              ? <UserBubble text={msg.text} isLight={isLight} />
              : <OracleBubble msg={msg} isLight={isLight} />
            }
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={cn(
        "shrink-0 pt-3 border-t",
        isLight ? "border-slate-200" : "border-white/8",
      )}>
        <div className={cn(
          "flex gap-2 items-end rounded-2xl border p-3",
          isLight
            ? "border-slate-200 bg-slate-50 focus-within:border-violet-300 focus-within:bg-white"
            : "border-white/10 bg-white/5 focus-within:border-white/20",
          "transition-colors",
        )}>
          <textarea
            ref={textareaRef}
            rows={2}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none leading-relaxed"
            placeholder="Ask about formulations, compliance, trends, costs, sensory science…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            disabled={busy}
          />
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || busy}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 text-white disabled:opacity-40 hover:shadow-lg hover:shadow-violet-500/30 active:scale-95 transition-all"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
