import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
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
  GripVertical, Columns, LayoutList, RotateCcw, ArrowLeftRight,
} from "lucide-react";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

const BASE = import.meta.env.BASE_URL;

// ─── Layout system ────────────────────────────────────────────────────────────

type CardId =
  | "oracle_brief" | "sales_force" | "call_reports" | "weekly_activities"
  | "business_dev" | "project_portfolio" | "oracle_agent_insight" | "ask_oracle";

const ALL_CARDS: CardId[] = [
  "oracle_brief", "sales_force", "call_reports", "weekly_activities",
  "business_dev", "project_portfolio", "oracle_agent_insight", "ask_oracle",
];

interface DigestLayout {
  mode: "single" | "split";
  singleOrder: CardId[];
  leftColumn: CardId[];
  rightColumn: CardId[];
  cardHeights: Partial<Record<CardId, number>>;
}

const DEFAULT_LAYOUT: DigestLayout = {
  mode: "single",
  singleOrder: [...ALL_CARDS],
  leftColumn: ["oracle_brief", "sales_force", "call_reports", "weekly_activities"],
  rightColumn: ["business_dev", "project_portfolio", "oracle_agent_insight", "ask_oracle"],
  cardHeights: {},
};

const LS_KEY = "zentryx_digest_layout_v1";

function loadLayout(): DigestLayout {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<DigestLayout>;
      const validId = (id: unknown): id is CardId => ALL_CARDS.includes(id as CardId);
      const singleOrder = (stored.singleOrder ?? []).filter(validId);
      const leftColumn  = (stored.leftColumn  ?? []).filter(validId);
      const rightColumn = (stored.rightColumn ?? []).filter(validId);
      const missingFromSingle = ALL_CARDS.filter(id => !singleOrder.includes(id));
      const missingFromCols   = ALL_CARDS.filter(id => !leftColumn.includes(id) && !rightColumn.includes(id));
      return {
        mode: stored.mode ?? "single",
        singleOrder: [...singleOrder, ...missingFromSingle],
        leftColumn,
        rightColumn: [...rightColumn, ...missingFromCols],
        cardHeights: stored.cardHeights ?? {},
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_LAYOUT, singleOrder: [...ALL_CARDS] };
}

function persistLayout(layout: DigestLayout) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
}

