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

export function MfaResetsTab({ isLight }: { isLight: boolean }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ email: string; token: string; expiresAt: string } | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await apiGet("/mfa/admin/emergency-requests");
      setRequests(Array.isArray(rows) ? rows : []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const approve = async (userId: number) => {
    setBusy(userId);
    try {
      const data = await apiPost(`/mfa/admin/emergency-approve/${userId}`, {});
      if (data?.oneTimeToken) {
        setIssuedToken({ email: data.email, token: data.oneTimeToken, expiresAt: data.expiresAt });
        await load();
      } else {
        alert(data?.message || "Approval failed");
      }
    } finally { setBusy(null); }
  };

  const deny = async (userId: number) => {
    if (!confirm("Deny this emergency login request? The user will be told to contact you.")) return;
    setBusy(userId);
    try {
      await apiPost(`/mfa/admin/emergency-deny/${userId}`, { reason: denyReason });
      setDenyReason("");
      await load();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className={cn("glass-card rounded-2xl border p-6", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        <h3 className={cn("font-semibold mb-1 flex items-center gap-2", isLight ? "text-slate-900" : "text-foreground")}>
          <KeyRound className="w-4 h-4 text-primary" /> MFA Emergency Requests
        </h3>
        <p className={cn("text-xs mb-4", isLight ? "text-slate-500" : "text-muted-foreground")}>
          Users who couldn't complete MFA and need a one-time login. Approving generates a single-use token —
          deliver it to the user out-of-band (verified phone call, in person). On use, their existing MFA is
          wiped and they must re-enroll.
        </p>

        {loading && <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Loading…</p>}

        {!loading && requests.length === 0 && (
          <div className={cn("rounded-xl border p-8 text-center", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")}>
            <KeyRound className={cn("w-8 h-8 mx-auto mb-2", isLight ? "text-slate-300" : "text-muted-foreground/40")} />
            <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>No pending emergency requests.</p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className={cn("rounded-xl border px-4 py-3 flex items-center gap-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")}>
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0", isLight ? "bg-primary/10 text-primary" : "bg-primary/20 text-primary")}>
                  {(r.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold text-sm truncate", isLight ? "text-slate-900" : "text-foreground")}>{r.name}</p>
                  <p className={cn("text-xs truncate", isLight ? "text-slate-500" : "text-muted-foreground")}>{r.email} · {r.role}</p>
                  {r.phone && (
                    <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-400" : "text-muted-foreground")}>
                      ☎ {r.phone}
                    </p>
                  )}
                  <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                    Expires {new Date(r.expires).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => approve(r.id)}
                  disabled={busy === r.id}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
                </button>
                <button
                  onClick={() => deny(r.id)}
                  disabled={busy === r.id}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50", isLight ? "border border-slate-200 text-slate-600 hover:bg-slate-100" : "border border-white/10 text-muted-foreground hover:bg-white/5")}
                >
                  Deny
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* One-time token reveal modal */}
      {issuedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setIssuedToken(null)}>
          <div onClick={(e) => e.stopPropagation()} className={cn("w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-[#1a1a2e] border-white/10")}>
            <div className={cn("px-5 py-4 border-b", isLight ? "border-slate-100 bg-gradient-to-r from-primary/5 to-emerald-500/5" : "border-white/10 bg-gradient-to-r from-primary/10 to-emerald-500/10")}>
              <p className={cn("text-[10px] font-bold uppercase tracking-wider", isLight ? "text-emerald-700" : "text-emerald-400")}>One-time login code</p>
              <p className={cn("font-semibold text-base mt-0.5", isLight ? "text-slate-900" : "text-foreground")}>Deliver this to {issuedToken.email}</p>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
                <strong>Share this code only via a verified channel</strong> — a phone call you initiated, in person,
                or another channel where you're certain the recipient is the legitimate user. This code is valid for
                30 minutes and works exactly once.
              </p>
              <code className={cn("block p-3 rounded-lg font-mono text-xs break-all select-all", isLight ? "bg-slate-100 text-slate-900" : "bg-white/5 text-foreground")}>{issuedToken.token}</code>
              <button
                onClick={() => navigator.clipboard.writeText(issuedToken.token)}
                className={cn("w-full text-xs py-2 rounded-lg border", isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}
              >
                Copy to clipboard
              </button>
              <p className={cn("text-[10px]", isLight ? "text-slate-500" : "text-muted-foreground")}>
                Expires {new Date(issuedToken.expiresAt).toLocaleString()}
              </p>
            </div>
            <div className={cn("px-5 py-4 border-t flex justify-end gap-2", isLight ? "border-slate-100 bg-slate-50" : "border-white/10 bg-white/[0.02]")}>
              <button onClick={() => setIssuedToken(null)} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings — Feature Flags
// ─────────────────────────────────────────────────────────────────────────────
