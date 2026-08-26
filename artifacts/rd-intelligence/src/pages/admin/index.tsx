import { useState, useEffect, useRef, useCallback } from "react";
import { ShieldCheck, Users as UsersIcon, Lock, FileCheck2, ScrollText, KeyRound, Crown, Megaphone, SlidersHorizontal, Zap, X, LogIn, DatabaseBackup } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useGetCurrentUser } from "@/api-client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { OverviewTab } from "./tabs/OverviewTab";
import { UsersTab } from "./tabs/UsersTab";
import { RolesTab } from "./tabs/RolesTab";
import { MessagesTab } from "./tabs/MessagesTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { MfaResetsTab } from "./tabs/MfaResetsTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { ApprovalsTab } from "./tabs/ApprovalsTab";
import { AuditTab } from "./tabs/AuditTab";
import { BackupTab } from "./tabs/BackupTab";
import { apiGet } from "./lib/api";
import { format } from "date-fns";

const TABS = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "users", label: "Users", icon: UsersIcon },
  { id: "roles", label: "Roles & Access", icon: SlidersHorizontal },
  { id: "messages", label: "Messages", icon: Megaphone },
  { id: "settings", label: "Feature Flags", icon: Zap },
  { id: "mfa", label: "MFA Resets", icon: KeyRound },
  { id: "security", label: "Security & Logins", icon: Lock },
  { id: "approvals", label: "Approvals", icon: FileCheck2 },
  { id: "audit", label: "Audit Log", icon: ScrollText },
  { id: "backup", label: "Backup & Restore", icon: DatabaseBackup },
] as const;
type TabId = typeof TABS[number]["id"];

interface LoginNotification {
  id: string;
  userName: string;
  email: string;
  success: boolean;
  createdAt: string;
}

function LoginToast({ notif, isLight, onClose }: { notif: LoginNotification; isLight: boolean; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className={cn(
        "flex items-start gap-3 w-80 rounded-2xl border p-4 shadow-2xl",
        isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#111] border-white/10 text-foreground",
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        notif.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500",
      )}>
        <LogIn className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold truncate", isLight ? "text-slate-900" : "text-foreground")}>
          {notif.success ? "User logged in" : "Failed login attempt"}
        </p>
        <p className={cn("text-xs truncate mt-0.5", isLight ? "text-slate-600" : "text-muted-foreground")}>
          {notif.userName || notif.email || "Unknown"}
        </p>
        {notif.email && notif.userName && (
          <p className={cn("text-[10px] truncate", isLight ? "text-slate-400" : "text-muted-foreground/70")}>{notif.email}</p>
        )}
        <p className={cn("text-[10px] mt-1", isLight ? "text-slate-400" : "text-muted-foreground/60")}>
          {format(new Date(notif.createdAt), "HH:mm:ss")}
        </p>
        {/* 5s progress bar */}
        <div className={cn("mt-2 h-0.5 rounded-full overflow-hidden", isLight ? "bg-slate-100" : "bg-white/10")}>
          <motion.div
            className={cn("h-full rounded-full", notif.success ? "bg-emerald-500" : "bg-rose-500")}
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 5, ease: "linear" }}
          />
        </div>
      </div>
      <button onClick={onClose} className={cn("shrink-0 rounded-lg p-1 transition-colors", isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-white/10 text-muted-foreground")}>
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { data: me } = useGetCurrentUser();
  const isAdmin = (me?.role || "").toLowerCase() === "admin";
  const [tab, setTab] = useState<TabId>("overview");

  // Login notifications
  const [notifications, setNotifications] = useState<LoginNotification[]>([]);
  const seenIds = useRef<Set<number>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismissNotif = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const poll = async () => {
      try {
        const rows: any[] = (await apiGet("/admin/login-attempts?hours=1&limit=100")) || [];
        const fresh: LoginNotification[] = [];
        for (const r of rows) {
          if (!seenIds.current.has(r.id)) {
            if (seenIds.current.size > 0) {
              // Only show toasts after the first load (so we don't flood on mount)
              fresh.push({
                id: `${r.id}-${r.createdAt}`,
                userName: r.userName || "",
                email: r.email || "",
                success: !!r.success,
                createdAt: r.createdAt,
              });
            }
            seenIds.current.add(r.id);
          }
        }
        if (fresh.length > 0) {
          setNotifications(prev => [...fresh.slice(0, 3), ...prev].slice(0, 5));
        }
      } catch {}
    };

    poll(); // Initial load — populates seenIds without showing toasts
    pollRef.current = setInterval(poll, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isAdmin]);

  if (!me) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-center">
        <ShieldCheck className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground">This module is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn("text-3xl font-display font-bold flex items-center gap-3", isLight ? "text-slate-900" : "text-foreground")}>
          <Crown className="w-8 h-8 text-primary" /> Admin Dashboard
        </h1>
        <p className={cn("mt-1 text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
          Oversee users, approve gated actions, and audit every meaningful event across Zentryx.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border",
                active
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                  : isLight
                    ? "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "overview" && <OverviewTab isLight={isLight} />}
        {tab === "users" && <UsersTab isLight={isLight} />}
        {tab === "roles" && <RolesTab isLight={isLight} />}
        {tab === "messages" && <MessagesTab isLight={isLight} />}
        {tab === "settings" && <SettingsTab isLight={isLight} />}
        {tab === "mfa" && <MfaResetsTab isLight={isLight} />}
        {tab === "security" && <SecurityTab isLight={isLight} />}
        {tab === "approvals" && <ApprovalsTab isLight={isLight} />}
        {tab === "audit" && <AuditTab isLight={isLight} />}
        {tab === "backup" && <BackupTab />}
      </div>

      {/* Login notification toasts — bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {notifications.map(n => (
            <div key={n.id} className="pointer-events-auto">
              <LoginToast notif={n} isLight={isLight} onClose={() => dismissNotif(n.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
