import { useState } from "react";
import { ShieldCheck, Users as UsersIcon, Lock, FileCheck2, ScrollText, KeyRound, Crown, Megaphone, SlidersHorizontal, Zap } from "lucide-react";
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
] as const;
type TabId = typeof TABS[number]["id"];

export default function AdminDashboard() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { data: me } = useGetCurrentUser();
  const isAdmin = (me?.role || "").toLowerCase() === "admin";
  const [tab, setTab] = useState<TabId>("overview");

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
      </div>
    </div>
  );
}