function useDigestLayout() {
  const [layout, setLayout] = useState<DigestLayout>(loadLayout);

  const update = useCallback((patch: Partial<DigestLayout>) => {
    setLayout(prev => { const next = { ...prev, ...patch }; persistLayout(next); return next; });
  }, []);

  const setMode = useCallback((mode: "single" | "split") => update({ mode }), [update]);

  const reorderColumn = useCallback((col: "single" | "left" | "right", ids: CardId[]) => {
    if (col === "single") update({ singleOrder: ids });
    else if (col === "left") update({ leftColumn: ids });
    else update({ rightColumn: ids });
  }, [update]);

  const moveCard = useCallback((id: CardId, to: "left" | "right") => {
    setLayout(prev => {
      const from = prev.leftColumn.includes(id) ? "left" : "right";
      if (from === to) return prev;
      const newLeft  = to === "left"  ? [...prev.leftColumn,  id] : prev.leftColumn.filter(c => c !== id);
      const newRight = to === "right" ? [...prev.rightColumn, id] : prev.rightColumn.filter(c => c !== id);
      const next = { ...prev, leftColumn: newLeft, rightColumn: newRight };
      persistLayout(next);
      return next;
    });
  }, []);

  const setCardHeight = useCallback((id: CardId, h: number | undefined) => {
    setLayout(prev => {
      const cardHeights = { ...prev.cardHeights };
      if (h === undefined) delete cardHeights[id];
      else cardHeights[id] = h;
      const next = { ...prev, cardHeights };
      persistLayout(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const fresh = { ...DEFAULT_LAYOUT, singleOrder: [...ALL_CARDS] };
    setLayout(fresh);
    persistLayout(fresh);
  }, []);

  return { layout, setMode, reorderColumn, moveCard, setCardHeight, reset };
}

// ─── SortableCardShell ────────────────────────────────────────────────────────

function SortableCardShell({
  id, height, onHeightChange, inSplitMode, columnSide, onMoveToOtherColumn, isLight, children,
}: {
  id: CardId;
  height?: number;
  onHeightChange: (id: CardId, h: number | undefined) => void;
  inSplitMode: boolean;
  columnSide?: "left" | "right";
  onMoveToOtherColumn?: (id: CardId, to: "left" | "right") => void;
  isLight: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef(0);
  const startH = useRef(0);

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const handleResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startY.current = e.clientY;
    startH.current = containerRef.current?.offsetHeight ?? 400;
    const onMove = (ev: MouseEvent) => {
      const newH = Math.max(160, startH.current + (ev.clientY - startY.current));
      onHeightChange(id, newH);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const otherSide: "left" | "right" = columnSide === "left" ? "right" : "left";

  return (
    <div
      ref={node => { setNodeRef(node); containerRef.current = node; }}
      style={dragStyle}
      className="group relative"
    >
      {/* Hover controls */}
      <div className={cn(
        "absolute top-2 right-2 z-20 flex items-center gap-1",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto",
      )}>
        {inSplitMode && onMoveToOtherColumn && (
          <button
            onClick={() => onMoveToOtherColumn(id, otherSide)}
            title={`Move to ${otherSide} column`}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors shadow-sm",
              isLight
                ? "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                : "bg-slate-900 text-slate-300 border-white/10 hover:border-white/20 hover:bg-white/10",
            )}
          >
            <ArrowLeftRight className="w-3 h-3" />
            {otherSide === "right" ? "→ Right" : "← Left"}
          </button>
        )}
        <button
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          className={cn(
            "p-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-colors shadow-sm",
            isLight
              ? "bg-white text-slate-400 border-slate-200 hover:text-slate-600"
              : "bg-slate-900 text-slate-500 border-white/10 hover:text-slate-300",
          )}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Card content — fixed height with scroll when resized */}
      <div
        style={height ? { height, overflowY: "auto", borderRadius: "1rem" } : undefined}
      >
        {children}
      </div>

      {/* Resize handle — drag to set height, double-click to reset */}
      <div
        onMouseDown={handleResizeDown}
        onDoubleClick={() => onHeightChange(id, undefined)}
        title="Drag to resize · Double-click to reset height"
        className={cn(
          "flex items-center justify-center h-4 mt-0.5 cursor-ns-resize select-none",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        )}
      >
        <div className={cn("w-10 h-0.5 rounded-full", isLight ? "bg-slate-300" : "bg-white/20")} />
      </div>
    </div>
  );
}

// ─── LayoutToolbar ────────────────────────────────────────────────────────────

function LayoutToolbar({ layout, setMode, reset, isLight }: {
  layout: DigestLayout;
  setMode: (m: "single" | "split") => void;
  reset: () => void;
  isLight: boolean;
}) {
  const btn = (active: boolean) => cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
    active
      ? isLight ? "bg-slate-900 text-white border-slate-900" : "bg-white/10 text-foreground border-white/25"
      : isLight ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-50" : "bg-transparent text-slate-400 border-white/10 hover:bg-white/5",
  );

  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-2 rounded-xl border",
      isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10",
    )}>
      <span className={cn("text-[11px] font-medium uppercase tracking-wide", isLight ? "text-slate-400" : "text-muted-foreground")}>
        Layout
      </span>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setMode("single")} className={btn(layout.mode === "single")}>
          <LayoutList className="w-3.5 h-3.5" />
          Single
        </button>
        <button onClick={() => setMode("split")} className={btn(layout.mode === "split")}>
          <Columns className="w-3.5 h-3.5" />
          Split
        </button>
        <div className={cn("w-px h-4 mx-0.5", isLight ? "bg-slate-200" : "bg-white/10")} />
        <button
          onClick={reset}
          title="Reset to default layout"
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors",
            isLight ? "text-slate-500 border-slate-200 hover:bg-slate-50" : "text-slate-400 border-white/10 hover:bg-white/5",
          )}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface SalesForceItem {
  company: string;
  status: "pending_approval" | "confidence_drop" | "delivered" | "new_account" | "new_order";
  detail?: string;
  accountId?: number;
}

