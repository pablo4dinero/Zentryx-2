import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  Sparkles, RefreshCw, TrendingUp, Phone, Briefcase, ClipboardList,
  Brain, Send, ChevronDown, ChevronUp, Calendar, Loader2,
  Package, Users, CheckCircle, Clock, AlertCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface DigestSections {
  salesForce: {
    newAccounts: number;
    totalAccounts: number;
    newOrders: number;
    deliveredOrders: number;
    totalVolumeKg: number;
    insight: string;
  };
  callReports: {
    totalCalls: number;
    successfulCalls: number;
    insight: string;
  };
  businessDev: {
    newItems: number;
    insight: string;
  };
  weeklyActivities: {
    completed: number;
    ongoing: number;
    insight: string;
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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" } }),
};

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-2 rounded-xl border", color)}>
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide mt-1 opacity-70">{label}</span>
    </div>
  );
}

function InsightBadge({ text, isLight }: { text: string; isLight: boolean }) {
  if (!text) return null;
  return (
    <div className={cn("flex items-start gap-2 mt-3 p-2.5 rounded-xl text-xs leading-snug",
      isLight ? "bg-violet-50 text-violet-700 border border-violet-100" : "bg-violet-500/10 text-violet-300 border border-violet-500/20")}>
      <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" />
      <span>{text}</span>
    </div>
  );
}

