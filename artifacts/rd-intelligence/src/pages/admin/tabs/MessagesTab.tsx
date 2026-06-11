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

export function MessagesTab({ isLight }: { isLight: boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [acks, setAcks] = useState<Record<number, any[]>>({});

  const loadAll = async () => {
    setLoading(true);
    try {
      const [u, m] = await Promise.all([
        apiGet("/admin/users"),
        apiGet("/admin/messages"),
      ]);
      setUsers(u || []);
      setMessages(m || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const filteredUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    if (!s) return users;
    return users.filter(u =>
      (u.name || "").toLowerCase().includes(s)
      || (u.email || "").toLowerCase().includes(s)
      || (u.department || "").toLowerCase().includes(s));
  }, [users, userSearch]);

  const toggleRecipient = (id: number) => {
    setRecipientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    if (audience === "selected" && recipientIds.length === 0) {
      alert("Pick at least one recipient or switch to All Users.");
      return;
    }
    setSending(true);
    try {
      const r = await apiPost("/admin/messages", { title: title.trim(), body: body.trim(), audience, recipientIds });
      if (r && r.id) {
        setTitle(""); setBody(""); setRecipientIds([]); setAudience("all");
        await loadAll();
      } else {
        alert("Failed to send message.");
      }
    } finally { setSending(false); }
  };

  const expand = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!acks[id]) {
      const rows = await apiGet(`/admin/messages/${id}/acknowledgments`);
      setAcks(prev => ({ ...prev, [id]: rows || [] }));
    }
  };

  const removeMessage = async (id: number) => {
    if (!confirm("Delete this message? Recipients who haven't acknowledged will no longer see it.")) return;
    await apiDelete(`/admin/messages/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
    if (expanded === id) setExpanded(null);
  };

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className={cn("glass-card rounded-2xl border p-6", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
        <h3 className={cn("font-semibold mb-1 flex items-center gap-2", isLight ? "text-slate-900" : "text-foreground")}>
          <Megaphone className="w-4 h-4 text-primary" /> New Message
        </h3>
        <p className={cn("text-xs mb-4", isLight ? "text-slate-500" : "text-muted-foreground")}>
          Sends a popup to every selected user. Each recipient must acknowledge it before it goes away.
        </p>

        <div className="space-y-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (e.g. System maintenance tonight at 22:00)"
            className={cn(
              "w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Message body — keep it clear and actionable. Markdown isn't rendered, just plain text."
            rows={4}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y",
              isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
            )}
          />

          {/* Audience toggle */}
          <div className="flex gap-2">
            {(["all", "selected"] as const).map(a => (
              <button key={a} onClick={() => setAudience(a)}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                  audience === a
                    ? "bg-primary text-white border-primary"
                    : isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}>
                {a === "all" ? "All Active Users" : "Selected Users"}
              </button>
            ))}
            <span className={cn("inline-flex items-center px-2 text-xs", isLight ? "text-slate-500" : "text-muted-foreground")}>
              {audience === "all"
                ? `${Math.max(0, users.filter(u => u.isActive).length - 1)} recipients`
                : `${recipientIds.length} selected`}
            </span>
          </div>

          {/* Selected-user picker */}
          {audience === "selected" && (
            <div className={cn("rounded-xl border p-3 space-y-2", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/10")}>
              <div className="relative">
                <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5", isLight ? "text-slate-400" : "text-muted-foreground")} />
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search users by name, email, department…"
                  className={cn(
                    "w-full h-8 rounded-lg border pl-8 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40",
                    isLight ? "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground",
                  )}
                />
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredUsers.filter(u => u.isActive).map(u => {
                  const checked = recipientIds.includes(u.id);
                  return (
                    <label key={u.id} className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs",
                      checked
                        ? "bg-primary/10 border border-primary/30 text-primary"
                        : isLight ? "border border-transparent hover:bg-white" : "border border-transparent hover:bg-white/5",
                    )}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRecipient(u.id)} className="accent-primary" />
                      <span className={cn("truncate", checked ? "" : isLight ? "text-slate-700" : "text-foreground")}>{u.name}</span>
                      <span className="ml-auto text-[10px] opacity-60 capitalize truncate">{(u.role || "").replace(/_/g, " ")}</span>
                    </label>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <p className={cn("col-span-2 text-center text-xs py-4", isLight ? "text-slate-400" : "text-muted-foreground")}>No users match.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={send}
              disabled={sending || !title.trim() || !body.trim() || (audience === "selected" && recipientIds.length === 0)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : "Send Message"}
            </button>
          </div>
        </div>
      </div>

      {/* Sent messages list */}
      <div>
        <h3 className={cn("font-semibold mb-3", isLight ? "text-slate-900" : "text-foreground")}>Sent Messages</h3>
        {loading && <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Loading…</p>}
        {!loading && messages.length === 0 && (
          <div className={cn("rounded-2xl border p-8 text-center", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
            <Megaphone className={cn("w-8 h-8 mx-auto mb-2", isLight ? "text-slate-300" : "text-muted-foreground/40")} />
            <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>No messages sent yet.</p>
          </div>
        )}
        {!loading && messages.length > 0 && (
          <ul className="space-y-2">
            {messages.map(m => {
              const isOpen = expanded === m.id;
              const ackList = acks[m.id] || [];
              const ackPct = m.recipientCount > 0 ? Math.round((m.acknowledgedCount / m.recipientCount) * 100) : 0;
              return (
                <li key={m.id} className={cn("glass-card rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
                  <button
                    onClick={() => expand(m.id)}
                    className={cn("w-full text-left px-5 py-4 flex items-start gap-3 transition-colors",
                      isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.02]",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className={cn("w-4 h-4", isLight ? "text-slate-400" : "text-muted-foreground")} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={cn("font-semibold text-sm truncate", isLight ? "text-slate-900" : "text-foreground")}>{m.title}</p>
                          <p className={cn("text-xs mt-0.5 line-clamp-2", isLight ? "text-slate-600" : "text-muted-foreground")}>{m.body}</p>
                          <p className={cn("text-[10px] mt-1", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                            {format(new Date(m.createdAt), "MMM d, yyyy HH:mm")} · {m.audience === "all" ? "All Active Users" : "Selected"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-xs font-semibold", isLight ? "text-slate-700" : "text-foreground")}>
                            {m.acknowledgedCount} / {m.recipientCount}
                          </p>
                          <div className={cn("h-1.5 w-24 mt-1 rounded-full overflow-hidden", isLight ? "bg-slate-200" : "bg-white/10")}>
                            <div className="h-full bg-emerald-500" style={{ width: `${ackPct}%` }} />
                          </div>
                          <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>{ackPct}% ack'd</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); removeMessage(m.id); }}
                          title="Delete message"
                          className={cn("p-1.5 rounded-lg shrink-0", isLight ? "text-slate-400 hover:text-red-500 hover:bg-red-50" : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className={cn("px-5 pb-5 border-t", isLight ? "border-slate-100" : "border-white/5")}>
                      <p className={cn("text-xs uppercase tracking-wider font-semibold mt-3 mb-2", isLight ? "text-slate-500" : "text-muted-foreground")}>Recipients</p>
                      {ackList.length === 0 && <p className="text-xs text-muted-foreground">Loading…</p>}
                      {ackList.length > 0 && (
                        <ul className="space-y-1">
                          {ackList.map((r: any) => (
                            <li key={r.userId} className="flex items-center gap-3 text-xs">
                              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                                r.acknowledgedAt
                                  ? "bg-emerald-500/15 text-emerald-500"
                                  : isLight ? "bg-slate-100 text-slate-400" : "bg-white/5 text-muted-foreground",
                              )}>
                                {r.acknowledgedAt ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={cn("truncate", isLight ? "text-slate-700" : "text-foreground")}>{r.userName || "Unknown"}</p>
                                <p className={cn("text-[10px] truncate", isLight ? "text-slate-400" : "text-muted-foreground")}>{r.userEmail}</p>
                              </div>
                              <span className={cn("text-[10px] shrink-0", isLight ? "text-slate-500" : "text-muted-foreground")}>
                                {r.acknowledgedAt ? `Ack'd ${formatDistanceToNow(new Date(r.acknowledgedAt), { addSuffix: true })}` : "Pending"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MFA Resets — handle the emergency-login fallback requests from users
// ─────────────────────────────────────────────────────────────────────────────
