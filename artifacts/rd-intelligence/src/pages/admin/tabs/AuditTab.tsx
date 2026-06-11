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

export function AuditTab({ isLight }: { isLight: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows((await apiGet("/admin/audit-log?limit=300")) || []); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.action || "").toLowerCase().includes(s)
      || (r.entityType || "").toLowerCase().includes(s)
      || (r.userName || "").toLowerCase().includes(s)
      || (r.details || "").toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", isLight ? "text-slate-400" : "text-muted-foreground")} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by action, entity, user, details…"
            className={cn(
              "w-full h-10 rounded-xl border pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />
        </div>
        <button onClick={load} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border",
          isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No audit entries.</div>}
        {!loading && filtered.length > 0 && (
          <ul className={cn("divide-y", isLight ? "divide-slate-100" : "divide-white/5")}>
            {filtered.map(r => (
              <li key={r.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ScrollText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", isLight ? "text-slate-900" : "text-foreground")}>
                    <span className="font-semibold">{r.userName || "Unknown"}</span>
                    <span className={cn("mx-1", isLight ? "text-slate-500" : "text-muted-foreground")}>·</span>
                    <span className="capitalize">{r.action?.replace(/_/g, " ")}</span>
                    <span className={cn("mx-1", isLight ? "text-slate-500" : "text-muted-foreground")}>on</span>
                    <span className="capitalize font-medium">{r.entityType?.replace(/_/g, " ")}{r.entityId ? ` #${r.entityId}` : ""}</span>
                  </p>
                  {r.details && <p className={cn("text-xs mt-0.5 line-clamp-2", isLight ? "text-slate-500" : "text-muted-foreground")}>{r.details}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(r.createdAt), "MMM d, yyyy HH:mm:ss")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages (broadcast / targeted, with acknowledgment tracking)
// ─────────────────────────────────────────────────────────────────────────────
