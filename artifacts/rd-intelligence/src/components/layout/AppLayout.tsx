import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FlaskConical, LineChart, Users, Bell, Activity,
  Search, LogOut, Menu, X, MessageSquare, Briefcase, Sun, Moon, Zap,
  ChevronDown, User, FlaskConical as Flask, CheckSquare, Building2,
  ArrowRight, Loader2, CalendarDays, UserCircle, TrendingUp, ClipboardList,
  PanelLeftClose, PanelLeftOpen, Lock, Unlock, ShoppingCart, Package,
  ShieldCheck, ShieldX, Mail, Rss, Brain, CheckCheck, Check, Download, Volume2, VolumeX
} from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useAuthStore } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useGetCurrentUser, useListNotifications, useMarkNotificationRead } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL;

const SIDEBAR_LOCK_KEY = "zentryx_sidebar_locked";
const SIDEBAR_COLLAPSED_KEY = "zentryx_sidebar_collapsed";

const ALL_NAV_ITEMS = [
  { href: "/news-feed", label: "News Feed", icon: Rss },
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Project Portfolio", icon: FlaskConical },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/oracle", label: "Oracle", icon: Brain },
  { href: "/weekly-activities", label: "Weekly Activities", icon: ClipboardList },
  { href: "/business-dev", label: "Business Development", icon: Briefcase },
  { href: "/sales-force", label: "Sales Force", icon: TrendingUp },
  { href: "/materials-demand-planning", label: "Materials & Demand Planning", icon: Package },
  { href: "/procurement", label: "Procurement", icon: ShoppingCart },
  { href: "/team", label: "Team Directory", icon: Users },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/activity", label: "Activity Feed", icon: Activity },
  { href: "/chat", label: "Chat Room", icon: MessageSquare },
  { href: "/profile", label: "My Profile", icon: UserCircle },
];

const RESTRICTED_PATHS = ["/sales-force", "/projects", "/weekly-activities", "/business-dev", "/procurement"];

function getBlockedPaths(role: string, jobPos: string): string[] {
  const r = (role || "viewer").toLowerCase();
  const jp = (jobPos || "").toLowerCase();
  // Full access: admin, manager, ceo, any "head" role
  const privileged = ["admin", "manager", "ceo"].includes(r) || r.includes("head") ||
    jp.includes("head") || jp.includes("ceo") || jp.includes("admin") || jp.includes("manager");
  if (privileged) return [];
  // NPD technologist sees everything except Sales Force
  if (r === "npd_technologist") return ["/sales-force"];
  // KAM / SKAM — can see Sales Force, but not the others
  if (["key_account_manager", "senior_key_account_manager"].includes(r)) return ["/projects", "/weekly-activities", "/business-dev", "/procurement"];
  // Procurement role sees procurement and weekly activities, not Sales Force
  if (r === "procurement" || jp.includes("procurement")) return ["/sales-force", "/projects", "/business-dev"];
  // All other roles (viewer, graphics_designer, hr, quality_control, and any unknown)
  return RESTRICTED_PATHS;
}

const LAST_SEEN_NOTIFS_KEY = "zentryx_last_seen_notifications";

