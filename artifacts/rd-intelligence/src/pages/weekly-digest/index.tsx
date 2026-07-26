import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion, useMotionValue, animate as fmAnimate } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  Sparkles, RefreshCw, TrendingUp, Phone, Briefcase, ClipboardList,
  Brain, Send, Calendar, Loader2,
  FlaskConical, AlertCircle, ShieldCheck, Radar,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesForceItem {
  company: string;
  status: "pending_approval" | "confidence_drop" | "delivered";
  detail?: string;
}

interface CallItem {
  company: string;
  contact?: string;
  status: "positive" | "overdue" | "on_track";
}

interface WeeklyItem {
  title: string;
  type: "dispatch" | "activity";
  status: "no_follow_up" | "follow_up_sent" | "completed" | "ongoing";
  detail?: string;
}

interface DigestSections {
  salesForce: {
    newAccounts: number;
    totalAccounts: number;
    newOrders: number;
    deliveredOrders: number;
    totalVolumeKg: number;
    urgentPendingCount?: number;
    confidenceDropCount?: number;
    items?: SalesForceItem[];
    insight: string;
  };
  callReports: {
    totalCalls: number;
    successfulCalls: number;
    items?: CallItem[];
    insight: string;
  };
  businessDev: {
    newItems: number;
    insight: string;
  };
  weeklyActivities: {
    completed: number;
    ongoing: number;
    samplesDispatched?: number;
    followUpMissing?: number;
    items?: WeeklyItem[];
    insight: string;
  };
  projectPortfolio?: {
    newProjects: number;
    activeProjects: number;
    completedProjects: number;
    newTasks: number;
    tasksCompleted: number;
    tasksInProgress: number;
    insight: string;
  };
  oracleAgentInsight?: {
    compliance: string;
    trendScout: string;
  };
}

