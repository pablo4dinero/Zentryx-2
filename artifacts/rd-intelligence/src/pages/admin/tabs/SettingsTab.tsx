import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users as UsersIcon, Lock, FileCheck2, ScrollText,
  Search, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, Activity, KeyRound, UserCheck, UserX,
  Crown, Mail, RefreshCw, Download, Globe,
  Megaphone, Send, Trash2, ChevronDown, ChevronRight,
  SlidersHorizontal, Save, Check, Pencil, X, Settings, Zap,
} from "lucide-react";
import { format, formatDistanceToNow, subHours, subDays, subMonths } from "date-fns";
import * as XLSX from "xlsx";
import { useGetCurrentUser } from "@/api-client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { roleLabel, useServerRoles, createCustomRole, ZENTRYX_MODULES, getEffectiveAllowedPaths, setRoleModules, renameRole } from "@/lib/roles";
import { BASE, apiHeaders, apiGet, apiPatch, apiPost, apiDelete } from "../lib/api";
import { SkeletonGrid } from "../components/SkeletonGrid";

export function SettingsTab({ isLight }: { isLight: boolean }) {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet("/admin/feature-flags");
      if (Array.isArray(data)) {
        setFlags(data);
      } else if (data?.error) {
        setError("Database not initialized. Please run POST /api/admin/feature-flags/init first.");
      }
    } catch (err) {
      setError("Failed to load feature flags. Database table may not exist yet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleFlag = async (featureName: string, currentValue: boolean) => {
    setToggling(featureName);
    try {
      const result = await apiPatch(`/admin/feature-flags/${featureName}`, {
        enabled: !currentValue,
        reason: "Toggled via Admin Dashboard",
      });
      setFlags(prev => prev.map(f => f.featureName === featureName ? result : f));
    } finally {
      setToggling(null);
    }
  };

  if (loading) return <SkeletonGrid isLight={isLight} />;

  const grouped = flags.reduce((acc: Record<string, any[]>, flag: any) => {
    const cat = flag.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(flag);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={cn("text-xl font-semibold", isLight ? "text-slate-900" : "text-foreground")}>Feature Flags</h2>
          <p className={cn("text-sm mt-1", isLight ? "text-slate-500" : "text-muted-foreground")}>
            Control which optimization and analytics features are enabled for all users.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
            isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
            loading && "opacity-50",
          )}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {Object.entries(grouped).map(([category, categoryFlags]) => (
        <div key={category}>
          <h3 className={cn("text-sm font-semibold uppercase tracking-wider mb-3", isLight ? "text-slate-600" : "text-muted-foreground")}>
            {category === "optimization" ? "Optimization Features" : "Analytics & Learning"}
          </h3>

          <div className="space-y-2">
            {categoryFlags.map((flag: any) => (
              <div
                key={flag.featureName}
                className={cn("glass-card rounded-xl p-4 border flex items-start justify-between", isLight ? "border-slate-200 bg-white" : "border-white/5")}
              >
                <div className="flex-1">
                  <p className={cn("font-semibold text-sm", isLight ? "text-slate-900" : "text-foreground")}>
                    {flag.displayName}
                  </p>
                  <p className={cn("text-xs mt-1", isLight ? "text-slate-500" : "text-muted-foreground")}>
                    {flag.description}
                  </p>
                </div>

                <button
                  onClick={() => toggleFlag(flag.featureName, flag.enabled)}
                  disabled={toggling === flag.featureName}
                  className={cn(
                    "ml-4 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                    flag.enabled
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20"
                      : isLight
                        ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                        : "border-white/10 text-muted-foreground hover:bg-white/5",
                    toggling === flag.featureName && "opacity-50",
                  )}
                >
                  {toggling === flag.featureName ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                  ) : flag.enabled ? (
                    <Check className="w-3.5 h-3.5 inline mr-1" />
                  ) : null}
                  {flag.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <div className={cn("rounded-xl p-6 border", isLight ? "border-amber-200 bg-amber-50" : "border-amber-900/30 bg-amber-500/10")}>
          <p className={cn("text-sm font-medium", isLight ? "text-amber-900" : "text-amber-200")}>
            ⚠️ {error}
          </p>
          <p className={cn("text-xs mt-2", isLight ? "text-amber-800" : "text-amber-300")}>
            The feature flags table hasn't been created yet. Contact your database administrator or wait for the database migrations to complete.
          </p>
        </div>
      )}

      {!error && flags.length === 0 && !loading && (
        <div className={cn("rounded-xl p-8 text-center border", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.02]")}>
          <Settings className={cn("w-10 h-10 mx-auto mb-3", isLight ? "text-slate-400" : "text-muted-foreground")} />
          <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
            No feature flags configured. Admin can initialize them.
          </p>
        </div>
      )}
    </div>
  );
}