function NotificationBell({
  notifications,
  isLight,
}: {
  notifications: any[];
  isLight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

  // Smart blink — only animate when there's an unread notification newer
  // than the user's last bell-open timestamp. Persists across reloads.
  const [lastSeen, setLastSeen] = useState<number>(() => {
    try { return Number(localStorage.getItem(LAST_SEEN_NOTIFS_KEY) || "0"); } catch { return 0; }
  });
  const hasNewSinceLastOpen = notifications.some(
    n => !n.isRead && new Date(n.createdAt).getTime() > lastSeen,
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openDropdown = () => {
    setOpen(o => {
      if (!o) {
        const now = Date.now();
        setLastSeen(now);
        try { localStorage.setItem(LAST_SEEN_NOTIFS_KEY, String(now)); } catch {}
      }
      return !o;
    });
  };

  // Mark mutations need explicit invalidation — the generated mutation hook
  // doesn't refresh the /api/notifications query on its own, so without this
  // the row was being marked read on the server but the badge count and the
  // dot indicator stayed put until the page was reloaded.
  const handleMark = (id: number) => {
    markRead.mutate({ id }, { onSuccess: invalidate });
  };
  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;
    await Promise.allSettled(
      unread.map(n => new Promise<void>(resolve => {
        markRead.mutate({ id: n.id }, { onSettled: () => resolve() });
      })),
    );
    invalidate();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openDropdown}
        className={cn("relative p-2 rounded-full transition-colors", isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center shadow",
            hasNewSinceLastOpen && "animate-pulse",
          )}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute right-0 top-full mt-2 w-[360px] max-w-[92vw] rounded-2xl border z-50 overflow-hidden",
              isLight
                ? "bg-white border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
                : "glass-panel border-white/10 shadow-2xl",
            )}
          >
            <div className={cn(
              "px-4 py-3 border-b flex items-center justify-between gap-3",
              isLight ? "border-slate-100 bg-slate-50/80" : "border-white/5",
            )}>
              <p className={cn(
                "text-sm font-semibold flex items-center gap-2",
                isLight ? "text-slate-900" : "text-foreground",
              )}>
                <Bell className="w-4 h-4 text-primary" /> Notifications
                {unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive text-white font-bold">{unreadCount}</span>
                )}
              </p>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all
                  </button>
                )}
                <Link href="/notifications" onClick={() => setOpen(false)}
                  className="text-xs font-medium text-primary hover:underline">View all</Link>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className={cn("py-10 text-center text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  No notifications yet
                </div>
              ) : notifications.slice(0, 12).map((n: any) => (
                <div
                  key={n.id}
                  className={cn(
                    "group flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors",
                    isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/5",
                    !n.isRead && (isLight ? "bg-primary/[0.06]" : "bg-primary/10"),
                  )}
                >
                  <span className={cn(
                    "mt-1.5 w-2 h-2 rounded-full shrink-0",
                    n.isRead ? (isLight ? "bg-slate-300" : "bg-white/15") : "bg-primary shadow-[0_0_6px_rgba(124,77,255,0.6)]",
                  )} />
                  <div className="flex-1 min-w-0">
                    {n.title && (
                      <p className={cn(
                        "text-xs font-semibold leading-snug line-clamp-1 mb-0.5",
                        isLight ? "text-slate-900" : "text-foreground",
                      )}>
                        {n.title}
                      </p>
                    )}
                    <p className={cn(
                      "text-xs leading-snug line-clamp-2",
                      isLight ? (n.isRead ? "text-slate-500" : "text-slate-700") : (n.isRead ? "text-muted-foreground" : "text-foreground/90"),
                    )}>
                      {n.message}
                    </p>
                    {n.createdAt && (
                      <p className={cn("text-[10px] mt-1", isLight ? "text-slate-400" : "text-muted-foreground")}>
                        {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={() => handleMark(n.id)}
                      className={cn(
                        "shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all",
                        isLight ? "hover:bg-emerald-100 text-slate-400 hover:text-emerald-600" : "hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400",
                      )}
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SoundToggle({ isLight, muted, setMuted }: { isLight: boolean; muted: boolean; setMuted: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setMuted(!muted)}
      title={muted ? "Unmute notification sounds" : "Mute notification sounds"}
      className={cn(
        "p-2 rounded-full transition-colors",
        isLight
          ? muted
            ? "hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
          : muted
            ? "hover:bg-white/10 text-muted-foreground/60 hover:text-muted-foreground"
            : "hover:bg-white/10 text-muted-foreground hover:text-foreground",
      )}
    >
      {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
    </button>
  );
}

function InstallAppButton({ isLight }: { isLight: boolean }) {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  if (isInstalled || !canInstall) return null;
  return (
    <button
      onClick={() => { void promptInstall(); }}
      title="Install Zentryx as a desktop app"
      className={cn(
        "hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
        isLight
          ? "border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 shadow-sm"
          : "border-primary/30 text-primary bg-primary/10 hover:bg-primary/20",
      )}
    >
      <Download className="w-3.5 h-3.5" />
      Install App
    </button>
  );
}

function useAvatarColor(name: string) {
  const colors = [
    "from-violet-500 to-purple-600", "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600", "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600", "from-indigo-500 to-blue-600",
  ];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return colors[idx];
}

function UserMenu({ user, logout, isLight }: { user: any; logout: () => void; isLight: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const gradient = useAvatarColor(user?.name || "");

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border transition-all hover:shadow-lg",
          isLight ? "border-slate-200 bg-white hover:border-slate-300" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8",
        )}
      >
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xs shadow-md ring-2 ring-white/10`}>
          {initials}
        </div>
        <div className="hidden sm:block text-left leading-tight">
          <p className="text-xs font-semibold text-foreground leading-tight">{user?.name?.split(" ")[0] || "User"}</p>
          <p className={cn("text-[10px] capitalize leading-tight", isLight ? "text-slate-500" : "text-muted-foreground")}>
            {user?.role?.replace(/_/g, " ") || "Member"}
          </p>
        </div>
        <ChevronDown className={cn("w-3 h-3 transition-transform", isLight ? "text-slate-400" : "text-muted-foreground", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn("absolute right-0 top-full mt-2 w-64 rounded-2xl border z-50 overflow-hidden",
              isLight
                ? "border-white/50 shadow-[0_16px_48px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]"
                : "glass-panel border-white/10 shadow-2xl",
              isLight && "backdrop-blur-2xl saturate-200"
            )}
            style={isLight ? { background: "rgba(255,255,255,0.82)" } : undefined}
          >
            <div className={cn("p-4 border-b", isLight ? "border-slate-100" : "border-white/5")}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xl shadow-lg`}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{user?.name}</p>
                  <p className={cn("text-xs capitalize mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>{user?.role?.replace(/_/g, " ")}</p>
                  <p className={cn("text-[11px] mt-1 truncate", isLight ? "text-slate-400" : "text-muted-foreground/60")}>{user?.email}</p>
                </div>
              </div>
              <div className={cn("mt-3 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg w-fit", isLight ? "bg-emerald-50 text-emerald-600" : "bg-green-500/10 text-green-400")}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> Active
              </div>
            </div>
            <div className="p-2">
              <Link href="/profile" onClick={() => setOpen(false)}
                className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors", isLight ? "text-slate-600 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5 hover:text-foreground")}>
                <User className="w-4 h-4" /> Edit Profile
              </Link>
              <button onClick={() => { logout(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-destructive hover:bg-destructive/10 mt-1">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; href: (item: any) => string }> = {
  projects: { label: "Projects", icon: FlaskConical, color: "text-purple-400", href: (p) => `/projects/${p.id}` },
  tasks: { label: "Tasks", icon: CheckSquare, color: "text-blue-400", href: (t) => `/projects/${t.projectId}` },
  formulations: { label: "Formulations", icon: Flask, color: "text-teal-400", href: (f) => `/projects/${f.projectId}` },
  team: { label: "Team", icon: Users, color: "text-amber-400", href: () => `/team` },
  deals: { label: "Business Dev", icon: Building2, color: "text-rose-400", href: () => `/business-dev` },
};

function GlobalSearch({ isLight }: { isLight: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, any[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BASE}api/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` }
        });
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } catch {} finally { setLoading(false); }
    }, 300);
  }, [query]);

  const totalResults: number = results ? Object.values(results).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : 0;

  const handleSelect = (href: string) => {
    setQuery(""); setOpen(false); setResults(null);
    navigate(href);
  };

  return (
    <div className="relative max-w-md w-full" ref={ref}>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        {loading && <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
        <input
          type="text"
          placeholder="Search projects, tasks, team, deals..."
          className={cn(
            "w-full border rounded-full pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground",
            isLight ? "bg-slate-100 border-slate-200 focus:bg-white" : "bg-black/20 border-white/10 focus:bg-black/40"
          )}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results && totalResults > 0) setOpen(true); }}
          onKeyDown={e => { if (e.key === "Escape") { setQuery(""); setOpen(false); } }}
        />
      </div>

      <AnimatePresence>
        {open && results && totalResults > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full left-0 mt-2 w-full min-w-[420px] rounded-2xl border z-50 overflow-hidden max-h-[70vh] overflow-y-auto",
              isLight ? "backdrop-blur-2xl border-white/50 shadow-[0_16px_48px_rgba(0,0,0,0.10)]" : "glass-panel border-white/10 shadow-2xl"
            )}
            style={isLight ? { background: "rgba(255,255,255,0.88)" } : undefined}
          >
            <div className={cn("px-4 py-2.5 border-b flex items-center justify-between", isLight ? "border-white/40" : "border-white/5")}>
              <span className="text-xs text-muted-foreground">{totalResults} result{totalResults !== 1 ? "s" : ""} for <span className="text-foreground font-medium">"{query}"</span></span>
              <button onClick={() => { setQuery(""); setOpen(false); }} className="text-muted-foreground hover:text-foreground p-0.5"><X className="w-3.5 h-3.5" /></button>
            </div>
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const items: any[] = results[key] || [];
              if (items.length === 0) return null;
              const Icon = meta.icon;
              return (
                <div key={key} className={cn("border-b last:border-0", isLight ? "border-slate-100/60" : "border-white/5")}>
                  <div className="px-4 py-2 flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                  </div>
                  {items.map((item, i) => {
                    const href = meta.href(item);
                    const title = item.name || item.title || item.label || "Untitled";
                    const subtitle = item.customerName || item.clientName || item.status || item.stage || item.department || item.role || "";
                    return (
                      <button key={i} onClick={() => handleSelect(href)}
                        className={cn("w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors group",
                          isLight ? "hover:bg-violet-50/60" : "hover:bg-white/5"
                        )}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{title}</p>
                          {subtitle && <p className="text-xs text-muted-foreground truncate capitalize">{subtitle.toString().replace(/_/g, " ")}</p>}
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </motion.div>
        )}
        {open && results && totalResults === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cn("absolute top-full left-0 mt-2 w-full rounded-2xl border z-50 p-6 text-center backdrop-blur-2xl",
              isLight ? "border-white/50 shadow-[0_12px_40px_rgba(0,0,0,0.08)]" : "glass-panel border-white/10 shadow-2xl"
            )}
            style={isLight ? { background: "rgba(255,255,255,0.88)" } : undefined}>
            <p className="text-sm text-muted-foreground">No results for <span className="text-foreground font-medium">"{query}"</span></p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const [sidebarLocked, setSidebarLocked] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIDEBAR_LOCK_KEY);
    return stored === null ? true : stored === "true";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  const { data: user } = useGetCurrentUser();
  const { data: notifications } = useListNotifications();
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;
  const isLight = theme === "light";

  // Viewport-width tracking so we can force inline `padding: 0` on the
  // scroll container + page wrapper below lg: (1024 px). Inline styles
  // beat every CSS class and every browser-default, so this is the only
  // approach that's truly immune to theme-specific overrides and PWA
  // service-worker stale-asset weirdness.
  const [isBelowLg, setIsBelowLg] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth < 1024 : false,
  );
  useEffect(() => {
    const onResize = () => setIsBelowLg(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ─── Access request admin popup ──────────────────────────────────────────
  const [accessRequests, setAccessRequests] = useState<{ id: string; name: string; email: string; requestedAt: string }[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isPrivileged = user && (user.role || "").toLowerCase() === "admin";

  useEffect(() => {
    if (!isPrivileged) return;
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}api/access-requests`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) setAccessRequests(data);
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [isPrivileged]);

  const handleAllow = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await fetch(`${BASE}api/access-requests/${requestId}/allow`, { method: "POST" });
      setAccessRequests(prev => prev.filter(r => r.id !== requestId));
    } catch { /* silent */ }
    setProcessingId(null);
  };

  const handleDeny = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await fetch(`${BASE}api/access-requests/${requestId}/deny`, { method: "POST" });
      setAccessRequests(prev => prev.filter(r => r.id !== requestId));
    } catch { /* silent */ }
    setProcessingId(null);
  };

  const blockedPaths = getBlockedPaths(user?.role || "viewer", (user as any)?.jobPosition || "");
  const navItems = ALL_NAV_ITEMS.filter(item => !blockedPaths.includes(item.href));

  const isCollapsed = !sidebarLocked && sidebarCollapsed;

  const toggleCollapse = () => {
    if (sidebarLocked) return;
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const toggleLock = () => {
    setSidebarLocked(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_LOCK_KEY, String(next));
      if (next) {
        setSidebarCollapsed(false);
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "false");
      }
      return next;
    });
  };

  // Smart blink for chat icon — only animate when a NEW message has arrived
  // since the user's last /chat visit. Persist via localStorage.
  const CHAT_LAST_SEEN_KEY = "zentryx_chat_last_seen";
  const NEW_MSG_DISMISS_KEY = "zentryx_new_msg_dismissed";
  const [chatHasNew, setChatHasNew] = useState(false);
  // Popup overlay shown when a new message arrives off-/chat. Content of the
  // message is never shown — only the sender name, plus Open / Dismiss.
  const [newMsgPopup, setNewMsgPopup] = useState<{
    fromName: string;
    roomId: number;
    messageAt: number;
  } | null>(null);
  useEffect(() => {
    if (location === "/chat") {
      setChatUnread(false);
      setChatUnreadCount(0);
      setChatHasNew(false);
      setNewMsgPopup(null);
      try { localStorage.setItem(CHAT_LAST_SEEN_KEY, String(Date.now())); } catch {}
      return;
    }
    const checkUnread = async () => {
      try {
        const res = await fetch(`${BASE}api/chat/rooms`, { credentials: "include" });
        if (!res.ok) return;
        const rooms = await res.json();
        if (!Array.isArray(rooms)) return;
        const unreadRooms = rooms.filter((r: any) => r.hasUnread);
        setChatUnread(unreadRooms.length > 0);
        setChatUnreadCount(unreadRooms.length);
        // "New" means: an unread room whose last message was sent after the
        // user's last /chat visit. Without that gate the icon blinks forever
        // any time there's any unread DM in any room.
        let lastSeen = 0;
        try { lastSeen = Number(localStorage.getItem(CHAT_LAST_SEEN_KEY) || "0"); } catch {}
        let lastDismissed = 0;
        try { lastDismissed = Number(localStorage.getItem(NEW_MSG_DISMISS_KEY) || "0"); } catch {}
        const newMessages = unreadRooms.filter((r: any) => new Date(r.lastMessageAt ?? 0).getTime() > lastSeen);
        setChatHasNew(newMessages.length > 0);
        // Pop the most recent un-dismissed new-message overlay.
        const candidates = newMessages
          .filter((r: any) => new Date(r.lastMessageAt ?? 0).getTime() > lastDismissed)
          .sort((a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        const top = candidates[0];
        if (top) {
          setNewMsgPopup({
            fromName: top.lastMessageSender || top.name || "a teammate",
            roomId: top.id,
            messageAt: new Date(top.lastMessageAt).getTime(),
          });
        }
      } catch { /* silent */ }
    };
    checkUnread();
    const interval = setInterval(checkUnread, 8000);
    return () => clearInterval(interval);
  }, [location]);

  const dismissNewMsgPopup = () => {
    if (newMsgPopup) {
      try { localStorage.setItem(NEW_MSG_DISMISS_KEY, String(newMsgPopup.messageAt)); } catch {}
    }
    setNewMsgPopup(null);
  };

  // ── Notification sounds ─────────────────────────────────────────────────
  // Synthesised via Web Audio (no audio files), works identically in a
  // browser tab and inside the installed PWA window. Played on:
  //   • new chat message  → soft two-note rising chime
  //   • new bell notice   → single bell tone (deduped if a chat sound just
  //                         played, since chat arrivals also create a
  //                         notification row server-side)
  const { playMessage, playNotification, muted: soundsMuted, setMuted: setSoundsMuted } = useNotificationSound();
  const prevNotifCountRef = useRef(0);
  const prevNewMsgAtRef = useRef(0);
  const lastChatSoundAtRef = useRef(0);

  useEffect(() => {
    // Trigger when newMsgPopup picks up a fresh arrival.
    if (newMsgPopup && newMsgPopup.messageAt > prevNewMsgAtRef.current) {
      prevNewMsgAtRef.current = newMsgPopup.messageAt;
      lastChatSoundAtRef.current = Date.now();
      playMessage();
    }
  }, [newMsgPopup, playMessage]);

  useEffect(() => {
    const count = notifications?.length ?? 0;
    // Skip the very first run so we don't chime on initial page load.
    if (prevNotifCountRef.current > 0 && count > prevNotifCountRef.current) {
      // If a chat sound just fired within the last 2s, the new notification
      // is almost certainly the chat-derived row from notifyRoomMembers —
      // don't double-chime.
      if (Date.now() - lastChatSoundAtRef.current > 2000) {
        playNotification();
      }
    }
    prevNotifCountRef.current = count;
  }, [notifications, playNotification]);

  return (
    <div className={cn("h-screen flex overflow-hidden", isLight ? "light-app-bg" : "bg-background")}>

      {/* ─── SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        style={{ width: isCollapsed ? 64 : 256 }}
        className={cn(
          "flex-shrink-0 flex flex-col border-r z-50 overflow-hidden",
          // Animate width (desktop collapse) AND transform (mobile slide-in
          // from the logo on the left, expanding rightward into view).
          "transition-all duration-300 ease-in-out",
          "transform-gpu will-change-transform origin-left",
          /* Mobile: slide in over content as fixed overlay */
          "fixed inset-y-0 left-0",
          // Stay in document flow only on real desktops (lg, 1024 px+). On
          // phones AND tablets the sidebar becomes a slide-in overlay so the
          // page content owns the full viewport width by default.
          "lg:relative lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isLight ? "light-sidebar" : "dark-shell-sidebar"
        )}
      >
        {/* Sidebar Header */}
        <div className={cn(
          "h-16 flex items-center border-b shrink-0 gap-1.5",
          isCollapsed ? "justify-center px-2" : "px-4",
          isLight ? "border-white/40" : "border-white/5"
        )}>
          <div className={cn("flex items-center gap-2", isCollapsed ? "" : "flex-1 min-w-0")}>
            <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30 shrink-0", isLight && "logo-glow")}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <span className="font-display font-bold text-xl tracking-wide text-gradient truncate">Zentryx</span>
            )}
          </div>

          {/* Mobile close */}
          {!isCollapsed && (
            <button className="lg:hidden text-muted-foreground hover:text-foreground shrink-0 ml-auto" onClick={() => setIsMobileMenuOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Desktop collapse + lock controls */}
          {!isCollapsed && (
            <div className="hidden lg:flex items-center gap-0.5 ml-auto shrink-0">
              <button
                onClick={toggleLock}
                title={sidebarLocked ? "Unlock sidebar" : "Lock sidebar open"}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  sidebarLocked
                    ? "text-primary bg-primary/10 hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
              >
                {sidebarLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={toggleCollapse}
                title="Collapse sidebar"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div className={cn("flex-1 overflow-y-auto custom-scrollbar py-4", isCollapsed ? "px-1.5" : "px-3")}>
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              const isChatWithUnread = item.href === "/chat" && chatUnread && !isActive;
              const isChatBlinking = isChatWithUnread && chatHasNew;

              const navLink = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-xl transition-all duration-200 group font-medium relative",
                    isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                    isActive
                      ? isLight ? "light-nav-active" : "bg-primary/10 text-primary border border-primary/20 shadow-inner"
                      : isLight ? "light-nav-item" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <div className="relative shrink-0">
                    <item.icon className={cn(
                      "w-5 h-5 transition-transform group-hover:scale-110",
                      isActive ? (isLight ? "text-white" : "text-primary") : ""
                    )} />
                    {isChatWithUnread && (
                      <span className={cn(
                        "absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_6px_rgba(239,68,68,0.8)]",
                        isChatBlinking && "animate-pulse",
                      )} />
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {isChatWithUnread && (
                        <span className={cn(
                          "ml-auto text-[9px] font-bold text-red-400 bg-red-500/15 rounded-full px-2 py-0.5 leading-none uppercase tracking-wide",
                          isChatBlinking && "animate-pulse",
                        )}>New</span>
                      )}
                    </>
                  )}
                </Link>
              );

              if (isCollapsed) {
                return (
                  <div key={item.href} className="relative group/tip">
                    {navLink}
                    {/* Tooltip */}
                    <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[100]">
                      <div className={cn(
                        "text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl font-medium",
                        isLight ? "bg-gray-900 text-white" : "bg-white text-gray-900"
                      )}>
                        {item.label}
                        {isChatWithUnread && (
                          <span className="ml-1.5 text-red-400 font-bold">●</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return navLink;
            })}
          </div>
        </div>

        {/* Collapsed footer: expand + lock buttons */}
        {isCollapsed && (
          <div className={cn("shrink-0 pb-3 px-1.5 flex flex-col gap-1 border-t pt-3", isLight ? "border-slate-200" : "border-white/5")}>
            <div className="relative group/tip">
              <button
                onClick={toggleCollapse}
                title="Expand sidebar"
                className="w-full flex justify-center p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
              <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-[100]">
                <div className={cn("text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl font-medium", isLight ? "bg-gray-900 text-white" : "bg-white text-gray-900")}>
                  Expand sidebar
                </div>
              </div>
            </div>
            <div className="relative group/tip">
              <button
                onClick={toggleLock}
                className={cn(
                  "w-full flex justify-center p-2.5 rounded-xl transition-colors",
                  sidebarLocked ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
              >
                {sidebarLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-[100]">
                <div className={cn("text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl font-medium", isLight ? "bg-gray-900 text-white" : "bg-white text-gray-900")}>
                  {sidebarLocked ? "Unlock sidebar" : "Lock sidebar open"}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ─── MAIN AREA ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Header — fixed as part of flex column, never scrolls */}
        <header className={cn(
          "h-16 flex items-center justify-between z-40 border-b shrink-0",
          // Phone + tablet: tiny px-1 so the logo button sits flush at the
          // left edge. Only on real desktops (lg, 1024 px+) does the standard
          // 24 px topbar padding apply.
          "px-1 lg:px-6 gap-2 sm:gap-3",
          isLight ? "light-header" : "dark-shell-header"
        )}>
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Mobile menu trigger — uses the Zentryx logo glyph instead of
                a generic hamburger. Tapping it toggles the slide-in sidebar
                (sidebar header logo + nav). When the sidebar is open the
                glyph shows a small X overlay to read as "close". */}
            <button
              className={cn(
                "lg:hidden relative w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md shadow-primary/30 shrink-0 transition-all",
                isLight && "logo-glow",
                isMobileMenuOpen && "ring-2 ring-primary/40",
              )}
              onClick={() => setIsMobileMenuOpen(v => !v)}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-white" />
              ) : (
                <Zap className="w-5 h-5 text-white" />
              )}
            </button>

            {/* Greeting */}
            {user?.name && (
              <div className="hidden lg:flex flex-col leading-tight shrink-0">
                <span className="text-[11px] text-muted-foreground">{getGreeting()},</span>
                <span className="text-sm font-semibold text-foreground leading-tight">{user.name.split(" ")[0]} 👋</span>
              </div>
            )}
            {user?.name && <div className="hidden lg:block w-px h-6 bg-white/10 shrink-0" />}

            <div className="hidden sm:block flex-1 min-w-0">
              <GlobalSearch isLight={isLight} />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <InstallAppButton isLight={isLight} />
            <SoundToggle isLight={isLight} muted={soundsMuted} setMuted={setSoundsMuted} />
            <button
              onClick={toggleTheme}
              className={cn("p-2 rounded-full transition-colors", isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}
              title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            <NotificationBell notifications={notifications || []} isLight={isLight} />

            <UserMenu user={user} logout={logout} isLight={isLight} />
          </div>
        </header>

        {/* Scrollable Content — ONLY this div scrolls. Chat and Oracle take
            full width with minimal padding; every other route keeps the
            centred reading column. */}
        {(() => {
          const fillScreen = location === "/chat" || location === "/oracle";
          return (
            <div
              className={cn(
                "flex-1 overflow-y-auto custom-scrollbar relative",
                fillScreen ? "p-1.5" : "py-3 sm:p-6 lg:p-8",
              )}
              style={!fillScreen && isBelowLg ? { paddingLeft: 0, paddingRight: 0 } : undefined}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={location}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={cn(fillScreen ? "w-full h-full" : "max-w-7xl mx-auto")}
                  style={!fillScreen && isBelowLg ? { maxWidth: "100%", marginLeft: 0, marginRight: 0, paddingLeft: 0, paddingRight: 0, width: "100%" } : undefined}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          );
        })()}
      </div>

      {/* Mobile overlay backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ─── New Chat Message Overlay ────────────────────────────── */}
      <AnimatePresence>
        {newMsgPopup && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed top-20 right-6 z-[200] w-[320px] max-w-[92vw]"
          >
            <div className={cn(
              "rounded-2xl shadow-2xl border overflow-hidden",
              isLight ? "bg-white border-slate-200" : "bg-[#1a1a2e] border-white/10",
            )}>
              <div className={cn("px-4 py-3 flex items-center gap-2 border-b", isLight ? "border-slate-100 bg-slate-50" : "border-white/10 bg-white/5")}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs font-bold uppercase tracking-wider", isLight ? "text-primary" : "text-primary")}>New message</p>
                  <p className={cn("text-[10px]", isLight ? "text-slate-500" : "text-muted-foreground")}>From {newMsgPopup.fromName}</p>
                </div>
              </div>
              <div className="px-4 py-3">
                <p className={cn("text-sm leading-snug", isLight ? "text-slate-800" : "text-foreground")}>
                  You have one new message from <span className="font-semibold">{newMsgPopup.fromName}</span>.
                </p>
                <p className={cn("text-[10px] mt-1", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  Open to see the message — content is hidden until you do.
                </p>
              </div>
              <div className={cn("px-3 py-3 flex gap-2 border-t", isLight ? "border-slate-100 bg-slate-50/60" : "border-white/10 bg-white/[0.02]")}>
                <button
                  onClick={dismissNewMsgPopup}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-semibold transition-colors",
                    isLight ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10",
                  )}
                >
                  Dismiss
                </button>
                <Link
                  href="/chat"
                  onClick={() => setNewMsgPopup(null)}
                  className="flex-1 inline-flex items-center justify-center py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                  Open
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Admin Access Request Popup ──────────────────────────── */}
      {isPrivileged && accessRequests.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pointer-events-none pt-6 px-4">
          <div className={cn(
            "pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden",
            isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10"
          )}>
            {/* Header */}
            <div className={cn("px-4 py-3 flex items-center gap-2 border-b", isLight ? "border-gray-100 bg-gray-50" : "border-white/10 bg-white/5")}>
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground">Access Request</span>
              {accessRequests.length > 1 && (
                <span className="ml-auto text-xs text-muted-foreground">{accessRequests.length} pending</span>
              )}
            </div>

            {/* Requests list */}
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {accessRequests.map(req => (
                <div key={req.id} className="px-4 py-3">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold", isLight ? "bg-primary/10 text-primary" : "bg-primary/20 text-primary")}>
                      {req.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{req.name}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0" />{req.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(req.requestedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAllow(req.id)}
                      disabled={processingId === req.id}
                      className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {processingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Allow
                    </button>
                    <button
                      onClick={() => handleDeny(req.id)}
                      disabled={processingId === req.id}
                      className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {processingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldX className="w-3.5 h-3.5" />}
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
