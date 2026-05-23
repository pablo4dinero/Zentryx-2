import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Activity, RefreshCw, Zap, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const BASE = import.meta.env.BASE_URL;

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-500/20 text-green-400 border-green-500/20",
  updated: "bg-blue-500/20 text-blue-400 border-blue-500/20",
  deleted: "bg-red-500/20 text-red-400 border-red-500/20",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/20",
  assigned: "bg-purple-500/20 text-purple-400 border-purple-500/20",
  commented: "bg-amber-500/20 text-amber-400 border-amber-500/20",
  login: "bg-cyan-500/20 text-cyan-400 border-cyan-500/20",
};

const ENTITY_COLORS: Record<string, string> = {
  project: "text-purple-300",
  task: "text-blue-300",
  formulation: "text-teal-300",
  user: "text-amber-300",
  comment: "text-rose-300",
  business_dev: "text-emerald-300",
  account: "text-cyan-300",
};

const LIGHT_ENTITY_COLORS: Record<string, string> = {
  project: "text-purple-700",
  task: "text-blue-700",
  formulation: "text-teal-700",
  user: "text-amber-700",
  comment: "text-rose-700",
  business_dev: "text-emerald-700",
  account: "text-cyan-700",
};

const LIGHT_ACTION_COLORS: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-700 border-emerald-200",
  updated: "bg-blue-100 text-blue-700 border-blue-200",
  deleted: "bg-rose-100 text-rose-700 border-rose-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  assigned: "bg-purple-100 text-purple-700 border-purple-200",
  commented: "bg-amber-100 text-amber-700 border-amber-200",
  login: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

function getActionColor(action: string, isLight: boolean) {
  const table = isLight ? LIGHT_ACTION_COLORS : ACTION_COLORS;
  const key = Object.keys(table).find(k => action.toLowerCase().includes(k));
  if (key) return table[key];
  return isLight ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-white/10 text-muted-foreground border-white/10";
}

