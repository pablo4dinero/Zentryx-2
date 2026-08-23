import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, FileText, X, Send, Pencil, Calendar as CalendarIcon, MessageSquare, AtSign, SlidersHorizontal, Check, UserPlus, Search } from "lucide-react";
import { useUpdateProject, useDeleteProject, useListUsers } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CustomOptionsSelect } from "@/components/ui/CustomOptionsSelect";
import type { CustomOptionsHandle } from "@/lib/project-options";

type SortKey = "name" | "stage" | "status" | "productType" | "customerName" | "targetDate" | "progress" | "createdAt" | "assignees";
type SortDir = "asc" | "desc";

const BASE = import.meta.env.BASE_URL;

const STATUSES = [
  { value: "approved", label: "Approved" },
  { value: "awaiting_feedback", label: "Awaiting Feedback" },
  { value: "on_hold", label: "On Hold" },
  { value: "in_progress", label: "In Progress" },
  { value: "new_inventory", label: "New Inventory" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pushed_to_live", label: "Pushed To Live" },
];

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awaiting_feedback: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  on_hold: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  new_inventory: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  pushed_to_live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const STATUS_COLORS_LIGHT: Record<string, string> = {
  approved: "bg-green-100 text-green-700 border-green-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  awaiting_feedback: "bg-yellow-100 text-yellow-700 border-yellow-200",
  on_hold: "bg-orange-100 text-orange-700 border-orange-200",
  new_inventory: "bg-purple-100 text-purple-700 border-purple-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  pushed_to_live: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

// ─── Column customization ────────────────────────────────────────────────────

type ColKey = "productType" | "customerName" | "stage" | "progress" | "status" | "targetDate" | "createdAt" | "assignees";

const ALL_COL_DEFS: { key: ColKey; label: string; sortKey: SortKey }[] = [
  { key: "productType",  label: "Type",        sortKey: "productType"  },
  { key: "customerName", label: "Customer",    sortKey: "customerName" },
  { key: "stage",        label: "Stage",       sortKey: "stage"        },
  { key: "progress",     label: "Progress",    sortKey: "progress"     },
  { key: "status",       label: "Status",      sortKey: "status"       },
  { key: "assignees",    label: "Assigned To", sortKey: "assignees"    },
  { key: "targetDate",   label: "Due Date",    sortKey: "targetDate"   },
  { key: "createdAt",    label: "Date Added",  sortKey: "createdAt"    },
];
const DEFAULT_COL_ORDER = ALL_COL_DEFS.map(c => c.key) as ColKey[];
const DEFAULT_COL_VIS   = Object.fromEntries(ALL_COL_DEFS.map(c => [c.key, true])) as Record<ColKey, boolean>;

function getProjUserId(): string {
  try {
    const token = localStorage.getItem("rd_token");
    if (!token) return "anon";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return String(payload.userId ?? payload.sub ?? "anon");
  } catch { return "anon"; }
}

// ─── AssigneePickerCell ──────────────────────────────────────────────────────

function AssigneePickerCell({ project, users, isLight, onSave }: {
  project: any;
  users: any[];
  isLight: boolean;
  onSave: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const assignees: any[] = project.assignees || [];
  const assigneeIds: number[] = (project.assigneeIds?.length ? project.assigneeIds : assignees.map((a: any) => a.id)) || [];

  const toggle = (uid: number) => {
    const next = assigneeIds.includes(uid) ? assigneeIds.filter(id => id !== uid) : [...assigneeIds, uid];
    onSave(next);
  };

  const openPicker = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const top = window.innerHeight - r.bottom > 300 ? r.bottom + 4 : r.top - 304;
    setPos({ top, left: Math.min(r.left, window.innerWidth - 264) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false); setSearch("");
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Block Radix Dialog's bubble-phase focus trap via capture-phase interceptor
  useEffect(() => {
    if (!open) return;
    const guard = (e: FocusEvent) => {
      if (panelRef.current?.contains(e.relatedTarget as Node) || panelRef.current?.contains(e.target as Node))
        e.stopImmediatePropagation();
    };
    document.addEventListener("focusin", guard, true);
    document.addEventListener("focusout", guard, true);
    const t = setTimeout(() => searchRef.current?.focus(), 20);
    return () => {
      document.removeEventListener("focusin", guard, true);
      document.removeEventListener("focusout", guard, true);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    return u.name?.toLowerCase().includes(search.toLowerCase()) ||
           u.email?.toLowerCase().includes(search.toLowerCase());
  });

  const MAX_SHOWN = 3;
  const shown = assignees.slice(0, MAX_SHOWN);
  const extra = assignees.length - MAX_SHOWN;

  return (
    <div className="flex items-center gap-1">
      {shown.map((a: any) => (
        <div key={a.id} title={a.name}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ring-2 ring-background"
          style={{ background: `hsl(${(a.id * 47) % 360}, 55%, 48%)` }}>
          {(a.name || "?")[0].toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ring-2 ring-background",
          isLight ? "bg-gray-200 text-gray-600" : "bg-white/10 text-muted-foreground")}>
          +{extra}
        </div>
      )}
      <button ref={btnRef} type="button" onClick={openPicker} title="Manage assignees"
        className={cn("w-6 h-6 rounded-full border-2 border-dashed flex items-center justify-center transition-colors shrink-0 ml-0.5",
          isLight ? "border-gray-300 text-gray-400 hover:border-primary hover:text-primary" : "border-white/20 text-muted-foreground hover:border-primary hover:text-primary")}>
        <UserPlus className="w-3 h-3" />
      </button>

      {open && pos && createPortal(
        <div ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 200, width: 256 }}
          className={cn("rounded-xl border shadow-2xl overflow-hidden", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}>
          <div className={cn("px-3 py-2.5 border-b font-semibold text-xs uppercase tracking-wide", isLight ? "border-gray-100 text-gray-500" : "border-white/10 text-muted-foreground")}>
            Assignees
          </div>
          <div className={cn("p-2 border-b", isLight ? "border-gray-100" : "border-white/10")}>
            <div className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg border", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/10")}>
              <Search className="w-3 h-3 shrink-0 text-muted-foreground" />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { setOpen(false); setSearch(""); } }}
                onKeyUp={e => e.stopPropagation()}
                placeholder="Search team members..."
                className={cn("flex-1 min-w-0 text-xs bg-transparent border-none focus:outline-none",
                  isLight ? "text-slate-900 placeholder:text-slate-400" : "text-foreground placeholder:text-muted-foreground")}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filtered.length === 0 && (
              <p className="text-center py-4 text-xs text-muted-foreground">No team members found</p>
            )}
            {filtered.map((u: any) => {
              const assigned = assigneeIds.includes(u.id);
              return (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                    isLight ? "hover:bg-gray-50" : "hover:bg-white/5")}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: `hsl(${(u.id * 47) % 360}, 55%, 48%)` }}>
                    {(u.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className={cn("text-xs font-medium truncate", isLight ? "text-gray-900" : "text-foreground")}>{u.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate capitalize">{(u.role || "").replace(/_/g, " ")}</p>
                  </div>
                  <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    assigned ? "bg-primary border-primary" : isLight ? "border-gray-300" : "border-white/20")}>
                    {assigned && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
          {assigneeIds.length > 0 && (
            <div className={cn("px-3 py-2 border-t text-[10px]", isLight ? "border-gray-100 text-gray-400" : "border-white/5 text-muted-foreground/60")}>
              {assigneeIds.length} assignee{assigneeIds.length !== 1 ? "s" : ""} — click to toggle
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  projects: any[];
  productTypeOpts: CustomOptionsHandle;
  stageOpts: CustomOptionsHandle;
  statusOpts: CustomOptionsHandle;
}

// ─── Status Report Modal ─────────────────────────────────────────────────────
// Extracted into its own component so that typing in the textarea only
// re-renders the modal, NOT the entire ListView table (which contains many
// animated motion.tr rows that are expensive to reconcile on every keystroke).

function StatusReportModal({ project, isLight, users, onClose }: {
  project: any;
  isLight: boolean;
  users: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reportText, setReportText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [reportComments, setReportComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentsBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCommentsLoading(true);
    fetch(`${BASE}api/projects/${project.id}/comments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
    })
      .then(r => r.json())
      .then(d => setReportComments(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setCommentsLoading(false));
  }, [project.id]);

  const renderReportContent = (content: string) => {
    const parts = content.split(/(@\w[\w\s]*?)(?=\s|$|@)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1).trim();
        const user = users.find(u => u.name === name || content.includes(`@${u.name}`));
        if (user) return <span key={i} className="text-primary font-medium bg-primary/10 px-1 rounded">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const filteredMentions = mentionQuery !== null
    ? users.filter(u => u.name.toLowerCase().includes(mentionQuery!))
    : [];

  const handleReportInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setReportText(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (user: any) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const textBefore = reportText.slice(0, cursor);
    const textAfter = reportText.slice(cursor);
    const atIndex = textBefore.lastIndexOf("@");
    const newText = textBefore.slice(0, atIndex) + `@${user.name} ` + textAfter;
    setReportText(newText);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const submitReport = async () => {
    if (!reportText.trim()) return;
    setIsSubmitting(true);
    const mentionedUserIds = users
      .filter(u => reportText.includes(`@${u.name}`))
      .map(u => u.id);
    try {
      const res = await fetch(`${BASE}api/projects/${project.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
        body: JSON.stringify({ content: reportText, mentionedUserIds }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setReportComments(c => [...c, data]);
      setReportText("");
      setMentionQuery(null);
      setTimeout(() => commentsBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch {
      toast({ title: "Error", description: "Could not save the status report.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={cn("w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className={cn("flex items-center justify-between px-5 py-4 border-b shrink-0", isLight ? "border-gray-100" : "border-white/10")}>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <h3 className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Status Reports & Comments</h3>
              <p className={cn("text-xs mt-0.5", isLight ? "text-gray-500" : "text-muted-foreground")}>{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100" : "hover:bg-white/10")}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 min-h-0">
          {commentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : reportComments.length === 0 ? (
            <div className={cn("text-center py-12", isLight ? "text-gray-400" : "text-muted-foreground")}>
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No status reports yet. Add the first one below.</p>
            </div>
          ) : reportComments.map((c: any) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {c.authorName?.charAt(0) || "?"}
              </div>
              <div className={cn("flex-1 rounded-xl p-3", isLight ? "bg-gray-50 border border-gray-100" : "bg-white/5")}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className={cn("font-medium text-sm", isLight ? "text-gray-900" : "text-foreground")}>{c.authorName}</span>
                  <span className={cn("text-xs shrink-0", isLight ? "text-gray-400" : "text-muted-foreground")}>
                    {format(new Date(c.createdAt), "MMM d, yyyy · h:mm a")}
                  </span>
                </div>
                <p className={cn("text-sm whitespace-pre-wrap", isLight ? "text-gray-600" : "text-muted-foreground")}>
                  {renderReportContent(c.content)}
                </p>
              </div>
            </div>
          ))}
          <div ref={commentsBottomRef} />
        </div>

        {/* New report input */}
        <div className={cn("shrink-0 px-5 py-4 border-t", isLight ? "border-gray-100 bg-gray-50/60" : "border-white/10 bg-white/[0.02]")}>
          <div className="relative">
            <AnimatePresence>
              {mentionQuery !== null && filteredMentions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className={cn("absolute left-0 right-0 bottom-full mb-2 rounded-xl border shadow-xl overflow-hidden z-10", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}
                >
                  {filteredMentions.map((u: any, idx: number) => (
                    <button
                      key={u.id}
                      onMouseDown={e => { e.preventDefault(); insertMention(u); }}
                      className={cn("w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors",
                        idx === mentionIndex
                          ? isLight ? "bg-purple-50 text-purple-700" : "bg-primary/10 text-primary"
                          : isLight ? "text-gray-700 hover:bg-gray-50" : "text-foreground hover:bg-white/5")}
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {u.name[0]}
                      </div>
                      <span>{u.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto capitalize">{(u.role ?? "").replace(/_/g, " ")}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={textareaRef}
              value={reportText}
              onChange={handleReportInput}
              onKeyDown={e => {
                if (mentionQuery !== null && e.key === "Escape") { setMentionQuery(null); return; }
                if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) { e.preventDefault(); submitReport(); }
              }}
              placeholder="Write a status report... Type @ to mention a team member (Enter to send)"
              rows={3}
              className={cn("w-full rounded-xl border px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none",
                isLight ? "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground")}
            />
            <AtSign className="absolute right-3 top-3 w-4 h-4 text-muted-foreground opacity-40 pointer-events-none" />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className={cn("text-[11px]", isLight ? "text-gray-400" : "text-muted-foreground/60")}>Shift+Enter for new line</p>
            <div className="flex gap-2">
              <button onClick={onClose} className={cn("px-4 py-2 rounded-xl text-sm transition-colors", isLight ? "text-gray-600 hover:bg-gray-100" : "text-muted-foreground hover:bg-white/5")}>
                Close
              </button>
              <button
                onClick={submitReport}
                disabled={!reportText.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl text-sm bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? "Posting…" : "Post Report"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ListView({ projects, productTypeOpts, stageOpts, statusOpts }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: number; currentStatus: string } | null>(null);
  const [statusReport, setStatusReport] = useState<{ project: any } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  // Inline name editing
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Per-column widths. Stored in localStorage so the user's preferred
  // column sizes survive across reloads. Drag a column's right-edge
  // handle on desktop to resize.
  const COL_WIDTH_KEY = "zentryx_project_list_col_widths";
  const DEFAULT_COL_WIDTHS: Record<string, number> = {
    name: 260, productType: 140, customerName: 200, stage: 140,
    progress: 140, status: 150, assignees: 180, targetDate: 130, createdAt: 130, actions: 110,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(COL_WIDTH_KEY);
      return raw ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(raw) } : DEFAULT_COL_WIDTHS;
    } catch { return DEFAULT_COL_WIDTHS; }
  });
  useEffect(() => {
    try { localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(colWidths)); } catch { /* silent */ }
  }, [colWidths]);

  // Column order + visibility — per user, per device
  const userId = useRef(getProjUserId()).current;
  const COL_PREFS_KEY = `proj_col_prefs_${userId}`;
  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    try {
      const raw = localStorage.getItem(`proj_col_prefs_${userId}`);
      const s = raw ? JSON.parse(raw) : null;
      if (Array.isArray(s?.order)) {
        // Append any columns added since the user last saved (e.g. "assignees")
        const stored = s.order as ColKey[];
        const newCols = DEFAULT_COL_ORDER.filter(k => !stored.includes(k));
        return [...stored, ...newCols];
      }
      return DEFAULT_COL_ORDER;
    } catch { return DEFAULT_COL_ORDER; }
  });
  const [colVis, setColVis] = useState<Record<ColKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`proj_col_prefs_${userId}`);
      const s = raw ? JSON.parse(raw) : null;
      return s?.visible ? { ...DEFAULT_COL_VIS, ...s.visible } : DEFAULT_COL_VIS;
    } catch { return DEFAULT_COL_VIS; }
  });
  const [showColToggle, setShowColToggle] = useState(false);
  const [colTogglePos, setColTogglePos] = useState<{ top: number; right: number } | null>(null);
  const colButtonRef = useRef<HTMLButtonElement>(null);
  const colToggleRef = useRef<HTMLDivElement>(null);
  const draggingColRef = useRef<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);

  useEffect(() => {
    try { localStorage.setItem(COL_PREFS_KEY, JSON.stringify({ order: colOrder, visible: colVis })); } catch { /* silent */ }
  }, [colOrder, colVis, COL_PREFS_KEY]);

  useEffect(() => {
    if (!showColToggle) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (colToggleRef.current?.contains(t) || colButtonRef.current?.contains(t)) return;
      setShowColToggle(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showColToggle]);

  const openColToggle = () => {
    if (colButtonRef.current) {
      const r = colButtonRef.current.getBoundingClientRect();
      setColTogglePos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setShowColToggle(true);
  };

  const orderedVisibleCols = useMemo(
    () => colOrder.map(key => ALL_COL_DEFS.find(c => c.key === key)!).filter(c => c && colVis[c.key] !== false),
    [colOrder, colVis],
  );


  // Drag and drop for project status changes
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const resizeCol = (key: string, startEvt: React.MouseEvent) => {
    startEvt.stopPropagation();
    startEvt.preventDefault();
    const startX = startEvt.clientX;
    const startWidth = colWidths[key] ?? DEFAULT_COL_WIDTHS[key] ?? 140;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(80, Math.min(600, startWidth + (ev.clientX - startX)));
      setColWidths(w => ({ ...w, [key]: next }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { data: users = [] } = useListUsers();

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "progress") {
        av = a.taskCount > 0 ? (a.completedTaskCount / a.taskCount) : 0;
        bv = b.taskCount > 0 ? (b.completedTaskCount / b.taskCount) : 0;
      } else if (sortKey === "assignees") {
        av = (a.assignees || []).map((x: any) => x.name).join(",").toLowerCase();
        bv = (b.assignees || []).map((x: any) => x.name).join(",").toLowerCase();
      } else if (sortKey === "targetDate" || sortKey === "createdAt") {
        av = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
        bv = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
      } else {
        av = (a[sortKey] || "").toLowerCase();
        bv = (b[sortKey] || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [projects, sortKey, sortDir]);

  const handleRightClick = (e: React.MouseEvent, project: any) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id, currentStatus: project.status });
  };

  const handleStatusChange = (projectId: number, newStatus: string) => {
    updateField(projectId, "status", newStatus);
    setContextMenu(null);
  };

  // Generic in-place field update with optimistic UI + server rollback
  // on failure. Used by the inline editors (name / type / stage / status /
  // due date) in the table cells.
  const updateField = (projectId: number, field: string, value: any) => {
    // Guard: block status changes on pending projects and show a specific message
    if (field === "status") {
      const proj = (projects as any[]).find(p => p.id === projectId);
      if (proj && (proj.status as string) === "pending") {
        const hasCommercial = !!proj.commercialApprovedBy;
        const hasTechnical = !!proj.technicalApprovedBy;
        let reason = "Pending ";
        if (!hasCommercial && !hasTechnical) reason += "Commercial and Technical Approval";
        else if (!hasCommercial) reason += "Commercial Approval";
        else reason += "Technical Approval";
        toast({ title: reason, description: "Open the project to approve it.", variant: "destructive" });
        return;
      }
    }
    // setQueriesData uses prefix matching, so it hits ["/api/projects", {}] and
    // any other param variants — setQueryData(["/api/projects"]) would miss them.
    queryClient.setQueriesData({ queryKey: ["/api/projects"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(p => p.id === projectId ? { ...p, [field]: value } : p);
    });
    updateMutation.mutate({ id: projectId, data: { [field]: value } as any }, {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: `Failed to update ${field}`, variant: "destructive" });
      },
    });
  };

  const updateAssignees = (projectId: number, newIds: number[]) => {
    const newAssignees = (users as any[]).filter(u => newIds.includes(u.id));
    queryClient.setQueriesData({ queryKey: ["/api/projects"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(p => p.id === projectId ? { ...p, assigneeIds: newIds, assignees: newAssignees } : p);
    });
    updateMutation.mutate({ id: projectId, data: { assigneeIds: newIds } as any }, {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Failed to update assignees", variant: "destructive" });
      },
    });
  };

  const commitName = (projectId: number) => {
    const next = editingNameValue.trim();
    if (next && next !== projects.find(p => p.id === projectId)?.name) {
      updateField(projectId, "name", next);
    }
    setEditingNameId(null);
  };

  const handleDelete = (e: React.MouseEvent, project: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) return;
    // Optimistic update
    queryClient.setQueriesData({ queryKey: ["/api/projects"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.filter(p => p.id !== project.id);
    });
    deleteMutation.mutate({ id: project.id }, {
      onSuccess: () => toast({ title: "Project deleted", description: `"${project.name}" was permanently deleted.` }),
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Failed to delete project", variant: "destructive" });
      },
    });
  };


  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const Th = ({ k, label, widthKey, colKey }: { k: SortKey; label: string; widthKey?: string; colKey?: ColKey }) => {
    const wKey = widthKey || (k as string);
    const width = colWidths[wKey];
    const isDraggable = !!colKey;
    const isOver = colKey && dragOverCol === colKey;
    return (
      <th
        style={width ? { width, minWidth: width, maxWidth: width } : undefined}
        className={cn(
          "relative px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide transition-colors select-none",
          isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          isOver && "border-l-2 border-primary",
          isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => handleSort(k)}
        draggable={isDraggable}
        onDragStart={isDraggable && colKey ? e => {
          draggingColRef.current = colKey;
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onDragEnd={isDraggable ? () => { draggingColRef.current = null; setDragOverCol(null); } : undefined}
        onDragOver={isDraggable && colKey ? e => {
          e.preventDefault();
          if (draggingColRef.current && draggingColRef.current !== colKey) setDragOverCol(colKey);
        } : undefined}
        onDragLeave={isDraggable ? () => setDragOverCol(null) : undefined}
        onDrop={isDraggable && colKey ? e => {
          e.preventDefault();
          const from = draggingColRef.current;
          const to = colKey;
          draggingColRef.current = null;
          setDragOverCol(null);
          if (!from || from === to) return;
          setColOrder(prev => {
            const next = [...prev];
            const fi = next.indexOf(from);
            const ti = next.indexOf(to);
            if (fi === -1 || ti === -1) return prev;
            next.splice(fi, 1);
            next.splice(ti, 0, from);
            return next;
          });
        } : undefined}
      >
        <div className="flex items-center gap-1.5 pr-3">
          {label}
          <SortIcon k={k} />
        </div>
        <span
          onMouseDown={e => resizeCol(wKey, e)}
          onClick={e => e.stopPropagation()}
          draggable={false}
          className="hidden lg:block absolute top-1 bottom-1 right-0 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
          title="Drag to resize column"
        />
      </th>
    );
  };

  const renderCell = (colKey: ColKey, p: any) => {
    const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0;
    const statusColor = isLight
      ? STATUS_COLORS_LIGHT[p.status] || "bg-gray-100 text-gray-700 border-gray-200"
      : STATUS_COLORS[p.status] || "bg-white/5 text-muted-foreground border-white/10";
    switch (colKey) {
      case "productType":
        return <CustomOptionsSelect compact value={p.productType || ""} onChange={v => updateField(p.id, "productType", v)} handle={productTypeOpts} placeholder="—" isLight={isLight} />;
      case "customerName":
        return (
          <div>
            <p className={cn("text-xs", isLight ? "text-gray-900" : "text-foreground")}>{p.customerName || "—"}</p>
            {p.customerEmail && <p className="text-[10px] text-muted-foreground">{p.customerEmail}</p>}
          </div>
        );
      case "stage":
        return <CustomOptionsSelect compact value={p.stage || ""} onChange={v => updateField(p.id, "stage", v)} handle={stageOpts} displayFn={v => v.replace(/_/g, " ")} placeholder="—" isLight={isLight} />;
      case "progress":
        return (
          <div className="flex items-center gap-2">
            <div className={cn("w-16 h-1.5 rounded-full overflow-hidden shrink-0", isLight ? "bg-gray-200" : "bg-black/30")}>
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7c3aed, #3b82f6)" }} />
            </div>
            <span className={cn("text-xs w-8", isLight ? "text-gray-900" : "text-foreground")}>{progress}%</span>
          </div>
        );
      case "status":
        return (
          <CustomOptionsSelect compact value={p.status || ""} onChange={v => updateField(p.id, "status", v)} handle={statusOpts} displayFn={v => v.replace(/_/g, " ")} placeholder="—" isLight={isLight}
            triggerClassName={cn("px-2.5 py-1 rounded-full border text-[11px] font-medium capitalize", statusColor)}
          />
        );
      case "targetDate":
        return (
          <div className="relative inline-flex items-center gap-1.5 group/date">
            <span className={cn("text-xs", isLight ? "text-gray-600" : "text-muted-foreground")}>
              {p.targetDate ? format(new Date(p.targetDate), "MMM d, yyyy") : "—"}
            </span>
            <label className={cn("relative cursor-pointer p-1 rounded transition-opacity opacity-0 group-hover/date:opacity-100",
              isLight ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100" : "text-muted-foreground hover:text-foreground hover:bg-white/10")}>
              <CalendarIcon className="w-3 h-3" />
              <input type="date" value={p.targetDate ? format(new Date(p.targetDate), "yyyy-MM-dd") : ""}
                onChange={e => updateField(p.id, "targetDate", e.target.value || null)}
                onClick={e => e.stopPropagation()} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
          </div>
        );
      case "assignees":
        return (
          <AssigneePickerCell
            project={p}
            users={users as any[]}
            isLight={isLight}
            onSave={(ids) => updateAssignees(p.id, ids)}
          />
        );
      case "createdAt":
        return <span className={cn("text-xs", isLight ? "text-gray-600" : "text-muted-foreground")}>{p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}</span>;
      default:
        return null;
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className={cn("rounded-2xl border", isLight ? "bg-white border-gray-200 shadow-sm" : "glass-card border-white/10")}>

          {/* Columns toolbar */}
          <div className={cn("flex items-center justify-end px-4 py-2.5 border-b", isLight ? "border-gray-100 bg-gray-50/60" : "border-white/5 bg-white/[0.01]")}>
            <button
              ref={colButtonRef}
              onClick={() => showColToggle ? setShowColToggle(false) : openColToggle()}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
                showColToggle
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Columns
            </button>
          </div>

          <div className="table-scroll custom-scrollbar rounded-b-2xl">
            <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: 900 }}>
              <thead>
                <tr className={cn("border-b", isLight ? "border-gray-200 bg-gray-50" : "border-white/10")} style={isLight ? {} : { background: "rgba(255,255,255,0.03)" }}>
                  <Th k="name" label="Name" />
                  {orderedVisibleCols.map(col => (
                    <Th key={col.key} k={col.sortKey} label={col.label} widthKey={col.key} colKey={col.key} />
                  ))}
                  <th style={{ width: colWidths.actions, minWidth: colWidths.actions }} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr
                    key={p.id}
                    onContextMenu={(e) => handleRightClick(e, p)}
                    draggable
                    onDragStart={(e) => {
                      (e as unknown as DragEvent).dataTransfer!.setData("projectId", String(p.id));
                      (e as unknown as DragEvent).dataTransfer!.effectAllowed = "move";
                      setDraggingId(p.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    style={{ opacity: draggingId === p.id ? 0.5 : 1 }}
                    className={cn("border-b transition-colors group cursor-grab active:cursor-grabbing", isLight ? "border-gray-100 hover:bg-gray-50" : "border-white/5 hover:bg-white/[0.03]")}
                  >
                    {/* Name — always first, pinned */}
                    <td className="px-4 py-3.5">
                      {editingNameId === p.id ? (
                        <input
                          autoFocus
                          value={editingNameValue}
                          onChange={e => setEditingNameValue(e.target.value)}
                          onBlur={() => commitName(p.id)}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); commitName(p.id); }
                            if (e.key === "Escape") setEditingNameId(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          className={cn("text-sm font-semibold w-full rounded-lg px-2 py-1 border focus:outline-none focus:ring-2 focus:ring-primary/50",
                            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-black/30 border-white/10 text-foreground")}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 group/name">
                          <Link href={`/projects/${p.id}`} className="flex-1 min-w-0">
                            <p className={cn("text-sm font-semibold group-hover:text-primary transition-colors line-clamp-1", isLight ? "text-gray-900" : "text-foreground")}>{p.name}</p>
                            {p.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>}
                          </Link>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setEditingNameId(p.id); setEditingNameValue(p.name); }}
                            title="Rename"
                            className={cn("opacity-0 group-hover/name:opacity-100 p-1 rounded transition-opacity shrink-0",
                              isLight ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100" : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                            )}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Dynamic columns */}
                    {orderedVisibleCols.map(col => (
                      <td key={col.key} className="px-4 py-3.5">{renderCell(col.key, p)}</td>
                    ))}
                    {/* Actions — always last, pinned */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setStatusReport({ project: p }); setReportText(""); }}
                          className={cn("p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs", isLight ? "hover:bg-blue-50 text-blue-600" : "hover:bg-blue-500/10 text-blue-400")}
                          title="Status Report"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Report</span>
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, p)}
                          className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-red-50 text-red-500" : "hover:bg-red-500/10 text-red-400")}
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sorted.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No projects to display.</div>
            )}
          </div>

          {sorted.length > 0 && (
            <div className={cn("px-4 py-2.5 border-t flex items-center justify-between", isLight ? "border-gray-100 bg-gray-50" : "border-white/5")} style={isLight ? {} : { background: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs text-muted-foreground">{sorted.length} project{sorted.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground hidden sm:block">Right-click a row to change status · Click headers to sort · Drag headers to reorder · Drag edges to resize</p>
              <p className="text-xs text-muted-foreground sm:hidden">Swipe sideways to see more columns</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Right-click Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={contextRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={cn("fixed z-50 rounded-xl shadow-xl border overflow-hidden min-w-[180px]", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className={cn("px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b", isLight ? "text-gray-500 border-gray-100" : "text-muted-foreground border-white/10")}>
              Change Status
            </div>
            {STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => handleStatusChange(contextMenu.projectId, s.value)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                  contextMenu.currentStatus === s.value
                    ? isLight ? "bg-purple-50 text-purple-700 font-semibold" : "bg-primary/10 text-primary font-semibold"
                    : isLight ? "text-gray-700 hover:bg-gray-50" : "text-foreground hover:bg-white/5"
                )}
              >
                {contextMenu.currentStatus === s.value && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                {contextMenu.currentStatus !== s.value && <span className="w-1.5 h-1.5" />}
                {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Report Modal */}
      <AnimatePresence>
        {statusReport && (
          <StatusReportModal
            project={statusReport.project}
            isLight={isLight}
            users={users as any[]}
            onClose={() => setStatusReport(null)}
          />
        )}
      </AnimatePresence>

      {/* Columns popover — portaled to escape overflow:hidden */}
      {showColToggle && colTogglePos && createPortal(
        <div
          ref={colToggleRef}
          style={{
            position: "fixed",
            top: colTogglePos.top,
            right: colTogglePos.right,
            zIndex: 200,
            width: 220,
          }}
          className={cn("rounded-2xl border shadow-2xl overflow-hidden", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}
        >
          <div className={cn("px-3 py-2.5 border-b text-xs font-semibold uppercase tracking-wide", isLight ? "border-gray-100 text-gray-500" : "border-white/10 text-muted-foreground")}>
            Toggle Columns
          </div>
          <div className="p-2 space-y-0.5 max-h-72 overflow-y-auto custom-scrollbar">
            {ALL_COL_DEFS.map(col => {
              const visible = colVis[col.key] ?? true;
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => setColVis(prev => ({ ...prev, [col.key]: !visible }))}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                    isLight ? "hover:bg-gray-50 text-gray-700" : "hover:bg-white/5 text-foreground",
                  )}
                >
                  <span className={cn("w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                    visible ? "bg-primary border-primary" : isLight ? "border-gray-300" : "border-white/20"
                  )}>
                    {visible && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  {col.label}
                </button>
              );
            })}
          </div>
          <div className={cn("px-3 py-2 border-t text-[10px] text-center", isLight ? "border-gray-100 text-gray-400" : "border-white/5 text-muted-foreground/60")}>
            Drag column headers to reorder
          </div>
        </div>,
        document.body
      )}
    </>
  );
}