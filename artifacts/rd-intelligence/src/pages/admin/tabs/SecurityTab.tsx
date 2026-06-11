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

export function SecurityTab({ isLight }: { isLight: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"2h" | "1d" | "3d" | "7d" | "1m" | "3m" | "6m" | "1y">("1d");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState<"all" | "user" | "result" | "ip" | "agent">("all");

  const getHoursBack = (range: string): number => {
    switch (range) {
      case "2h": return 2;
      case "1d": return 24;
      case "3d": return 72;
      case "7d": return 168;
      case "1m": return 30 * 24;
      case "3m": return 90 * 24;
      case "6m": return 180 * 24;
      case "1y": return 365 * 24;
      default: return 24;
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const hours = getHoursBack(timeRange);
      const qs = `?hours=${hours}&limit=500`;
      setRows((await apiGet(`/admin/login-attempts${qs}`)) || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [timeRange]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(r => {
      if (searchField === "user") {
        return (r.userName?.toLowerCase() || "").includes(q) || (r.email?.toLowerCase() || "").includes(q);
      } else if (searchField === "result") {
        return (r.reason?.toLowerCase() || "").includes(q) || (r.success ? "ok" : "failed").includes(q);
      } else if (searchField === "ip") {
        return (r.ipAddress?.toLowerCase() || "").includes(q);
      } else if (searchField === "agent") {
        return (r.userAgent?.toLowerCase() || "").includes(q);
      } else {
        return (r.userName?.toLowerCase() || "").includes(q) ||
          (r.email?.toLowerCase() || "").includes(q) ||
          (r.reason?.toLowerCase() || "").includes(q) ||
          (r.ipAddress?.toLowerCase() || "").includes(q) ||
          (r.userAgent?.toLowerCase() || "").includes(q);
      }
    });
  }, [rows, searchQuery, searchField]);

  const exportToCSV = () => {
    const csv = [
      ["When", "User / Email", "Result", "IP", "Agent"],
      ...filteredRows.map(r => [
        format(new Date(r.createdAt), "MMM d, HH:mm:ss"),
        `${r.userName || ""} (${r.email || ""})`,
        r.success ? "ok" : r.reason || "failed",
        r.ipAddress || "",
        r.userAgent || "",
      ]),
    ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `login-attempts-${format(new Date(), "yyyy-MM-dd_HHmmss")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToXLSX = () => {
    const data = filteredRows.map(r => ({
      "When": format(new Date(r.createdAt), "MMM d, HH:mm:ss"),
      "User": r.userName || "",
      "Email": r.email || "",
      "Result": r.success ? "ok" : r.reason || "failed",
      "IP": r.ipAddress || "",
      "Agent": r.userAgent || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Login Attempts");
    XLSX.writeFile(wb, `login-attempts-${format(new Date(), "yyyy-MM-dd_HHmmss")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="space-y-3">
        {/* Time Range & Search Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={e => setTimeRange(e.target.value as any)}
            className={cn("px-3 py-2 rounded-xl text-sm border transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-white/5 border-white/10 text-foreground")}
          >
            <option value="2h">Last 2 Hours</option>
            <option value="1d">Last 24 Hours</option>
            <option value="3d">Last 3 Days</option>
            <option value="7d">Last 7 Days</option>
            <option value="1m">Last 1 Month</option>
            <option value="3m">Last 3 Months</option>
            <option value="6m">Last 6 Months</option>
            <option value="1y">Last 1 Year</option>
          </select>

          {/* Search Field Selector */}
          <select
            value={searchField}
            onChange={e => setSearchField(e.target.value as any)}
            className={cn("px-3 py-2 rounded-xl text-sm border transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-white/5 border-white/10 text-foreground")}
          >
            <option value="all">Search All</option>
            <option value="user">User / Email</option>
            <option value="result">Result</option>
            <option value="ip">IP Address</option>
            <option value="agent">User Agent</option>
          </select>

          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={cn("w-full pl-9 pr-3 py-2 rounded-xl text-sm border transition-colors focus:outline-none focus:border-primary/50",
                isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10")}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={load}
            disabled={loading}
            className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
              isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-50")}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
          </button>

          <div className="flex gap-1.5 border rounded-xl p-1" style={{borderColor: isLight ? "#e2e8f0" : "rgba(255,255,255,0.1)"}}>
            <button
              onClick={exportToCSV}
              disabled={loading || filteredRows.length === 0}
              className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-transparent transition-colors",
                isLight ? "text-slate-600 hover:bg-slate-100 disabled:opacity-50" : "text-muted-foreground hover:bg-white/10 disabled:opacity-50")}
              title="Export as CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={exportToXLSX}
              disabled={loading || filteredRows.length === 0}
              className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-transparent transition-colors",
                isLight ? "text-slate-600 hover:bg-slate-100 disabled:opacity-50" : "text-muted-foreground hover:bg-white/10 disabled:opacity-50")}
              title="Export as XLSX"
            >
              <Download className="w-3.5 h-3.5" /> XLSX
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && filteredRows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No login activity in this period." : "No results matching your search."}
          </div>
        )}
        {!loading && filteredRows.length > 0 && (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[760px]">
              <thead className={cn("text-xs uppercase", isLight ? "bg-slate-50 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">When</th>
                  <th className="px-4 py-3 text-left font-medium">User / Email</th>
                  <th className="px-4 py-3 text-left font-medium">Result</th>
                  <th className="px-4 py-3 text-left font-medium">IP</th>
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.id} className={cn("border-t", isLight ? "border-slate-100" : "border-white/5")}>
                    <td className="px-4 py-3">
                      <p className={cn("text-xs", isLight ? "text-slate-700" : "text-foreground")}>
                        {format(new Date(r.createdAt), "MMM d, HH:mm:ss")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={cn("text-sm font-medium", isLight ? "text-slate-900" : "text-foreground")}>{r.userName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.success ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                          <CheckCircle2 className="w-3 h-3" /> {r.reason || "ok"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-500">
                          <XCircle className="w-3 h-3" /> {r.reason || "failed"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs flex items-center gap-1", isLight ? "text-slate-600" : "text-muted-foreground")}>
                        <Globe className="w-3 h-3" /> {r.ipAddress || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">
                      <span className={cn("text-[10px]", isLight ? "text-slate-500" : "text-muted-foreground")} title={r.userAgent || ""}>
                        {r.userAgent ? r.userAgent.slice(0, 60) + (r.userAgent.length > 60 ? "…" : "") : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Results info */}
      {!loading && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredRows.length} of {rows.length} entries
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Approvals (history)
// ─────────────────────────────────────────────────────────────────────────────
