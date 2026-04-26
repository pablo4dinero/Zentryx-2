import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Activity, RefreshCw, Radio, ChevronRight, Zap, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

function getActionColor(action: string) {
  const key = Object.keys(ACTION_COLORS).find(k => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : "bg-white/10 text-muted-foreground border-white/10";
}

function LiveTicker({ activities }: { activities: any[] }) {
  const latest = activities.slice(0, 10);
  const [tickerItems] = useState([...latest, ...latest]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-black/20 h-9 flex items-center">
      <div className="shrink-0 flex items-center gap-1.5 px-3 bg-gradient-to-r from-red-500/20 to-transparent border-r border-white/5 h-full pr-4">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Live</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex animate-[ticker_40s_linear_infinite] whitespace-nowrap">
          {[...tickerItems, ...tickerItems].map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-4">
              <span className="text-foreground font-medium">{a.user?.name || "System"}</span>
              <span>{a.action}</span>
              <span className={`${ENTITY_COLORS[a.entityType] || "text-muted-foreground"} capitalize font-medium`}>{a.entityType}</span>
              <span className="text-white/20">·</span>
              <span className="text-white/40">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
              <span className="text-white/10 mx-2">|</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ActivityFeed() {
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
              <h1 className="text-2xl font-display font-bold text-foreground">Live Activity Feed</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live · auto-refreshes every 5s
                </span>
                <span className="text-white/20">·</span>
                <span className="text-xs text-muted-foreground">Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => { setNewCount(0); fetchActivities(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground text-sm transition-colors border border-white/5 shrink-0"
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
      {activities.length > 0 && <LiveTicker activities={activities} />}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ENTITY_DOT).map(([type, dot]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
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
            <p className="text-muted-foreground text-sm">Loading activity feed...</p>
          </div>
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl">
          <Activity className="w-12 h-12 mx-auto text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground">No activity yet. Activity will appear here as you use Zentryx.</p>
        </div>
      ) : (
        <div className="relative pl-8 border-l border-white/8 space-y-0 pb-10">
          <AnimatePresence initial={false}>
            {activities.map((activity, index) => {
              const dotColor = ENTITY_DOT[activity.entityType] || "bg-primary";
              const isNew = newCount > 0 && index < newCount;
              return (
                <motion.div
                  key={activity.id}
                  initial={isNew ? { opacity: 0, x: -20 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: isNew ? index * 0.05 : 0 }}
                  className="relative pb-6 group"
                >
                  {/* Timeline dot */}
                  <div className={`absolute w-3 h-3 rounded-full -left-[30px] top-3.5 ring-2 ring-background shadow-lg ${dotColor}`} />
                  {/* Connector line highlight */}
                  {index === 0 && <div className="absolute w-px bg-gradient-to-b from-primary/40 to-transparent h-full -left-[24.5px] top-0" />}

                  <div className={`glass-card p-4 rounded-xl border transition-all group-hover:border-white/10 ${isNew ? "border-primary/20 bg-primary/5" : "border-white/5"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary/50 to-primary/50 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {activity.user?.name?.charAt(0) || <User className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm text-foreground">{activity.user?.name || "System"}</span>
                            <span className="text-muted-foreground text-sm">{activity.action}</span>
                            <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${getActionColor(activity.action)}`}>
                              {activity.action.split(" ")[0]}
                            </span>
                            <span className={`text-xs font-medium capitalize ${ENTITY_COLORS[activity.entityType] || "text-muted-foreground"}`}>
                              {activity.entityType?.replace(/_/g, " ")} {activity.entityId ? `#${activity.entityId}` : ""}
                            </span>
                          </div>
                          {activity.details && (
                            <p className="text-sm text-muted-foreground bg-black/20 px-3 py-1.5 rounded-lg border border-white/5 font-mono text-[12px] truncate">
                              {activity.details}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
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
