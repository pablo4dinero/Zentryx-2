import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, FileText, X, Send } from "lucide-react";
import { useUpdateProject, useDeleteProject, useListUsers } from "@/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SortKey = "name" | "stage" | "status" | "productType" | "customerName" | "targetDate" | "progress" | "createdAt";
type SortDir = "asc" | "desc";

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

interface Props { projects: any[] }

export function ListView({ projects }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: number; currentStatus: string } | null>(null);
  const [statusReport, setStatusReport] = useState<{ project: any } | null>(null);
  const [reportText, setReportText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);

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
    // Optimistic update
    queryClient.setQueryData(["/api/projects"], (old: any[]) => {
      if (!old) return old;
      return old.map(p => p.id === projectId ? { ...p, status: newStatus } : p);
    });
    updateMutation.mutate({ id: projectId, data: { status: newStatus } as any }, {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Failed to update status", variant: "destructive" });
      },
    });
    setContextMenu(null);
  };

  const handleDelete = (e: React.MouseEvent, project: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) return;
    // Optimistic update
    queryClient.setQueryData(["/api/projects"], (old: any[]) => {
      if (!old) return old;
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

  // @ mention handling
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

  const filteredMentions = mentionQuery !== null
    ? (users as any[]).filter((u: any) => u.name.toLowerCase().includes(mentionQuery))
    : [];

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

  const submitReport = () => {
    if (!reportText.trim() || !statusReport) return;
    toast({ title: "Status report added", description: `Report for "${statusReport.project.name}" saved.` });
    setReportText("");
    setStatusReport(null);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const Th = ({ k, label, cls = "" }: { k: SortKey; label: string; cls?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors ${isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground"} ${cls}`}
      onClick={() => handleSort(k)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <SortIcon k={k} />
      </div>
    </th>
  );

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-gray-200 shadow-sm" : "glass-card border-white/10")}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={cn("border-b", isLight ? "border-gray-200 bg-gray-50" : "border-white/10")} style={isLight ? {} : { background: "rgba(255,255,255,0.03)" }}>
                  <Th k="name" label="Name" />
                  <Th k="productType" label="Type" cls="hidden md:table-cell" />
                  <Th k="customerName" label="Customer" cls="hidden lg:table-cell" />
                  <Th k="stage" label="Stage" cls="hidden sm:table-cell" />
                  <Th k="progress" label="Progress" />
                  <Th k="status" label="Status" />
                  <Th k="targetDate" label="Due Date" cls="hidden xl:table-cell" />
                  <Th k="createdAt" label="Date Added" cls="hidden xl:table-cell" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0;
                  const statusColor = isLight
                    ? STATUS_COLORS_LIGHT[p.status] || "bg-gray-100 text-gray-700 border-gray-200"
                    : STATUS_COLORS[p.status] || "bg-white/5 text-muted-foreground border-white/10";
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.025 }}
                      onContextMenu={(e) => handleRightClick(e, p)}
                      className={cn("border-b transition-colors group cursor-context-menu", isLight ? "border-gray-100 hover:bg-gray-50" : "border-white/5 hover:bg-white/[0.03]")}
                    >
                      <td className="px-4 py-3.5">
                        <Link href={`/projects/${p.id}`}>
                          <p className={cn("text-sm font-semibold group-hover:text-primary transition-colors line-clamp-1", isLight ? "text-gray-900" : "text-foreground")}>{p.name}</p>
                          {p.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className={cn("text-xs", isLight ? "text-gray-600" : "text-muted-foreground")}>{p.productType || "—"}</span>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <div>
                          <p className={cn("text-xs", isLight ? "text-gray-900" : "text-foreground")}>{p.customerName || "—"}</p>
                          {p.customerEmail && <p className="text-[10px] text-muted-foreground">{p.customerEmail}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={cn("text-xs capitalize", isLight ? "text-gray-600" : "text-muted-foreground")}>{p.stage.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-16 h-1.5 rounded-full overflow-hidden shrink-0", isLight ? "bg-gray-200" : "bg-black/30")}>
                            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7c3aed, #3b82f6)" }} />
                          </div>
                          <span className={cn("text-xs w-8", isLight ? "text-gray-900" : "text-foreground")}>{progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${statusColor}`}>
                          {p.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        <span className={cn("text-xs", isLight ? "text-gray-600" : "text-muted-foreground")}>
                          {p.targetDate ? format(new Date(p.targetDate), "MMM d, yyyy") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        <span className={cn("text-xs", isLight ? "text-gray-600" : "text-muted-foreground")}>
                          {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}
                        </span>
                      </td>
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
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {sorted.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No projects to display.</div>
            )}
          </div>

          {sorted.length > 0 && (
            <div className={cn("px-4 py-2.5 border-t flex items-center justify-between", isLight ? "border-gray-100 bg-gray-50" : "border-white/5")} style={isLight ? {} : { background: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs text-muted-foreground">{sorted.length} project{sorted.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">Right-click a row to change status · Click headers to sort</p>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setStatusReport(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={cn("w-full max-w-lg rounded-2xl border shadow-2xl", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}
            >
              <div className={cn("flex items-center justify-between p-4 border-b", isLight ? "border-gray-100" : "border-white/10")}>
                <div>
                  <h3 className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Status Report</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{statusReport.project.name}</p>
                </div>
                <button onClick={() => setStatusReport(null)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-4 space-y-3 relative">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={reportText}
                    onChange={handleReportInput}
                    placeholder="Write a status update... Use @ to mention team members"
                    rows={4}
                    className={cn("w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none", isLight ? "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground")}
                  />

                  {/* @ Mention Dropdown */}
                  <AnimatePresence>
                    {mentionQuery !== null && filteredMentions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className={cn("absolute left-0 right-0 bottom-full mb-1 rounded-xl border shadow-xl overflow-hidden z-10", isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}
                      >
                        {filteredMentions.map((u: any, idx: number) => (
                          <button
                            key={u.id}
                            onClick={() => insertMention(u)}
                            className={cn("w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors", idx === mentionIndex ? isLight ? "bg-purple-50 text-purple-700" : "bg-primary/10 text-primary" : isLight ? "text-gray-700 hover:bg-gray-50" : "text-foreground hover:bg-white/5")}
                          >
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                              {u.name[0]}
                            </div>
                            {u.name}
                            <span className="text-xs text-muted-foreground ml-auto">{u.role}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => setStatusReport(null)} className={cn("px-4 py-2 rounded-xl text-sm transition-colors", isLight ? "text-gray-600 hover:bg-gray-100" : "text-muted-foreground hover:bg-white/5")}>
                    Cancel
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={!reportText.trim()}
                    className="px-4 py-2 rounded-xl text-sm bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Report
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}