interface CallItem {
  company: string;
  contact?: string;
  outcome: string;
  callType?: string;
  loggedBy?: string;
  summary?: string;
  nextSteps?: string;
  daysAgo?: number;
  daysLeft?: number;
  commentCount?: number;
  detail?: string;
  status: "positive" | "overdue" | "on_track";
  isOverdue?: boolean;
}

interface ProjectItem {
  id: number;
  name: string;
  status: string;
  productType?: string;
  stage?: string;
  leadName?: string;
  tasksDone: number;
  totalTasks: number;
  tasksInProgress: number;
  recentTaskTitles: string[];
  summary: string;
  badgeStatus: string;
  progressPct: number;
  isNew: boolean;
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
    reportsLogged?: number;
    followUpNeeded?: number;
    nextActionsDue?: number;
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
    items?: ProjectItem[];
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

const refreshIconVariants = { hover: { rotate: 180 }, rest: { rotate: 0 } };

// ─── Tone / badge systems ─────────────────────────────────────────────────────

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

type BadgeStatus =
  | "pending_approval" | "confidence_drop" | "delivered"
  | "positive" | "overdue" | "on_track"
  | "no_follow_up" | "follow_up_sent" | "completed" | "ongoing"
  | "needs_review" | "signal"
  | "new_account" | "new_order"
  | "on_hold" | "approved" | "pushed_to_live" | "awaiting_feedback" | "in_review"
  | "active" | "in_progress";

const BADGE: Record<BadgeStatus, { label: string; dot: string; light: string; dark: string }> = {
  pending_approval:  { label: "Pending approval",  dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  confidence_drop:   { label: "Confidence drop",   dot: "bg-red-400 animate-pulse",    light: "bg-red-50 text-red-700 border-red-200",               dark: "bg-red-500/10 text-red-400 border-red-500/25"               },
  delivered:         { label: "Delivered",          dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  positive:          { label: "Positive",           dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  overdue:           { label: "Overdue",            dot: "bg-red-400 animate-pulse",    light: "bg-red-50 text-red-700 border-red-200",               dark: "bg-red-500/10 text-red-400 border-red-500/25"               },
  on_track:          { label: "On track",           dot: "bg-blue-400",                 light: "bg-blue-50 text-blue-700 border-blue-200",             dark: "bg-blue-500/10 text-blue-300 border-blue-500/25"            },
  no_follow_up:      { label: "No follow-up",       dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  follow_up_sent:    { label: "Follow-up sent",     dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  completed:         { label: "Completed",          dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  ongoing:           { label: "Ongoing",            dot: "bg-blue-400",                 light: "bg-blue-50 text-blue-700 border-blue-200",             dark: "bg-blue-500/10 text-blue-300 border-blue-500/25"            },
  needs_review:      { label: "Needs review",       dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",         dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  signal:            { label: "Signal",             dot: "bg-violet-400",               light: "bg-violet-50 text-violet-700 border-violet-100",       dark: "bg-violet-500/10 text-violet-300 border-violet-500/20"      },
  new_account:       { label: "New account",        dot: "bg-sky-400",                  light: "bg-sky-50 text-sky-700 border-sky-200",                dark: "bg-sky-500/10 text-sky-300 border-sky-500/25"               },
  new_order:         { label: "New order",          dot: "bg-indigo-400",               light: "bg-indigo-50 text-indigo-700 border-indigo-200",       dark: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"      },
  on_hold:           { label: "On hold",            dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",          dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  approved:          { label: "Approved",           dot: "bg-emerald-400",              light: "bg-emerald-50 text-emerald-700 border-emerald-200",    dark: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"   },
  pushed_to_live:    { label: "Pushed to live",     dot: "bg-teal-400",                 light: "bg-teal-50 text-teal-700 border-teal-200",             dark: "bg-teal-500/10 text-teal-300 border-teal-500/25"            },
  awaiting_feedback: { label: "Awaiting feedback",  dot: "bg-amber-400 animate-pulse",  light: "bg-amber-50 text-amber-700 border-amber-200",          dark: "bg-amber-500/10 text-amber-300 border-amber-500/25"         },
  in_review:         { label: "In review",          dot: "bg-blue-400",                 light: "bg-blue-50 text-blue-700 border-blue-200",             dark: "bg-blue-500/10 text-blue-300 border-blue-500/25"            },
  active:            { label: "Active",             dot: "bg-cyan-400",                 light: "bg-cyan-50 text-cyan-700 border-cyan-200",             dark: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25"            },
  in_progress:       { label: "In progress",        dot: "bg-violet-400",               light: "bg-violet-50 text-violet-700 border-violet-100",       dark: "bg-violet-500/10 text-violet-300 border-violet-500/20"      },
};

function StatusBadge({ status, isLight }: { status: BadgeStatus; isLight: boolean }) {
  const cfg = BADGE[status];
  if (!cfg) return null;
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
    const unsub = mv.on("change", v => setDisplay(Math.round(v)));
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
  icon: Icon, iconGradient, title, subtitle, navPath, statPills, children, isLight,
}: {
  icon: React.ElementType;
  iconGradient: string;
  title: string;
  subtitle?: string;
  navPath?: string;
  statPills: React.ReactNode;
  children?: React.ReactNode;
  isLight: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden transition-shadow duration-150 hover:shadow-md",
      isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10",
    )}>
      <div className={cn("px-5 py-4 flex items-center gap-3 border-b", isLight ? "border-slate-100" : "border-white/5")}>
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
      <div className="px-5 py-3 flex flex-wrap gap-2">{statPills}</div>
      {children && (
        <>
          <div className={cn("h-px mx-5", isLight ? "bg-slate-100" : "bg-white/5")} />
          <div className="px-5 py-3 space-y-1.5">{children}</div>
        </>
      )}
    </div>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  primary, secondary, badge, accentStatus, isLight, onClick, progressPct,
}: {
  primary: string;
  secondary?: string;
  badge: BadgeStatus;
  accentStatus?: "flag" | "ok" | "neutral";
  isLight: boolean;
  onClick?: () => void;
  progressPct?: number;
}) {
  const accentColor =
    accentStatus === "flag" ? "border-l-amber-400" :
    accentStatus === "ok"   ? "border-l-emerald-400" :
                              (isLight ? "border-l-slate-200" : "border-l-white/10");
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl border-l-2 transition-colors duration-100",
        isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.04]",
        onClick && "cursor-pointer",
        accentColor,
      )}
    >
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-medium truncate", isLight ? "text-slate-800" : "text-foreground/90")}>{primary}</p>
        {secondary && (
          <p className={cn("text-[10px] truncate mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>{secondary}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {progressPct !== undefined && (
          <span className={cn("text-[10px] font-semibold tabular-nums", isLight ? "text-slate-500" : "text-muted-foreground")}>
            {progressPct}%
          </span>
        )}
        <StatusBadge status={badge} isLight={isLight} />
      </div>
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
        `Sales Force: ${s.salesForce.newAccounts} new accounts, ${s.salesForce.newOrders} new orders, ${Number(s.salesForce.totalVolumeKg).toFixed(1)} kg volume. Urgent pending: ${s.salesForce.urgentPendingCount ?? 0}.`,
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

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden",
      isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10",
    )}>
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
        <div className="mt-4 flex gap-2 rounded-xl focus-within:ring-2 focus-within:ring-primary/50">
          <textarea
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
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
            className="self-end px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn("mt-3 flex items-start gap-2 p-2.5 rounded-xl text-xs", isLight ? "bg-red-50 text-red-600 border border-red-100" : "bg-red-500/10 text-red-400 border border-red-500/20")}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}
            </motion.div>
          )}
          {answer && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn("mt-3 p-3 rounded-xl text-sm leading-relaxed", isLight ? "bg-violet-50 text-violet-900 border border-violet-100" : "bg-violet-500/10 text-violet-200 border border-violet-500/20")}
            >
              <span className="font-semibold text-violet-500 text-xs uppercase tracking-wide block mb-1">Oracle</span>
              <div className="[&_p]:mb-1 last:[&_p]:mb-0 [&_strong]:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── SortableColumn ───────────────────────────────────────────────────────────
// Self-contained draggable column: owns its DndContext + SortableContext

function SortableColumn({
  ids, col, layout, setCardHeight, moveCard, isLight, renderCard,
}: {
  ids: CardId[];
  col: "single" | "left" | "right";
  layout: DigestLayout;
  setCardHeight: (id: CardId, h: number | undefined) => void;
  moveCard: (id: CardId, to: "left" | "right") => void;
  isLight: boolean;
  renderCard: (id: CardId) => React.ReactNode;
}) {
  const { reorderColumn } = useDigestLayoutRef();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id as CardId);
    const newIdx = ids.indexOf(over.id as CardId);
    if (oldIdx !== -1 && newIdx !== -1) reorderColumn(col, arrayMove(ids, oldIdx, newIdx));
  };

  const inSplit = col !== "single";
  const colSide = col === "left" ? "left" : col === "right" ? "right" : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {ids.map(id => (
            <SortableCardShell
              key={id}
              id={id}
              height={layout.cardHeights[id]}
              onHeightChange={setCardHeight}
              inSplitMode={inSplit}
              columnSide={colSide}
              onMoveToOtherColumn={inSplit ? moveCard : undefined}
              isLight={isLight}
            >
              {renderCard(id)}
            </SortableCardShell>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// Tiny context to share reorderColumn without prop-drilling into SortableColumn
const DigestLayoutCtx = createContext<{
  reorderColumn: (col: "single" | "left" | "right", ids: CardId[]) => void;
}>({ reorderColumn: () => {} });

function useDigestLayoutRef() {
  return useContext(DigestLayoutCtx);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyDigestPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const reducedMotion = useReducedMotion() ?? false;
  const [, navigate] = useLocation();

  const { layout, setMode, reorderColumn, moveCard, setCardHeight, reset } = useDigestLayout();

  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${BASE}api/weekly-digest`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDigest(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    if (generating) return;
    setGenerating(true); setError("");
    try {
      const res = await fetch(`${BASE}api/weekly-digest/generate`, { method: "POST", headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Generation failed"); }
      setDigest(await res.json());
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const s = digest?.sections;

  // ── Card renderer ──────────────────────────────────────────────────────────
  const renderCard = useCallback((id: CardId): React.ReactNode => {
    if (!s || !digest) return null;
    switch (id) {

      case "oracle_brief":
        return (
          <div className="relative rounded-2xl p-[1px] overflow-hidden">
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
                    animate={reducedMotion ? {} : { scale: [1, 1.12, 1], filter: ["drop-shadow(0 0 2px rgba(139,92,246,0.2))", "drop-shadow(0 0 8px rgba(167,139,250,0.75))", "drop-shadow(0 0 2px rgba(139,92,246,0.2))"] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Brain className="w-4 h-4 text-violet-400" />
                  </motion.div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Oracle Brief</span>
                </div>
                <div className={cn("text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1", isLight ? "text-slate-800" : "text-foreground/90")}>
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
          </div>
        );

      case "sales_force":
        return (
          <DigestCard
            icon={TrendingUp} iconGradient="from-blue-500 to-cyan-500"
            title="Sales Force"
            subtitle={`${s.salesForce.totalVolumeKg ? `${Number(s.salesForce.totalVolumeKg).toLocaleString()} kg ordered` : "Production orders"} this week`}
            navPath="/sales-force" isLight={isLight}
            statPills={<>
              <StatPill label="Total Accounts" value={s.salesForce.totalAccounts}  tone="neutral" isLight={isLight} />
              <StatPill label="New This Week"  value={s.salesForce.newAccounts}    tone="neutral" isLight={isLight} />
              <StatPill label="New Orders"     value={s.salesForce.newOrders}      tone="neutral" isLight={isLight} />
              <StatPill label="Delivered"      value={s.salesForce.deliveredOrders} tone={s.salesForce.deliveredOrders === 0 ? "warn" : "good"} isLight={isLight} />
              {(s.salesForce.urgentPendingCount ?? 0) > 0 && (
                <StatPill label="Urgent Pending" value={s.salesForce.urgentPendingCount!} tone="warn" isLight={isLight} />
              )}
            </>}
          >
            {(s.salesForce.items ?? []).filter(item => item.status !== "confidence_drop").length > 0
              ? (s.salesForce.items ?? []).filter(item => item.status !== "confidence_drop").map((item, i) => (
                  <ItemRow key={i} primary={item.company} secondary={item.detail}
                    badge={item.status as BadgeStatus}
                    accentStatus={item.status === "pending_approval" ? "flag" : item.status === "new_account" || item.status === "delivered" ? "ok" : "neutral"}
                    isLight={isLight}
                    onClick={item.accountId ? () => navigate(`/sales-force/${item.accountId}`) : undefined}
                  />
                ))
              : <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>No account items this week.</p>
            }
          </DigestCard>
        );

      case "call_reports":
        return (
          <DigestCard
            icon={Phone} iconGradient="from-emerald-500 to-teal-500"
            title="Call Reports"
            subtitle="Site visits, calls, emails, invites and more logged this week"
            navPath="/sales-force" isLight={isLight}
            statPills={<>
              <StatPill label="Reports Logged"   value={s.callReports.reportsLogged ?? s.callReports.totalCalls} tone="neutral" isLight={isLight} />
              <StatPill label="Follow-up Needed" value={s.callReports.followUpNeeded ?? 0} tone={(s.callReports.followUpNeeded ?? 0) > 0 ? "warn" : "neutral"} isLight={isLight} />
              <StatPill label="Next Actions (3d)" value={s.callReports.nextActionsDue ?? 0} tone={(s.callReports.nextActionsDue ?? 0) > 0 ? "warn" : "neutral"} isLight={isLight} />
            </>}
          >
            {(s.callReports.items ?? []).length > 0
              ? (s.callReports.items ?? []).map((item, i) => (
                  <ItemRow key={i}
                    primary={item.contact ? `${item.company} — ${item.contact}` : item.company}
                    secondary={item.detail}
                    badge={item.status}
                    accentStatus={item.status === "overdue" ? "flag" : item.status === "positive" ? "ok" : "neutral"}
                    isLight={isLight}
                  />
                ))
              : <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>No call records found for this week.</p>
            }
          </DigestCard>
        );

      case "weekly_activities":
        return (
          <DigestCard
            icon={ClipboardList} iconGradient="from-rose-500 to-pink-500"
            title="Weekly Activities & Dispatch"
            subtitle="Submitted activities and sample dispatches"
            navPath="/weekly-activities" isLight={isLight}
            statPills={<>
              <StatPill label="Completed" value={s.weeklyActivities.completed} tone={s.weeklyActivities.completed > 0 ? "good" : "neutral"} isLight={isLight} />
              <StatPill label="Ongoing"   value={s.weeklyActivities.ongoing}   tone="neutral" isLight={isLight} />
              {(s.weeklyActivities.samplesDispatched ?? 0) > 0 && <StatPill label="Dispatched"       value={s.weeklyActivities.samplesDispatched!} tone="neutral" isLight={isLight} />}
              {(s.weeklyActivities.followUpMissing  ?? 0) > 0 && <StatPill label="Follow-up Missing" value={s.weeklyActivities.followUpMissing!}   tone="warn"    isLight={isLight} />}
            </>}
          >
            {(s.weeklyActivities.items ?? []).length > 0
              ? (s.weeklyActivities.items ?? []).map((item, i) => (
                  <ItemRow key={i}
                    primary={item.title}
                    secondary={item.detail ?? (item.type === "dispatch" ? "Sample dispatch" : "Weekly activity")}
                    badge={item.status as BadgeStatus}
                    accentStatus={item.status === "no_follow_up" ? "flag" : item.status === "completed" || item.status === "follow_up_sent" ? "ok" : "neutral"}
                    isLight={isLight}
                  />
                ))
              : <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>No activities or dispatches recorded this week.</p>
            }
          </DigestCard>
        );

      case "business_dev":
        return (
          <DigestCard
            icon={Briefcase} iconGradient="from-amber-500 to-orange-500"
            title="Business Development"
            subtitle="Pipeline items active this week"
            navPath="/business-dev" isLight={isLight}
            statPills={<StatPill label="Active Items" value={s.businessDev.newItems} tone="neutral" isLight={isLight} />}
          >
            {s.businessDev.newItems === 0 && (
              <p className={cn("text-xs py-2", isLight ? "text-slate-400" : "text-muted-foreground")}>No business development items logged this week.</p>
            )}
            {s.businessDev.insight && (
              <div className={cn("flex items-start gap-2 px-3 py-2 rounded-xl border-l-2 border-l-amber-400/50", isLight ? "bg-amber-50/60 text-amber-800" : "bg-amber-500/5 text-amber-300")}>
                <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                <p className="text-xs leading-snug">{s.businessDev.insight}</p>
              </div>
            )}
          </DigestCard>
        );

      case "project_portfolio":
        if (!s.projectPortfolio) return null;
        return (
          <DigestCard
            icon={FlaskConical} iconGradient="from-indigo-500 to-violet-500"
            title="Project Portfolio"
            subtitle="Projects with activity this week and task changes"
            navPath="/projects" isLight={isLight}
            statPills={<>
              <StatPill label="Active Projects" value={s.projectPortfolio.activeProjects}   tone="neutral" isLight={isLight} />
              <StatPill label="New This Week"   value={s.projectPortfolio.newProjects}       tone="neutral" isLight={isLight} />
              <StatPill label="Completed"       value={s.projectPortfolio.completedProjects} tone={s.projectPortfolio.completedProjects > 0 ? "good" : "neutral"} isLight={isLight} />
              <StatPill label="Tasks Done"      value={s.projectPortfolio.tasksCompleted}    tone={s.projectPortfolio.tasksCompleted > 0 ? "good" : "warn"} isLight={isLight} />
              <StatPill label="In Progress"     value={s.projectPortfolio.tasksInProgress}   tone="neutral" isLight={isLight} />
            </>}
          >
            {(s.projectPortfolio.items ?? []).length > 0 ? (
              (s.projectPortfolio.items ?? []).map((item, i) => {
                const parts: string[] = [];
                if (item.isNew) {
                  if (item.leadName) parts.push(`Assigned to: ${item.leadName}`);
                  if (item.productType) parts.push(item.productType);
                  if (item.stage) parts.push(`Stage: ${item.stage}`);
                } else {
                  if (item.summary) parts.push(item.summary);
                  if (item.productType) parts.push(item.productType);
                }
                if (item.recentTaskTitles[0]) parts.push(item.recentTaskTitles[0]);
                const accentOk   = ["completed", "approved", "pushed_to_live"].includes(item.badgeStatus);
                const accentFlag = ["on_hold", "awaiting_feedback"].includes(item.badgeStatus);
                return (
                  <ItemRow key={i}
                    primary={item.name}
                    secondary={parts.join(" · ") || undefined}
                    badge={item.badgeStatus as BadgeStatus}
                    progressPct={item.progressPct}
                    accentStatus={accentOk ? "ok" : accentFlag ? "flag" : "neutral"}
                    isLight={isLight}
                    onClick={() => navigate(`/projects/${item.id}`)}
                  />
                );
              })
            ) : s.projectPortfolio.insight ? (
              <div className={cn("flex items-start gap-2 px-3 py-2 rounded-xl border-l-2 border-l-indigo-400/50", isLight ? "bg-indigo-50/60 text-indigo-800" : "bg-indigo-500/5 text-indigo-300")}>
                <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                <p className="text-xs leading-snug">{s.projectPortfolio.insight}</p>
              </div>
            ) : null}
          </DigestCard>
        );

      case "oracle_agent_insight":
        if (!s.oracleAgentInsight || (!s.oracleAgentInsight.compliance && !s.oracleAgentInsight.trendScout)) return null;
        return (
          <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200 shadow-sm" : "glass-panel border-white/10")}>
            <div className={cn("px-5 py-4 flex items-center gap-3 border-b", isLight ? "border-slate-100" : "border-white/5")}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-500 to-purple-600">
                <Brain className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>Oracle Agent Insight</p>
                <p className={cn("text-[11px]", isLight ? "text-slate-500" : "text-muted-foreground")}>AI-generated findings based on this week's activity</p>
              </div>
            </div>
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
                  <p className={cn("text-xs leading-relaxed", isLight ? "text-amber-800" : "text-amber-300/90")}>{s.oracleAgentInsight.compliance}</p>
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
                  <p className={cn("text-xs leading-relaxed", isLight ? "text-violet-800" : "text-violet-300/90")}>{s.oracleAgentInsight.trendScout}</p>
                </div>
              )}
            </div>
          </div>
        );

      case "ask_oracle":
        return <AskOracle digest={digest} isLight={isLight} />;

      default:
        return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, digest, isLight, reducedMotion, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DigestLayoutCtx.Provider value={{ reorderColumn }}>
      <div className={cn(
        "px-4 md:px-6 lg:px-8 py-6 space-y-4",
        layout.mode === "split" ? "max-w-full" : "max-w-4xl mx-auto",
      )}>

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
            onClick={handleRefresh} disabled={generating}
            initial="rest" whileHover={!generating ? "hover" : "rest"} animate="rest"
            className={cn(
              "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
              generating ? "opacity-60 cursor-not-allowed" : "hover:shadow-md active:scale-95",
              isLight ? "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50" : "glass-panel border-white/10 text-foreground hover:border-white/20",
            )}
          >
            <motion.span variants={refreshIconVariants} transition={{ duration: 0.35, ease: "easeInOut" }} className="inline-flex">
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
              className={cn("flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border", isLight ? "bg-red-50 text-red-600 border-red-200" : "bg-red-500/10 text-red-400 border-red-500/20")}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Layout toolbar (only when digest is loaded) ── */}
        {digest && <LayoutToolbar layout={layout} setMode={setMode} reset={reset} isLight={isLight} />}

        {/* ── Empty state ── */}
        {!digest ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
            className={cn("rounded-2xl border py-20 flex flex-col items-center gap-5 text-center", isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20">
              <Sparkles className="w-7 h-7 text-violet-400" />
            </div>
            <div>
              <p className={cn("text-lg font-semibold mb-1.5", isLight ? "text-slate-900" : "text-foreground")}>No digest generated yet</p>
              <p className={cn("text-sm max-w-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
                Click <strong>Generate Digest</strong> to create your first AI-powered weekly summary.
              </p>
            </div>
            <button
              onClick={handleRefresh} disabled={generating}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Generating…" : "Generate Digest"}
            </button>
          </motion.div>

        ) : layout.mode === "single" ? (
          // ── Single column ──────────────────────────────────────────────────
          <SortableColumn
            ids={layout.singleOrder}
            col="single"
            layout={layout}
            setCardHeight={setCardHeight}
            moveCard={moveCard}
            isLight={isLight}
            renderCard={renderCard}
          />

        ) : (
          // ── Split layout ───────────────────────────────────────────────────
          <PanelGroup direction="horizontal" autoSaveId="zentryx-digest-split" className="gap-0">
            <Panel minSize={20} defaultSize={50}>
              <div className="pr-3 h-full">
                <SortableColumn
                  ids={layout.leftColumn}
                  col="left"
                  layout={layout}
                  setCardHeight={setCardHeight}
                  moveCard={moveCard}
                  isLight={isLight}
                  renderCard={renderCard}
                />
              </div>
            </Panel>

            <PanelResizeHandle className="flex items-center justify-center w-4 cursor-col-resize group/handle">
              <div className={cn(
                "w-0.5 h-20 rounded-full transition-all duration-150",
                "group-hover/handle:h-32 group-hover/handle:w-1",
                isLight ? "bg-slate-200 group-hover/handle:bg-slate-400" : "bg-white/10 group-hover/handle:bg-white/30",
              )} />
            </PanelResizeHandle>

            <Panel minSize={20} defaultSize={50}>
              <div className="pl-3 h-full">
                <SortableColumn
                  ids={layout.rightColumn}
                  col="right"
                  layout={layout}
                  setCardHeight={setCardHeight}
                  moveCard={moveCard}
                  isLight={isLight}
                  renderCard={renderCard}
                />
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>
    </DigestLayoutCtx.Provider>
  );
}