function LiveTicker({ activities, isLight }: { activities: any[]; isLight: boolean }) {
  const latest = activities.slice(0, 10);
  const [tickerItems] = useState([...latest, ...latest]);
  const entityColors = isLight ? LIGHT_ENTITY_COLORS : ENTITY_COLORS;

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border h-9 flex items-center",
      isLight ? "border-slate-200 bg-white shadow-sm" : "border-white/5 bg-black/20",
    )}>
      <div className={cn(
        "shrink-0 flex items-center gap-1.5 px-3 h-full pr-4 border-r",
        isLight ? "bg-gradient-to-r from-red-100 to-transparent border-slate-200" : "bg-gradient-to-r from-red-500/20 to-transparent border-white/5",
      )}>
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className={cn("text-[10px] font-bold uppercase tracking-widest", isLight ? "text-red-600" : "text-red-400")}>Live</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex animate-[ticker_40s_linear_infinite] whitespace-nowrap">
          {[...tickerItems, ...tickerItems].map((a, i) => (
            <span key={i} className={cn("inline-flex items-center gap-1.5 text-xs px-4", isLight ? "text-slate-500" : "text-muted-foreground")}>
              <span className={cn("font-semibold", isLight ? "text-slate-900" : "text-foreground")}>{a.user?.name || "System"}</span>
              <span>{a.action}</span>
              <span className={cn("capitalize font-semibold", entityColors[a.entityType] || (isLight ? "text-slate-600" : "text-muted-foreground"))}>{a.entityType}</span>
              <span className={isLight ? "text-slate-300" : "text-white/20"}>·</span>
              <span className={isLight ? "text-slate-400" : "text-white/40"}>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
              <span className={cn("mx-2", isLight ? "text-slate-200" : "text-white/10")}>|</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ActivityFeed() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [newCount, setNewCount] = useState(0);
  const prevIdsRef = useRef<Set<number>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivities = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${BASE}api/activity`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` }
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setActivities(prev => {
        const incoming = list.slice(0, 80);
        const prevIds = prevIdsRef.current;
        const freshIds = new Set<number>(incoming.map((a: any) => a.id));
        const newOnes = incoming.filter((a: any) => !prevIds.has(a.id));
        if (prevIds.size > 0 && newOnes.length > 0) setNewCount(c => c + newOnes.length);
        prevIdsRef.current = freshIds;
        return incoming;
      });
      setLastUpdated(new Date());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    fetchActivities();
    pollRef.current = setInterval(() => fetchActivities(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const ENTITY_DOT: Record<string, string> = {
    project: "bg-purple-500",
    task: "bg-blue-500",
    formulation: "bg-teal-500",
    user: "bg-amber-500",
    comment: "bg-rose-500",
    business_dev: "bg-emerald-500",
    account: "bg-cyan-500",
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={cn("text-2xl font-display font-bold", isLight ? "text-slate-900" : "text-foreground")}>Live Activity Feed</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn("flex items-center gap-1 text-xs", isLight ? "text-emerald-600" : "text-emerald-400")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isLight ? "bg-emerald-500" : "bg-emerald-400")} />
                  Live · auto-refreshes every 5s
                </span>
                <span className={isLight ? "text-slate-300" : "text-white/20"}>·</span>
                <span className={cn("text-xs", isLight ? "text-slate-500" : "text-muted-foreground")}>Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => { setNewCount(0); fetchActivities(); }}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors border shrink-0",
            isLight
              ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
              : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
          )}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* New activity banner */}
      <AnimatePresence>
        {newCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm cursor-pointer hover:bg-primary/15 transition-colors"
            onClick={() => setNewCount(0)}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {newCount} new activit{newCount === 1 ? "y" : "ies"} detected
            </div>
            <span className="text-xs opacity-70">Click to dismiss</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live ticker */}
      {activities.length > 0 && <LiveTicker activities={activities} isLight={isLight} />}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ENTITY_DOT).map(([type, dot]) => (
          <span key={type} className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border",
            isLight ? "text-slate-600 bg-white border-slate-200" : "text-muted-foreground bg-white/5 border-white/5",
          )}>
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {type.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Timeline */}
      {loading && activities.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Loading activity feed...</p>
          </div>
        </div>
      ) : activities.length === 0 ? (
        <div className={cn("text-center py-16 rounded-2xl border", isLight ? "bg-white border-slate-200" : "glass-card border-white/5")}>
          <Activity className={cn("w-12 h-12 mx-auto opacity-20 mb-4", isLight ? "text-slate-500" : "text-muted-foreground")} />
          <p className={cn(isLight ? "text-slate-500" : "text-muted-foreground")}>No activity yet. Activity will appear here as you use Zentryx.</p>
        </div>
      ) : (
        <div className={cn("relative pl-8 border-l space-y-0 pb-10", isLight ? "border-slate-200" : "border-white/8")}>
          <AnimatePresence initial={false}>
            {activities.map((activity, index) => {
              const dotColor = ENTITY_DOT[activity.entityType] || "bg-primary";
              const isNew = newCount > 0 && index < newCount;
              const entityColors = isLight ? LIGHT_ENTITY_COLORS : ENTITY_COLORS;
              return (
                <motion.div
                  key={activity.id}
                  initial={isNew ? { opacity: 0, x: -20 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: isNew ? index * 0.05 : 0 }}
                  className="relative pb-6 group"
                >
                  {/* Timeline dot */}
                  <div className={cn(
                    "absolute w-3 h-3 rounded-full -left-[30px] top-3.5 ring-2 shadow-lg",
                    isLight ? "ring-white" : "ring-background",
                    dotColor,
                  )} />
                  {/* Connector line highlight */}
                  {index === 0 && <div className="absolute w-px bg-gradient-to-b from-primary/40 to-transparent h-full -left-[24.5px] top-0" />}

                  <div className={cn(
                    "p-4 rounded-xl border transition-all",
                    isLight
                      ? cn("bg-white shadow-sm hover:shadow-md", isNew ? "border-primary/30 bg-primary/[0.04]" : "border-slate-200 hover:border-slate-300")
                      : cn("glass-card", isNew ? "border-primary/20 bg-primary/5" : "border-white/5 group-hover:border-white/10"),
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary/50 to-primary/50 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {activity.user?.name?.charAt(0) || <User className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>{activity.user?.name || "System"}</span>
                            <span className={cn("text-sm", isLight ? "text-slate-600" : "text-muted-foreground")}>{activity.action}</span>
                            <span className={cn("text-xs font-mono px-2 py-0.5 rounded-full border", getActionColor(activity.action, isLight))}>
                              {activity.action.split(" ")[0]}
                            </span>
                            <span className={cn(
                              "text-xs font-semibold capitalize",
                              entityColors[activity.entityType] || (isLight ? "text-slate-600" : "text-muted-foreground"),
                            )}>
                              {activity.entityType?.replace(/_/g, " ")} {activity.entityId ? `#${activity.entityId}` : ""}
                            </span>
                          </div>
                          {activity.details && (
                            <p className={cn(
                              "text-sm px-3 py-1.5 rounded-lg border font-mono text-[12px] truncate",
                              isLight ? "text-slate-700 bg-slate-50 border-slate-200" : "text-muted-foreground bg-black/20 border-white/5",
                            )}>
                              {activity.details}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-xs whitespace-nowrap", isLight ? "text-slate-500" : "text-muted-foreground")}>
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </p>
                        <p className={cn("text-[10px] mt-0.5 font-mono", isLight ? "text-slate-400" : "text-muted-foreground/50")}>
                          {format(new Date(activity.createdAt), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div className="absolute bottom-0 left-0 w-px h-16 bg-gradient-to-b from-white/8 to-transparent -translate-x-px" />
        </div>
      )}
    </div>
  );
}