function SectionCard({
  icon: Icon, title, gradient, children, defaultOpen = true, index, isLight,
}: {
  icon: React.ElementType; title: string; gradient: string; children: React.ReactNode;
  defaultOpen?: boolean; index: number; isLight: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className={cn("rounded-2xl border overflow-hidden",
        isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10")}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className={cn("w-full flex items-center gap-3 px-5 py-4 text-left transition-colors",
          isLight ? "hover:bg-slate-50" : "hover:bg-white/5")}
      >
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br", gradient)}>
          <Icon className="w-4.5 h-4.5 text-white" />
        </div>
        <span className={cn("font-semibold text-sm flex-1", isLight ? "text-slate-900" : "text-foreground")}>
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={cn("px-5 pb-5 border-t", isLight ? "border-slate-100" : "border-white/5")}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

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
      const ctx = [
        `Week: ${digest.weekStartDate} to ${digest.weekEndDate}`,
        `Brief: ${digest.briefText}`,
        `Sales Force: ${digest.sections.salesForce.newAccounts} new accounts, ${digest.sections.salesForce.newOrders} new orders, ${digest.sections.salesForce.totalVolumeKg.toFixed(1)} kg volume.`,
        `Call Reports: ${digest.sections.callReports.totalCalls} calls, ${digest.sections.callReports.successfulCalls} successful.`,
        `Business Dev: ${digest.sections.businessDev.newItems} new items this week.`,
        `Weekly Activities: ${digest.sections.weeklyActivities.completed} completed, ${digest.sections.weeklyActivities.ongoing} ongoing.`,
      ].join("\n");

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
      custom={6}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className={cn("rounded-2xl border overflow-hidden",
        isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10")}
    >
      <div className="px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-500 to-purple-600">
          <Brain className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <p className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>Ask Oracle</p>
          <p className={cn("text-[11px]", isLight ? "text-slate-500" : "text-muted-foreground")}>Ask a question about this week's digest</p>
        </div>
      </div>

      <div className={cn("px-5 pb-5 border-t", isLight ? "border-slate-100" : "border-white/5")}>
        <div className="pt-4 flex gap-2">
          <textarea
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Which accounts showed the most activity this week?"
            rows={2}
            className={cn(
              "flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50",
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn("mt-3 flex items-start gap-2 p-2.5 rounded-xl text-xs",
                isLight ? "bg-red-50 text-red-600 border border-red-100" : "bg-red-500/10 text-red-400 border border-red-500/20")}>
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </motion.div>
          )}
          {answer && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn("mt-3 p-3 rounded-xl text-sm leading-relaxed",
                isLight ? "bg-violet-50 text-violet-900 border border-violet-100" : "bg-violet-500/10 text-violet-200 border border-violet-500/20")}>
              <span className="font-semibold text-violet-500 text-xs uppercase tracking-wide block mb-1">Oracle</span>
              {answer}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function WeeklyDigestPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
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

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row sm:items-center gap-4">
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

        <button
          onClick={handleRefresh}
          disabled={generating}
          className={cn(
            "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
            generating
              ? "opacity-60 cursor-not-allowed"
              : "hover:shadow-md active:scale-95",
            isLight
              ? "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              : "glass-panel border-white/10 text-foreground hover:border-white/20",
          )}
        >
          <RefreshCw className={cn("w-4 h-4", generating && "animate-spin")} />
          {generating ? "Generating…" : digest ? "Refresh" : "Generate Digest"}
        </button>
      </motion.div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cn("flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border",
              isLight ? "bg-red-50 text-red-600 border-red-200" : "bg-red-500/10 text-red-400 border-red-500/20")}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {!digest ? (
        /* Empty state */
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className={cn("rounded-2xl border py-20 flex flex-col items-center gap-5 text-center",
            isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
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
          {/* Oracle brief card */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="relative rounded-2xl overflow-hidden border border-violet-500/30 bg-gradient-to-br from-violet-600/10 via-purple-600/5 to-transparent"
          >
            <div className={cn("absolute inset-0", isLight ? "bg-white/70" : "bg-black/20")} />
            <div className="relative p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Oracle Brief</span>
              </div>
              <p className={cn("text-sm leading-relaxed", isLight ? "text-slate-800" : "text-foreground/90")}>
                {digest.briefText}
              </p>
              <div className="flex items-center gap-1.5 mt-3">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className={cn("text-xs", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  {formatDate(digest.weekStartDate)} – {formatDate(digest.weekEndDate)}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Sales Force */}
          <SectionCard
            icon={TrendingUp} title="Sales Force" gradient="from-blue-500 to-cyan-500"
            index={1} isLight={isLight}
          >
            {s && (
              <div className="pt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Total Accounts" value={s.salesForce.totalAccounts}
                    color={isLight ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-blue-500/10 text-blue-300 border-blue-500/20"} />
                  <StatPill label="New This Week" value={s.salesForce.newAccounts}
                    color={isLight ? "bg-cyan-50 text-cyan-700 border-cyan-100" : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"} />
                  <StatPill label="New Orders" value={s.salesForce.newOrders}
                    color={isLight ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"} />
                  <StatPill label="Delivered" value={s.salesForce.deliveredOrders}
                    color={isLight ? "bg-teal-50 text-teal-700 border-teal-100" : "bg-teal-500/10 text-teal-300 border-teal-500/20"} />
                </div>
                <div className={cn("flex items-center gap-2 text-sm", isLight ? "text-slate-600" : "text-muted-foreground")}>
                  <Package className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    <strong className={isLight ? "text-slate-800" : "text-foreground"}>
                      {Number(s.salesForce.totalVolumeKg).toLocaleString()} kg
                    </strong> total production volume ordered this week
                  </span>
                </div>
                <InsightBadge text={s.salesForce.insight} isLight={isLight} />
              </div>
            )}
          </SectionCard>

          {/* Call Reports */}
          <SectionCard
            icon={Phone} title="Call Reports" gradient="from-emerald-500 to-teal-500"
            index={2} isLight={isLight}
          >
            {s && (
              <div className="pt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Total Calls" value={s.callReports.totalCalls}
                    color={isLight ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"} />
                  <StatPill label="Successful" value={s.callReports.successfulCalls}
                    color={isLight ? "bg-teal-50 text-teal-700 border-teal-100" : "bg-teal-500/10 text-teal-300 border-teal-500/20"} />
                  {s.callReports.totalCalls > 0 && (
                    <StatPill
                      label="Success Rate"
                      value={`${Math.round((s.callReports.successfulCalls / s.callReports.totalCalls) * 100)}%`}
                      color={isLight ? "bg-green-50 text-green-700 border-green-100" : "bg-green-500/10 text-green-300 border-green-500/20"}
                    />
                  )}
                </div>
                <InsightBadge text={s.callReports.insight} isLight={isLight} />
              </div>
            )}
          </SectionCard>

          {/* Business Development */}
          <SectionCard
            icon={Briefcase} title="Business Development" gradient="from-amber-500 to-orange-500"
            index={3} isLight={isLight}
          >
            {s && (
              <div className="pt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <StatPill label="New Items" value={s.businessDev.newItems}
                    color={isLight ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-amber-500/10 text-amber-300 border-amber-500/20"} />
                </div>
                {s.businessDev.newItems === 0 && (
                  <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
                    No new business development items logged this week.
                  </p>
                )}
                <InsightBadge text={s.businessDev.insight} isLight={isLight} />
              </div>
            )}
          </SectionCard>

          {/* Weekly Activities */}
          <SectionCard
            icon={ClipboardList} title="Weekly Activities" gradient="from-rose-500 to-pink-500"
            index={4} isLight={isLight}
          >
            {s && (
              <div className="pt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Completed" value={s.weeklyActivities.completed}
                    color={isLight ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"} />
                  <StatPill label="Ongoing" value={s.weeklyActivities.ongoing}
                    color={isLight ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-amber-500/10 text-amber-300 border-amber-500/20"} />
                </div>
                <div className={cn("flex flex-wrap gap-3 text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Completed tasks this week
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Tasks still in progress
                  </div>
                </div>
                <InsightBadge text={s.weeklyActivities.insight} isLight={isLight} />
              </div>
            )}
          </SectionCard>

          {/* Oracle Insights summary */}
          <motion.div
            custom={5}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className={cn("rounded-2xl border p-5",
              isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10")}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className={cn("text-sm font-semibold", isLight ? "text-slate-900" : "text-foreground")}>
                Oracle Insights
              </span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Sales", icon: TrendingUp, text: s?.salesForce.insight, color: "text-blue-400" },
                { label: "Calls", icon: Phone, text: s?.callReports.insight, color: "text-emerald-400" },
                { label: "BD", icon: Briefcase, text: s?.businessDev.insight, color: "text-amber-400" },
                { label: "Activities", icon: ClipboardList, text: s?.weeklyActivities.insight, color: "text-rose-400" },
              ].filter(item => item.text).map((item, idx) => (
                <div key={idx} className={cn("flex items-start gap-2.5 p-2.5 rounded-xl",
                  isLight ? "bg-slate-50 border border-slate-100" : "bg-white/[0.03] border border-white/5")}>
                  <item.icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", item.color)} />
                  <div>
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wide mr-1.5", item.color)}>
                      {item.label}
                    </span>
                    <span className={cn("text-xs leading-snug", isLight ? "text-slate-600" : "text-muted-foreground")}>
                      {item.text}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Ask Oracle */}
          <AskOracle digest={digest} isLight={isLight} />
        </>
      )}
    </div>
  );
}