interface WeeklyDigest {
  id: number;
  weekStartDate: string;
  weekEndDate: string;
  briefText: string;
  sections: DigestSections;
  generatedAt: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}`,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ─── Animation helpers ────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" } }),
};

const refreshIconVariants = {
  hover: { rotate: 180 },
  rest:  { rotate: 0 },
};

// ─── Tone system for StatPill ─────────────────────────────────────────────────

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE: Record<Tone, { light: string; dark: string }> = {
  good:    { light: "bg-emerald-50 text-emerald-700 border-emerald-200",   dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  warn:    { light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  bad:     { light: "bg-red-50 text-red-700 border-red-200",               dark: "bg-red-500/10 text-red-400 border-red-500/25"               },
  neutral: { light: "bg-slate-50 text-slate-600 border-slate-200",         dark: "bg-white/[0.05] text-slate-300 border-white/10"             },
};

const DOT: Record<Tone, string> = {
  good:    "bg-emerald-400",
  warn:    "bg-amber-400 animate-pulse",
  bad:     "bg-red-400 animate-pulse",
  neutral: "opacity-0",
};

// ─── Status badge system ──────────────────────────────────────────────────────

type BadgeStatus =
  | "pending_approval" | "confidence_drop" | "delivered"
  | "positive" | "overdue" | "on_track"
  | "no_follow_up" | "follow_up_sent" | "completed" | "ongoing"
  | "needs_review" | "signal";

const BADGE: Record<BadgeStatus, { label: string; dot: string; light: string; dark: string }> = {
  pending_approval: { label: "Pending approval", dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  confidence_drop:  { label: "Confidence drop",  dot: "bg-red-400 animate-pulse",    light: "bg-red-50 text-red-700 border-red-200",               dark: "bg-red-500/10 text-red-400 border-red-500/25"               },
  delivered:        { label: "Delivered",         dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  positive:         { label: "Positive",          dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  overdue:          { label: "Overdue",           dot: "bg-red-400 animate-pulse",    light: "bg-red-50 text-red-700 border-red-200",               dark: "bg-red-500/10 text-red-400 border-red-500/25"               },
  on_track:         { label: "On track",          dot: "bg-blue-400",                 light: "bg-blue-50 text-blue-700 border-blue-200",             dark: "bg-blue-500/10 text-blue-300 border-blue-500/25"            },
  no_follow_up:     { label: "No follow-up",      dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  follow_up_sent:   { label: "Follow-up sent",    dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  completed:        { label: "Completed",         dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  ongoing:          { label: "Ongoing",           dot: "bg-blue-400",                 light: "bg-blue-50 text-blue-700 border-blue-200",             dark: "bg-blue-500/10 text-blue-300 border-blue-500/25"            },
  needs_review:     { label: "Needs review",      dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  signal:           { label: "Signal",            dot: "bg-violet-400",               light: "bg-violet-50 text-violet-700 border-violet-100",       dark: "bg-violet-500/10 text-violet-300 border-violet-500/20"      },
};

function StatusBadge({ status, isLight }: { status: BadgeStatus; isLight: boolean }) {
  const cfg = BADGE[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap",
      isLight ? cfg.light : cfg.dark,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ─── AnimatedNumber ───────────────────────────────────────────────────────────

function AnimatedNumber({ target }: { target: number }) {
  const reducedMotion = useReducedMotion() ?? false;
  const mv = useMotionValue(reducedMotion ? target : 0);
  const [display, setDisplay] = useState(reducedMotion ? target : 0);

  useEffect(() => {
    if (reducedMotion) { setDisplay(target); return; }
    mv.set(0);
    const unsub = mv.on("change", (v) => setDisplay(Math.round(v)));
    const controls = fmAnimate(mv, target, { duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94] });
    return () => { controls.stop(); unsub(); };
  }, [target]);

  return <>{display}</>;
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, tone, isLight }: { label: string; value: number | string; tone: Tone; isLight: boolean }) {
  const isNumeric = typeof value === "number";
  return (
    <div className={cn(
      "relative flex flex-col items-center px-4 py-2 rounded-xl border transition-all duration-150",
      "hover:-translate-y-0.5 hover:shadow-md cursor-default",
      TONE[tone][isLight ? "light" : "dark"],
    )}>
      <span className="text-xl font-bold leading-none">
        {isNumeric ? <AnimatedNumber target={value as number} /> : value}
      </span>
      <span className="text-[10px] uppercase tracking-wide mt-1 flex items-center gap-1 opacity-70">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 flex-none", DOT[tone])} />
        {label}
      </span>
    </div>
  );
}

// ─── DigestCard ───────────────────────────────────────────────────────────────

function DigestCard({
  icon: Icon, iconGradient, title, subtitle, navPath, statPills, children, index, isLight,
}: {
  icon: React.ElementType;
  iconGradient: string;
  title: string;
  subtitle?: string;
  navPath?: string;
  statPills: React.ReactNode;
  children?: React.ReactNode;
  index: number;
  isLight: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className={cn(
        "rounded-2xl border overflow-hidden transition-shadow duration-150 hover:shadow-md",
        isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10",
      )}
    >
      {/* Header */}
      <div className={cn(
        "px-5 py-4 flex items-center gap-3 border-b",
        isLight ? "border-slate-100" : "border-white/5",
      )}>
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br", iconGradient)}>
          <Icon className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>{title}</p>
          {subtitle && <p className={cn("text-[11px]", isLight ? "text-slate-500" : "text-muted-foreground")}>{subtitle}</p>}
        </div>
        {navPath && (
          <button
            onClick={() => navigate(navPath)}
            className={cn(
              "shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors",
              isLight ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            View all →
          </button>
        )}
      </div>

      {/* Stat pills */}
      <div className="px-5 py-3 flex flex-wrap gap-2">
        {statPills}
      </div>

      {/* Item rows */}
      {children && (
        <>
          <div className={cn("h-px mx-5", isLight ? "bg-slate-100" : "bg-white/5")} />
          <div className="px-5 py-3 space-y-1.5">
            {children}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  primary, secondary, badge, accentStatus, isLight,
}: {
  primary: string;
  secondary?: string;
  badge: BadgeStatus;
  accentStatus?: "flag" | "ok" | "neutral";
  isLight: boolean;
}) {
  const accentColor =
    accentStatus === "flag" ? (isLight ? "border-l-amber-400" : "border-l-amber-400") :
    accentStatus === "ok"   ? (isLight ? "border-l-emerald-400" : "border-l-emerald-400") :
                              (isLight ? "border-l-slate-200" : "border-l-white/10");

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-xl border-l-2 transition-colors duration-100",
      isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.04]",
      accentColor,
    )}>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-medium truncate", isLight ? "text-slate-800" : "text-foreground/90")}>
          {primary}
        </p>
        {secondary && (
          <p className={cn("text-[10px] truncate mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>
            {secondary}
          </p>
        )}
      </div>
      <StatusBadge status={badge} isLight={isLight} />
    </div>
  );
}

// ─── AskOracle ────────────────────────────────────────────────────────────────

function AskOracle({ digest, isLight }: { digest: WeeklyDigest; isLight: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true); setError(""); setAnswer("");
    try {
      const pp = digest.sections.projectPortfolio;
      const s = digest.sections;
      const ctx = [
        `Week: ${digest.weekStartDate} to ${digest.weekEndDate}`,
        `Brief: ${digest.briefText}`,
        `Sales Force: ${s.salesForce.newAccounts} new accounts, ${s.salesForce.newOrders} new orders, ${Number(s.salesForce.totalVolumeKg).toFixed(1)} kg volume. Urgent pending: ${s.salesForce.urgentPendingCount ?? 0}. Confidence drops: ${s.salesForce.confidenceDropCount ?? 0}.`,
        `Call Reports: ${s.callReports.totalCalls} calls, ${s.callReports.successfulCalls} successful.`,
        `Business Dev: ${s.businessDev.newItems} new items this week.`,
        `Weekly Activities: ${s.weeklyActivities.completed} completed, ${s.weeklyActivities.ongoing} ongoing. Dispatched: ${s.weeklyActivities.samplesDispatched ?? 0}. Follow-up missing: ${s.weeklyActivities.followUpMissing ?? 0}.`,
        pp ? `Project Portfolio: ${pp.newProjects} new projects, ${pp.activeProjects} active, ${pp.newTasks} new tasks, ${pp.tasksCompleted} tasks completed this week.` : "",
      ].filter(Boolean).join("\n");

      const res = await fetch(`${BASE}api/weekly-digest/ask`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ question: q, digestContext: ctx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Request failed");
      setAnswer(data.answer || "");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
  };

  return (
    <motion.div
      custom={8}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className={cn(
        "rounded-2xl border overflow-hidden",
        isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10",
      )}
    >
      <div className="px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-500 to-purple-600">
          <Brain className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <p className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>Ask Oracle</p>
          <p className={cn("text-[11px]", isLight ? "text-slate-500" : "text-muted-foreground")}>
            Ask a question about this week's digest
          </p>
        </div>
      </div>

      <div className={cn("px-5 pb-5 border-t", isLight ? "border-slate-100" : "border-white/5")}>
        <div className={cn(
          "mt-4 flex gap-2 rounded-xl transition-all duration-150",
          "focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[0_0_12px_rgba(124,77,255,0.12)]",
        )}>
          <textarea
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Which accounts showed the most activity this week?"
            rows={2}
            className={cn(
              "flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none transition-colors",
              isLight
                ? "bg-white text-gray-900 placeholder:text-gray-400 border-gray-200 [color-scheme:light]"
                : "bg-black/20 text-foreground placeholder:text-muted-foreground border-white/10",
            )}
          />
          <button
            onClick={ask}
            disabled={!question.trim() || loading}
            className={cn(
              "self-end px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn(
                "mt-3 flex items-start gap-2 p-2.5 rounded-xl text-xs",
                isLight ? "bg-red-50 text-red-600 border border-red-100" : "bg-red-500/10 text-red-400 border border-red-500/20",
              )}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </motion.div>
          )}
          {answer && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn(
                "mt-3 p-3 rounded-xl text-sm leading-relaxed",
                isLight ? "bg-violet-50 text-violet-900 border border-violet-100" : "bg-violet-500/10 text-violet-200 border border-violet-500/20",
              )}
            >
              <span className="font-semibold text-violet-500 text-xs uppercase tracking-wide block mb-1">Oracle</span>
              <div className="[&_p]:mb-1 last:[&_p]:mb-0 [&_strong]:font-semibold [&_h1]:text-sm [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyDigestPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const reducedMotion = useReducedMotion() ?? false;

  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const fetchDigest = async () => {
    try {
      const res = await fetch(`${BASE}api/weekly-digest`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDigest(data);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDigest(); }, []);

  const handleRefresh = async () => {
    if (generating) return;
    setGenerating(true); setError("");
    try {
      const res = await fetch(`${BASE}api/weekly-digest/generate`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "Generation failed");
      }
      const data = await res.json();
      setDigest(data);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const s = digest?.sections;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const callSuccessRate = s && s.callReports.totalCalls > 0
    ? Math.round((s.callReports.successfulCalls / s.callReports.totalCalls) * 100)
    : null;
  const callRateTone: Tone = callSuccessRate === null ? "neutral"
    : callSuccessRate >= 50 ? "good"
    : callSuccessRate >= 25 ? "warn"
    : "bad";

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-4xl mx-auto space-y-6">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row sm:items-center gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className={cn("text-xl font-bold tracking-tight", isLight ? "text-slate-900" : "text-foreground")}>
              Weekly Digest
            </h1>
          </div>
          <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
            {digest
              ? `${formatDate(digest.weekStartDate)} – ${formatDate(digest.weekEndDate)} · Generated ${timeAgo(digest.generatedAt)}`
              : "AI-generated summary of your company's weekly performance"}
          </p>
        </div>

        <motion.button
          onClick={handleRefresh}
          disabled={generating}
          initial="rest"
          whileHover={!generating ? "hover" : "rest"}
          animate="rest"
          className={cn(
            "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
            generating ? "opacity-60 cursor-not-allowed" : "hover:shadow-md active:scale-95",
            isLight
              ? "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              : "glass-panel border-white/10 text-foreground hover:border-white/20",
          )}
        >
          <motion.span
            variants={refreshIconVariants}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="inline-flex"
          >
            <RefreshCw className={cn("w-4 h-4", generating && "animate-spin")} />
          </motion.span>
          {generating ? "Generating…" : digest ? "Refresh" : "Generate Digest"}
        </motion.button>
      </motion.div>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border",
              isLight ? "bg-red-50 text-red-600 border-red-200" : "bg-red-500/10 text-red-400 border-red-500/20",
            )}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state ── */}
      {!digest ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className={cn(
            "rounded-2xl border py-20 flex flex-col items-center gap-5 text-center",
            isLight ? "bg-white border-slate-200" : "glass-panel border-white/10",
          )}
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20">
            <Sparkles className="w-7 h-7 text-violet-400" />
          </div>
          <div>
            <p className={cn("text-lg font-semibold mb-1.5", isLight ? "text-slate-900" : "text-foreground")}>
              No digest generated yet
            </p>
            <p className={cn("text-sm max-w-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
              Click <strong>Generate Digest</strong> to create your first AI-powered weekly summary.
              Oracle will analyse sales, call activity, business development, and team output.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={generating}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "Generating…" : "Generate Digest"}
          </button>
        </motion.div>
      ) : (
        <>
          {/* ── Oracle brief card — rotating conic-gradient border ── */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="relative rounded-2xl p-[1px] overflow-hidden"
          >
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{ background: "conic-gradient(from 0deg, rgba(139,92,246,0.15), rgba(167,139,250,0.7), rgba(217,70,239,0.45), rgba(139,92,246,0.15))" }}
              animate={reducedMotion ? {} : { rotate: 360 }}
              transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
            />
            <div className={cn("relative rounded-[14px] overflow-hidden", isLight ? "bg-white" : "bg-background")}>
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-purple-600/4 to-transparent pointer-events-none" />
              <div className="relative p-5">
                <div className="flex items-center gap-2 mb-3">
                  <motion.div
                    animate={reducedMotion ? {} : {
                      scale: [1, 1.12, 1],
                      filter: [
                        "drop-shadow(0 0 2px rgba(139,92,246,0.2))",
                        "drop-shadow(0 0 8px rgba(167,139,250,0.75))",
                        "drop-shadow(0 0 2px rgba(139,92,246,0.2))",
                      ],
                    }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Brain className="w-4 h-4 text-violet-400" />
                  </motion.div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Oracle Brief</span>
                </div>
                <div className={cn(
                  "text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold",
                  "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1",
                  isLight ? "text-slate-800" : "text-foreground/90",
                )}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{digest.briefText}</ReactMarkdown>
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className={cn("text-xs", isLight ? "text-slate-400" : "text-muted-foreground")}>
                    {formatDate(digest.weekStartDate)} – {formatDate(digest.weekEndDate)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Sales Force ── */}
          {s && (
            <DigestCard
              icon={TrendingUp}
              iconGradient="from-blue-500 to-cyan-500"
              title="Sales Force"
              subtitle={`${s.salesForce.totalVolumeKg ? `${Number(s.salesForce.totalVolumeKg).toLocaleString()} kg ordered` : "Production orders"} this week`}
              navPath="/sales-force"
              statPills={<>
                <StatPill label="Total Accounts" value={s.salesForce.totalAccounts}  tone="neutral" isLight={isLight} />
                <StatPill label="New This Week"  value={s.salesForce.newAccounts}    tone="neutral" isLight={isLight} />
                <StatPill label="New Orders"     value={s.salesForce.newOrders}      tone="neutral" isLight={isLight} />
                <StatPill label="Delivered"      value={s.salesForce.deliveredOrders} tone={s.salesForce.deliveredOrders === 0 ? "warn" : "good"} isLight={isLight} />
                {(s.salesForce.urgentPendingCount ?? 0) > 0 && (
                  <StatPill label="Urgent Pending" value={s.salesForce.urgentPendingCount!} tone="warn" isLight={isLight} />
                )}
              </>}
              index={1}
              isLight={isLight}
            >
              {(s.salesForce.items ?? []).length > 0 ? (
                (s.salesForce.items ?? []).map((item, i) => (
                  <ItemRow
                    key={i}
                    primary={item.company}
                    secondary={item.detail}
                    badge={item.status}
                    accentStatus={item.status === "pending_approval" || item.status === "confidence_drop" ? "flag" : "ok"}
                    isLight={isLight}
                  />
                ))
              ) : (
                <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  No flagged account items this week.
                </p>
              )}
            </DigestCard>
          )}

          {/* ── Call Reports ── */}
          {s && (
            <DigestCard
              icon={Phone}
              iconGradient="from-emerald-500 to-teal-500"
              title="Call Reports"
              subtitle="Calls made this week"
              navPath="/sales-force"
              statPills={<>
                <StatPill label="Total Calls"  value={s.callReports.totalCalls}      tone="neutral" isLight={isLight} />
                <StatPill label="Successful"   value={s.callReports.successfulCalls} tone="neutral" isLight={isLight} />
                {callSuccessRate !== null && (
                  <StatPill label="Success Rate" value={`${callSuccessRate}%`} tone={callRateTone} isLight={isLight} />
                )}
              </>}
              index={2}
              isLight={isLight}
            >
              {(s.callReports.items ?? []).length > 0 ? (
                (s.callReports.items ?? []).map((item, i) => (
                  <ItemRow
                    key={i}
                    primary={item.company}
                    secondary={item.contact ? `Contact: ${item.contact}` : undefined}
                    badge={item.status}
                    accentStatus={item.status === "overdue" ? "flag" : item.status === "positive" ? "ok" : "neutral"}
                    isLight={isLight}
                  />
                ))
              ) : (
                <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  No call records found for this week.
                </p>
              )}
            </DigestCard>
          )}

          {/* ── Weekly Activities & Dispatch ── */}
          {s && (
            <DigestCard
              icon={ClipboardList}
              iconGradient="from-rose-500 to-pink-500"
              title="Weekly Activities & Dispatch"
              subtitle="Submitted activities and sample dispatches"
              navPath="/weekly-activities"
              statPills={<>
                <StatPill label="Completed" value={s.weeklyActivities.completed} tone={s.weeklyActivities.completed > 0 ? "good" : "neutral"} isLight={isLight} />
                <StatPill label="Ongoing"   value={s.weeklyActivities.ongoing}   tone="neutral" isLight={isLight} />
                {(s.weeklyActivities.samplesDispatched ?? 0) > 0 && (
                  <StatPill label="Dispatched"      value={s.weeklyActivities.samplesDispatched!} tone="neutral" isLight={isLight} />
                )}
                {(s.weeklyActivities.followUpMissing ?? 0) > 0 && (
                  <StatPill label="Follow-up Missing" value={s.weeklyActivities.followUpMissing!} tone="warn" isLight={isLight} />
                )}
              </>}
              index={3}
              isLight={isLight}
            >
              {(s.weeklyActivities.items ?? []).length > 0 ? (
                (s.weeklyActivities.items ?? []).map((item, i) => (
                  <ItemRow
                    key={i}
                    primary={item.title}
                    secondary={item.detail ? item.detail : item.type === "dispatch" ? "Sample dispatch" : "Weekly activity"}
                    badge={item.status as BadgeStatus}
                    accentStatus={item.status === "no_follow_up" ? "flag" : item.status === "completed" || item.status === "follow_up_sent" ? "ok" : "neutral"}
                    isLight={isLight}
                  />
                ))
              ) : (
                <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  No activities or dispatches recorded this week.
                </p>
              )}
            </DigestCard>
          )}

          {/* ── Business Development ── */}
          {s && (
            <DigestCard
              icon={Briefcase}
              iconGradient="from-amber-500 to-orange-500"
              title="Business Development"
              subtitle="Pipeline items active this week"
              navPath="/business-dev"
              statPills={<>
                <StatPill label="Active Items" value={s.businessDev.newItems} tone="neutral" isLight={isLight} />
              </>}
              index={4}
              isLight={isLight}
            >
              {s.businessDev.newItems === 0 && (
                <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  No business development items logged this week.
                </p>
              )}
              {s.businessDev.insight && (
                <div className={cn(
                  "flex items-start gap-2 px-3 py-2 rounded-xl border-l-2 border-l-amber-400/50",
                  isLight ? "bg-amber-50/60 text-amber-800" : "bg-amber-500/5 text-amber-300",
                )}>
                  <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                  <p className="text-xs leading-snug">{s.businessDev.insight}</p>
                </div>
              )}
            </DigestCard>
          )}

          {/* ── Project Portfolio ── */}
          {s?.projectPortfolio && (
            <DigestCard
              icon={FlaskConical}
              iconGradient="from-indigo-500 to-violet-500"
              title="Project Portfolio"
              subtitle="Projects and tasks this week"
              navPath="/projects"
              statPills={<>
                <StatPill label="Active Projects" value={s.projectPortfolio.activeProjects}   tone="neutral" isLight={isLight} />
                <StatPill label="New This Week"   value={s.projectPortfolio.newProjects}       tone="neutral" isLight={isLight} />
                <StatPill label="Completed"       value={s.projectPortfolio.completedProjects} tone={s.projectPortfolio.completedProjects > 0 ? "good" : "neutral"} isLight={isLight} />
                <StatPill label="Tasks Done"      value={s.projectPortfolio.tasksCompleted}    tone={s.projectPortfolio.tasksCompleted > 0 ? "good" : "warn"} isLight={isLight} />
                <StatPill label="In Progress"     value={s.projectPortfolio.tasksInProgress}   tone="neutral" isLight={isLight} />
              </>}
              index={5}
              isLight={isLight}
            >
              {s.projectPortfolio.insight && (
                <div className={cn(
                  "flex items-start gap-2 px-3 py-2 rounded-xl border-l-2 border-l-indigo-400/50",
                  isLight ? "bg-indigo-50/60 text-indigo-800" : "bg-indigo-500/5 text-indigo-300",
                )}>
                  <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                  <p className="text-xs leading-snug">{s.projectPortfolio.insight}</p>
                </div>
              )}
            </DigestCard>
          )}

          {/* ── Oracle Agent Insight ── */}
          {s?.oracleAgentInsight && (s.oracleAgentInsight.compliance || s.oracleAgentInsight.trendScout) && (
            <motion.div
              custom={6}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className={cn(
                "rounded-2xl border overflow-hidden",
                isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10",
              )}
            >
              {/* Header */}
              <div className={cn("px-5 py-4 flex items-center gap-3 border-b", isLight ? "border-slate-100" : "border-white/5")}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-500 to-purple-600">
                  <Brain className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>Oracle Agent Insight</p>
                  <p className={cn("text-[11px]", isLight ? "text-slate-500" : "text-muted-foreground")}>AI-generated findings based on this week's activity</p>
                </div>
              </div>

              {/* Agent findings */}
              <div className="px-5 py-4 space-y-3">
                {s.oracleAgentInsight.compliance && (
                  <div className={cn("rounded-xl border p-4", isLight ? "border-amber-200 bg-amber-50/60" : "border-amber-500/20 bg-amber-500/5")}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", isLight ? "bg-amber-100" : "bg-amber-500/15")}>
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                      <span className={cn("text-xs font-semibold", isLight ? "text-amber-700" : "text-amber-400")}>Compliance Agent</span>
                      <StatusBadge status="needs_review" isLight={isLight} />
                    </div>
                    <p className={cn("text-xs leading-relaxed", isLight ? "text-amber-800" : "text-amber-300/90")}>
                      {s.oracleAgentInsight.compliance}
                    </p>
                  </div>
                )}

                {s.oracleAgentInsight.trendScout && (
                  <div className={cn("rounded-xl border p-4", isLight ? "border-violet-200 bg-violet-50/60" : "border-violet-500/20 bg-violet-500/5")}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", isLight ? "bg-violet-100" : "bg-violet-500/15")}>
                        <Radar className="w-3.5 h-3.5 text-violet-500" />
                      </div>
                      <span className={cn("text-xs font-semibold", isLight ? "text-violet-700" : "text-violet-400")}>Trend Scout Agent</span>
                      <StatusBadge status="signal" isLight={isLight} />
                    </div>
                    <p className={cn("text-xs leading-relaxed", isLight ? "text-violet-800" : "text-violet-300/90")}>
                      {s.oracleAgentInsight.trendScout}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Ask Oracle ── */}
          <AskOracle digest={digest} isLight={isLight} />
        </>
      )}
    </div>
  );
}
