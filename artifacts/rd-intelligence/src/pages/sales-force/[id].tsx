import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@/components/dnd-stub";
import type { DropResult } from "@/components/dnd-stub";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, ZAxis, Cell, Legend
} from "recharts";
import {
  ArrowLeft, Star, Edit3, Save, X, Plus, Trash2, ChevronDown, Calendar,
  DollarSign, Package, Maximize2, Minimize2, Download, CheckCircle2,
  Clock, AlertCircle, RotateCcw, GripVertical, MessageSquare, User
} from "lucide-react";
import { useListUsers, useGetCurrentUser } from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL;

const PRODUCT_TYPES: Record<string, string> = {
  seasoning: "Seasoning", snacks_dusting: "Snacks Dusting", dairy_premix: "Dairy Premix",
  bakery_dough_premix: "Bakery & Dough Premix", sweet_flavours: "Sweet Flavours", savoury_flavour: "Savoury Flavour",
};
const URGENCY: Record<string, { label: string; color: string; dot: string }> = {
  urgent: { label: "Urgent", color: "text-red-400", dot: "bg-red-500" },
  medium: { label: "Medium", color: "text-yellow-400", dot: "bg-yellow-500" },
  normal: { label: "Normal", color: "text-green-400", dot: "bg-green-500" },
};
const APPROVAL_OPTIONS = [
  { value: "approved", label: "Approved", dot: "bg-green-500", text: "text-green-400" },
  { value: "not_yet_approved", label: "Not Yet Approved", dot: "bg-yellow-500", text: "text-yellow-400" },
  { value: "cancelled", label: "Cancelled", dot: "bg-red-500", text: "text-red-400" },
];
const TASK_COLS = [
  { id: "todo", label: "To Do", icon: Clock, color: "text-slate-400", bg: "bg-slate-500/10" },
  { id: "in_progress", label: "In Progress", icon: RotateCcw, color: "text-blue-400", bg: "bg-blue-500/10" },
  { id: "review", label: "Review", icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { id: "done", label: "Done", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
];
const TEMPLATE_TASKS = [
  "Request (Or sample) Received", "Sample in Development", "Sample Sent (with COA & TDS)",
  "Customer Trial Feedback", "Commercial Approval", "PFI raised",
  "Align with Procurement", "Commercial Production",
];

function calcPriority(account: any) {
  const vol = parseFloat(account?.volume) || 0;
  let volPts = 1;
  if (vol >= 10000) volPts = 4;
  else if (vol >= 1000) volPts = 3;
  else if (vol >= 500) volPts = 2;
  const urgPts = account?.urgencyLevel === "urgent" ? 2 : 1;
  const custPts = account?.customerType === "existing" ? 3 : 2;
  const score = Math.min(10, volPts + urgPts + custPts);
  return { score, breakdown: [{ label: "Volume", pts: volPts }, { label: "Urgency", pts: urgPts }, { label: "Customer", pts: custPts }] };
}

const iCls = "w-full h-9 rounded-xl border border-white/10 bg-black/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground";
const lCls = "text-xs font-medium text-muted-foreground mb-1 block";

function useApiCall() {
  const token = localStorage.getItem("rd_token");
  return useCallback((url: string, options?: RequestInit) => fetch(`${BASE}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  }), [token]);
}

function EditableField({ value, onSave, multiline, prefix, suffix }: { value: string; onSave: (v: string) => void; multiline?: boolean; prefix?: string; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const doSave = () => { onSave(val); setEditing(false); };
  if (!editing) return (
    <button onClick={() => setEditing(true)} className="group flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors">
      {prefix}{val || <span className="text-muted-foreground italic text-xs">—</span>}{suffix}
      <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-60" />
    </button>
  );
  return multiline ? (
    <div className="flex gap-1">
      <textarea value={val} onChange={e => setVal(e.target.value)} autoFocus className={iCls + " h-16 resize-none"} />
      <div className="flex flex-col gap-1">
        <button onClick={doSave} className="p-1 bg-green-500/10 text-green-400 rounded-lg"><Save className="w-3.5 h-3.5" /></button>
        <button onClick={() => setEditing(false)} className="p-1 bg-white/5 text-muted-foreground rounded-lg"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  ) : (
    <div className="flex gap-1">
      <input value={val} onChange={e => setVal(e.target.value)} autoFocus className={iCls} onKeyDown={e => { if (e.key === "Enter") doSave(); if (e.key === "Escape") setEditing(false); }} />
      <button onClick={doSave} className="p-1.5 bg-green-500/10 text-green-400 rounded-lg"><Save className="w-3.5 h-3.5" /></button>
      <button onClick={() => setEditing(false)} className="p-1.5 bg-white/5 text-muted-foreground rounded-lg"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function TaskCard({ task, onUpdate, onDelete, users }: { task: any; onUpdate: (id: number, data: any) => void; onDelete: (id: number) => void; users: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({ title: task.title, description: task.description || "", assigneeId: task.assigneeId || "", startDate: task.startDate || "", dueDate: task.dueDate || "" });
  const save = () => onUpdate(task.id, form);
  const assignee = users.find((u: any) => u.id === task.assigneeId);
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <div className={cn("rounded-xl p-3 group border", isLight ? "bg-white border-gray-200 shadow-sm" : "bg-black/30 border-white/10")}>
      <div className="flex items-start gap-2">
        <GripVertical className={cn("w-4 h-4 mt-0.5 shrink-0 cursor-grab", isLight ? "text-gray-400" : "text-muted-foreground/40")} />
        <div className="flex-1 min-w-0">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} onBlur={save}
            className={cn("w-full bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1", isLight ? "text-gray-900" : "text-foreground")} />
          {assignee && <p className={cn("text-[10px] mt-0.5", isLight ? "text-gray-500" : "text-muted-foreground")}>{assignee.name}</p>}
          {(form.startDate || form.dueDate) && (
            <p className={cn("text-[10px] mt-0.5", isLight ? "text-gray-500" : "text-muted-foreground")}>
              {form.startDate && `From ${form.startDate}`}{form.startDate && form.dueDate && " · "}{form.dueDate && `Due ${form.dueDate}`}
            </p>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setExpanded(e => !e)} className={cn("p-1 rounded", isLight ? "hover:bg-gray-100 text-gray-500 hover:text-gray-900" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}>
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
          <button onClick={() => onDelete(task.id)} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3 space-y-2">
            <div>
              <label className={cn("text-[10px] uppercase", isLight ? "text-gray-500" : "text-muted-foreground")}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} onBlur={save}
                rows={2} className={cn("w-full text-xs rounded-lg p-2 focus:outline-none resize-none mt-1 placeholder:text-muted-foreground border", isLight ? "bg-gray-50 border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")} placeholder="Add description…" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={cn("text-[10px] uppercase", isLight ? "text-gray-500" : "text-muted-foreground")}>Assignee</label>
                <select value={form.assigneeId} onChange={e => { setForm(f => ({ ...f, assigneeId: e.target.value })); setTimeout(save, 0); }}
                  className={cn("w-full mt-1 h-7 text-xs rounded-lg px-2 focus:outline-none border", isLight ? "bg-gray-50 border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")}>
                  <option value="">None</option>
                  {users.map((u: any) => <option key={u.id} value={u.id} className={isLight ? "bg-white text-black" : "bg-card"}>{u.name}</option>)}
                </select>
              </div>
              <div />
              <div>
                <label className={cn("text-[10px] uppercase", isLight ? "text-gray-500" : "text-muted-foreground")}>Start Date</label>
                <input type="date" value={form.startDate} onChange={e => { setForm(f => ({ ...f, startDate: e.target.value })); setTimeout(save, 0); }}
                  className={cn("w-full mt-1 h-7 text-xs rounded-lg px-2 focus:outline-none border", isLight ? "bg-gray-50 border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")} />
              </div>
              <div>
                <label className={cn("text-[10px] uppercase", isLight ? "text-gray-500" : "text-muted-foreground")}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => { setForm(f => ({ ...f, dueDate: e.target.value })); setTimeout(save, 0); }}
                  className={cn("w-full mt-1 h-7 text-xs rounded-lg px-2 focus:outline-none border", isLight ? "bg-gray-50 border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KanbanBoard({ accountId, account }: { accountId: number; account: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users = [] } = useListUsers();
  const api = useApiCall();
  const { fmtNGN } = useExchangeRate();
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [revenueView, setRevenueView] = useState<"monthly" | "yearly">("monthly");
  const [approval, setApproval] = useState(account?.approvalStatus || "not_yet_approved");
  const [showApprovalDrop, setShowApprovalDrop] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: [`/api/accounts/${accountId}/tasks`],
    queryFn: async () => {
      const res = await api(`api/accounts/${accountId}/tasks`);
      return res.json();
    },
  });

  const taskArr = tasks as any[];
  const byStatus = (status: string) => taskArr.filter(t => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder);
  const allDone = taskArr.length > 0 && taskArr.every(t => t.status === "done");

  const monthlyRevenue = parseFloat(account?.sellingPrice || 0) * parseFloat(account?.volume || 0);
  const yearlyRevenue = monthlyRevenue * 12;

  const saveApproval = async (val: string) => {
    setApproval(val);
    setShowApprovalDrop(false);
    await api(`api/accounts/${accountId}`, { method: "PUT", body: JSON.stringify({ ...account, approvalStatus: val }) });
    queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}`] });
  };

  const addTask = async (status: string) => {
    if (!newTitle.trim()) return;
    const existing = taskArr.filter(t => t.status === status);
    await api(`api/accounts/${accountId}/tasks`, { method: "POST", body: JSON.stringify({ title: newTitle, status, sortOrder: existing.length }) });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/tasks`] });
    setNewTitle(""); setAddingIn(null);
  };

  const updateTask = async (taskId: number, data: any) => {
  api(`api/accounts/${accountId}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) });
};

  const deleteTask = async (taskId: number) => {
    await api(`api/accounts/${accountId}/tasks/${taskId}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/tasks`] });
  };

  const templateLoaded = TEMPLATE_TASKS.every(t => taskArr.some(tk => tk.title === t));
  const someTemplatePresent = TEMPLATE_TASKS.some(t => taskArr.some(tk => tk.title === t));

  const addTemplateTasks = async () => {
    if (templateLoaded || someTemplatePresent) {
      const toDelete = taskArr.filter(tk => TEMPLATE_TASKS.includes(tk.title));
      for (const tk of toDelete) {
        await api(`api/accounts/${accountId}/tasks/${tk.id}`, { method: "DELETE" });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/tasks`] });
      toast({ title: "Template tasks removed" });
    } else {
      for (let i = 0; i < TEMPLATE_TASKS.length; i++) {
        await api(`api/accounts/${accountId}/tasks`, { method: "POST", body: JSON.stringify({ title: TEMPLATE_TASKS[i], status: "todo", sortOrder: taskArr.length + i }) });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/tasks`] });
      toast({ title: "Template tasks added" });
    }
  };

 const onDragEnd = (result: DropResult) => {
  if (!result.destination) return;
  const { draggableId, source, destination } = result;
  const taskId = parseInt(draggableId);
  const task = taskArr.find(t => t.id === taskId);
  if (!task) return;
  const newStatus = destination.droppableId;

  // Optimistic update — update UI instantly
  queryClient.setQueryData(
    [`/api/accounts/${accountId}/tasks`],
    (old: any[]) => {
      if (!old) return old;
      return old.map(t =>
        t.id === taskId
          ? { ...t, status: newStatus, sortOrder: destination.index }
          : t
      );
    }
  );

  // Sync with server in background
  updateTask(taskId, { ...task, status: newStatus, sortOrder: destination.index });
};

  const approvalInfo = APPROVAL_OPTIONS.find(a => a.value === approval) || APPROVAL_OPTIONS[1];
  const { score, breakdown } = calcPriority(account);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setShowApprovalDrop(d => !d)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all bg-black border-white/20 hover:bg-zinc-900">
              <span className={cn("w-2.5 h-2.5 rounded-full", approvalInfo.dot)} />
              <span className={approvalInfo.text}>{approvalInfo.label}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            <AnimatePresence>
              {showApprovalDrop && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute top-full left-0 mt-1 glass-panel border border-white/10 rounded-xl overflow-hidden z-20 shadow-xl min-w-[180px]">
                  {APPROVAL_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => saveApproval(opt.value)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-xs text-left">
                      <span className={cn("w-2.5 h-2.5 rounded-full", opt.dot)} />
                      <span className={opt.text}>{opt.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={addTemplateTasks} title={someTemplatePresent ? "Remove template tasks" : "Load template tasks"}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-colors",
              someTemplatePresent
                ? "border-amber-500/40 bg-black text-amber-300 hover:bg-zinc-900 hover:border-red-500/40 hover:text-red-400"
                : "border-amber-500/40 bg-black text-amber-400 hover:bg-zinc-900"
            )}>
            {someTemplatePresent ? "✓ Template Loaded (click to remove)" : "⭐ Load Template"}
          </button>
        </div>

        <div className="glass-card rounded-xl p-3 border border-white/5 flex items-center gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Revenue Generated</p>
            <div className="flex items-center gap-2 mt-0.5">
              {(["monthly", "yearly"] as const).map(v => (
                <button key={v} onClick={() => setRevenueView(v)}
                  className={cn("text-xs px-2 py-0.5 rounded-lg transition-all", revenueView === v ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}>
                  {v === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            {allDone ? (
              <>
                <p className="text-xl font-bold text-emerald-400">${(revenueView === "monthly" ? monthlyRevenue : yearlyRevenue).toLocaleString()}</p>
                <p className="text-[10px] text-emerald-400/60">{fmtNGN(revenueView === "monthly" ? monthlyRevenue : yearlyRevenue)}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Complete all tasks to unlock</p>
            )}
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TASK_COLS.map(col => {
            const colTasks = byStatus(col.id);
            const ColIcon = col.icon;
            return (
              <div key={col.id} className="glass-card rounded-xl p-3 border border-white/5">
                <div className={cn("flex items-center gap-2 mb-3 px-1 py-1.5 rounded-lg", col.bg)}>
                  <ColIcon className={cn("w-4 h-4", col.color)} />
                  <span className={cn("text-xs font-semibold", col.color)}>{col.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{colTasks.length}</span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={cn("space-y-2 min-h-[60px] rounded-xl transition-colors", snapshot.isDraggingOver && "bg-primary/5")}>
                      {colTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                          {(prov) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                              <TaskCard task={task} onUpdate={updateTask} onDelete={deleteTask} users={users as any[]} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
                {addingIn === col.id ? (
                  <div className="mt-2 space-y-1.5">
                    <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title…" className={iCls + " text-xs h-8"}
                      onKeyDown={e => { if (e.key === "Enter") addTask(col.id); if (e.key === "Escape") { setAddingIn(null); setNewTitle(""); } }} />
                    <div className="flex gap-1">
                      <button onClick={() => addTask(col.id)} className="flex-1 py-1 bg-primary text-white rounded-lg text-xs font-medium">Add</button>
                      <button onClick={() => { setAddingIn(null); setNewTitle(""); }} className="px-3 py-1 border border-white/10 text-muted-foreground rounded-lg text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingIn(col.id)} className="mt-2 w-full flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}

function renderWithMentions(content: string) {
  const parts = content.split(/(@\w[\w\s]*(?:\s\w+)?)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-primary font-semibold">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function StatusReportTab({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const { data: allUsers = [] } = useListUsers();
  const api = useApiCall();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: reports = [] } = useQuery({
    queryKey: [`/api/accounts/${accountId}/status-reports`],
    queryFn: async () => { const res = await api(`api/accounts/${accountId}/status-reports`); return res.json(); },
  });

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(before.lastIndexOf("@"));
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (user: any) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery || "").length);
    const newText = `${before}@${user.name}${after}`;
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = mentionStart + user.name.length + 1;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
      }
    }, 10);
  };

  const filteredMentionUsers = (allUsers as any[]).filter(u =>
    mentionQuery !== null && u.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    await api(`api/accounts/${accountId}/status-reports`, {
      method: "POST",
      body: JSON.stringify({ content: text, authorName: (currentUser as any)?.name || "Unknown" }),
    });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/status-reports`] });
    setText("");
    setSending(false);
  };

  const del = async (id: number) => {
    await api(`api/accounts/${accountId}/status-reports/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/status-reports`] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="space-y-3">
        {(reports as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <MessageSquare className="w-10 h-10 opacity-20" />
            <p className="text-sm">No status reports yet.</p>
          </div>
        ) : (
          (reports as any[]).map((r: any) => (
            <div key={r.id} className="glass-card rounded-xl p-4 border border-white/5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{r.authorName || "Unknown"}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <button onClick={() => del(r.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm text-foreground mt-3 whitespace-pre-wrap leading-relaxed">
                {renderWithMentions(r.content)}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="glass-card rounded-xl p-4 border border-white/5 relative">
        <p className="text-[10px] text-muted-foreground mb-2">Tip: Type <span className="text-primary font-mono">@name</span> to mention a team member</p>
        <div className="relative">
          <textarea ref={textareaRef} value={text} onChange={handleTextChange} rows={3}
            placeholder="Write a status report… Use @name to mention someone"
            onKeyDown={e => {
              if (e.key === "Escape") setMentionQuery(null);
            }}
            className="w-full bg-transparent text-sm text-foreground focus:outline-none resize-none placeholder:text-muted-foreground" />
          <AnimatePresence>
            {mentionQuery !== null && filteredMentionUsers.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute bottom-full left-0 mb-1 glass-panel border border-white/10 rounded-xl overflow-hidden shadow-xl z-30 min-w-[200px]">
                {filteredMentionUsers.map((u: any) => (
                  <button key={u.id} onMouseDown={e => { e.preventDefault(); insertMention(u); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left">
                    <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{u.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{u.role?.replace(/_/g, ' ')}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex justify-end mt-2">
          <button onClick={send} disabled={!text.trim() || sending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
            {sending ? "Sending…" : "Post Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductionOrdersTab({ accountId }: { accountId: number }) {
  console.log('ProductionOrdersTab component mounted with accountId:', accountId);

  const queryClient = useQueryClient();
  const api = useApiCall();
  const { toast } = useToast();
  const [chartFull, setChartFull] = useState<string | null>(null);
  const [chartType, setChartType] = useState<Record<string, string>>({});
  const leftRef = useRef<HTMLDivElement>(null);
  const [leftW, setLeftW] = useState(50);
  const [sortCol, setSortCol] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ngnRate, setNgnRate] = useState<number | null>(null);
  const [manualNgnRate, setManualNgnRate] = useState("");
  const [showRateInput, setShowRateInput] = useState(false);

  useEffect(() => {
    // Fetch exchange rate with proper error handling
    fetch("https://api.exchangerate-api.com/v4/latest/USD", {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (d?.rates?.NGN) {
          console.log('Exchange rate loaded:', d.rates.NGN);
          setNgnRate(d.rates.NGN);
        }
      })
      .catch(err => {
        console.warn('Failed to load exchange rate:', err);
        // Set a fallback rate
        setNgnRate(1650); // Common USD to NGN rate
      });
  }, []);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: [`/api/accounts/${accountId}/production-orders`],
    queryFn: async () => {
      console.log('Fetching production orders for account:', accountId);
      const res = await api(`api/accounts/${accountId}/production-orders`);
      console.log('API response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API error:', errorText);
        throw new Error(`API error: ${res.status} ${errorText}`);
      }
      const data = await res.json();
      console.log('Production orders data:', data);
      return data;
    },
  });

  console.log('ProductionOrdersTab render:', { orders, isLoading, error, accountId });

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">Loading production orders…</div>;
  if (error) return <div className="flex items-center justify-center h-40 text-red-400">Error loading production orders: {error.message}</div>;

  const ords = orders as any[];

  const reseedForecasts = () => {
    api("api/forecasts/seed", { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/forecasts"] }))
      .catch(() => {});
  };

  const addRow = async () => {
    await api(`api/accounts/${accountId}/production-orders`, { method: "POST", body: JSON.stringify({ price: "", volume: "", dateOrdered: "", expectedDeliveryDate: "", dateDelivered: "" }) });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/production-orders`] });
    reseedForecasts();
  };

  const updateRow = async (id: number, data: any) => {
    await api(`api/accounts/${accountId}/production-orders/${id}`, { method: "PUT", body: JSON.stringify(data) });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/production-orders`] });
    reseedForecasts();
  };

  const deleteRow = async (id: number) => {
    await api(`api/accounts/${accountId}/production-orders/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/production-orders`] });
    reseedForecasts();
  };

  const exportTable = () => {
    const data = sortedOrds.map(o => ({
      "Price ($/kg)": o.price, "Volume (kg)": o.volume, "Date Ordered": o.dateOrdered,
      "Expected Delivery": o.expectedDeliveryDate || "",
      "Date Delivered": o.dateDelivered, "Income ($)": (parseFloat(o.price || 0) * parseFloat(o.volume || 0)).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Production Orders");
    XLSX.writeFile(wb, `production_orders_${accountId}.xlsx`);
  };

  const parseDMY = (s: string) => {
    if (!s || !s.includes("/")) return "";
    const parts = s.split("/");
    if (parts.length !== 3) return s;
    const [d, m, y] = parts;
    return `${y || "0000"}-${(m || "00").padStart(2, "0")}-${(d || "00").padStart(2, "0")}`;
  };
  const ordersByDate = [...ords].sort((a, b) => parseDMY(a.dateOrdered || "").localeCompare(parseDMY(b.dateOrdered || "")));
  const revenueByDate = ordersByDate.map(o => ({ date: o.dateOrdered || "—", income: parseFloat(o.price || 0) * parseFloat(o.volume || 0) }));
  const orderFreqData = ordersByDate.map(o => ({
    date: o.dateOrdered || "—",
    volume: parseFloat(o.volume || 0),
    price: parseFloat(o.price || 0),
  }));
  const totalIncome = ords.reduce((sum, o) => sum + parseFloat(o.price || 0) * parseFloat(o.volume || 0), 0);
  const effectiveRate = manualNgnRate ? parseFloat(manualNgnRate) : ngnRate;
  const totalNgn = effectiveRate ? totalIncome * effectiveRate : null;

  const sortedOrds = [...ords].sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === "income") {
        av = parseFloat(a.price || 0) * parseFloat(a.volume || 0);
        bv = parseFloat(b.price || 0) * parseFloat(b.volume || 0);
      } else if (sortCol === "id") {
        av = a.id; bv = b.id;
      } else {
        av = a[sortCol] || ""; bv = b[sortCol] || "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }
  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };
  const leadTimes = ords.filter(o => o.dateOrdered && o.dateDelivered).map(o => {
    const days = Math.round((new Date(o.dateDelivered.split("/").reverse().join("-")).getTime() - new Date(o.dateOrdered.split("/").reverse().join("-")).getTime()) / 86400000);
    return { label: `${o.dateOrdered}`, days };
  });

  const deliveryCompareData = ords
  .filter(o => o.dateOrdered && (o.expectedDeliveryDate || o.dateDelivered))
  .map(o => ({
    date: o.dateOrdered,
    expected: o.expectedDeliveryDate ? Math.round((new Date(parseDMY(o.expectedDeliveryDate)).getTime() - new Date(parseDMY(o.dateOrdered)).getTime()) / 86400000) : null,
    actual: o.dateDelivered ? Math.round((new Date(parseDMY(o.dateDelivered)).getTime() - new Date(parseDMY(o.dateOrdered)).getTime()) / 86400000) : null,
  }));

  const incomeByMonth = ords.reduce((acc: any[], o) => {
    const month = o.dateOrdered ? o.dateOrdered.slice(3, 10) : "Unknown";
    const existing = acc.find(x => x.month === month);
    const inc = parseFloat(o.price || 0) * parseFloat(o.volume || 0);
    if (existing) existing.income += inc;
    else acc.push({ month, income: inc });
    return acc;
  }, []);

  const { theme: _idTheme } = useTheme();
  const isLightTab = _idTheme === "light";
  const axisColor = isLightTab ? "#374151" : "#64748b";
  const gridStroke = isLightTab ? "#E5E7EB" : "rgba(255,255,255,0.05)";
  const tooltipCfg = { background: isLightTab ? "#FFFFFF" : "#1e1e2e", border: isLightTab ? "1px solid #E5E7EB" : "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: isLightTab ? "#111827" : undefined };
  const CHART_CFG = [
    { id: "income_by_month", title: "Income by Month" },
    { id: "revenue_trend", title: "Revenue Trend Over Time" },
    { id: "lead_time", title: "Average Delivery Lead Time" },
    { id: "price_volume", title: "Price vs Volume" },
    { id: "order_frequency", title: "Order Frequency" },
    { id: "delivery_compare", title: "Delivery Comparison" },
  ];

  const PriceVolumeTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    const price = Number(d?.x || 0);
    const volume = Number(d?.y || 0);
    const income = price * volume;
    return (
      <div style={{ background: tooltipCfg.background, border: tooltipCfg.border, borderRadius: tooltipCfg.borderRadius, padding: "8px 12px", fontSize: 12, color: tooltipCfg.color || "#e2e8f0" }}>
        <p style={{ marginBottom: 4 }}><span style={{ color: "#a78bfa", fontWeight: 600 }}>Price ($/KG):</span> {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p style={{ marginBottom: 4 }}><span style={{ color: "#38bdf8", fontWeight: 600 }}>Volume (kg):</span> {volume.toLocaleString()}</p>
        <p><span style={{ color: "#34d399", fontWeight: 600 }}>Income:</span> ${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
    );
  };

  const OrderFreqTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{ background: tooltipCfg.background, border: tooltipCfg.border, borderRadius: tooltipCfg.borderRadius, padding: "8px 12px", fontSize: 12, color: tooltipCfg.color || "#e2e8f0" }}>
        <p style={{ marginBottom: 4 }}><span style={{ color: "#38bdf8", fontWeight: 600 }}>Volume:</span> {Number(d?.volume || 0).toLocaleString()} kg</p>
        <p><span style={{ color: "#34d399", fontWeight: 600 }}>Price:</span> ${Number(d?.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</p>
      </div>
    );
  };

  const renderChart = (id: string, height: number) => {
    if (id === "revenue_trend") return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={revenueByDate}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 10 }} /><YAxis tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={v => `$${v}`} /><Tooltip contentStyle={tooltipCfg} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Income"]} /><Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} /></LineChart>
      </ResponsiveContainer>
    );
    if (id === "lead_time") return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={leadTimes}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} /><YAxis tick={{ fill: axisColor, fontSize: 11 }} unit=" d" /><Tooltip contentStyle={tooltipCfg} formatter={(v: any) => [`${v} days`, "Lead Time"]} /><Bar dataKey="days" fill="#f59e0b" radius={[4, 4, 0, 0]} /></BarChart>
      </ResponsiveContainer>
    );
    if (id === "price_volume") return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="x" name="Price" tick={{ fill: axisColor, fontSize: 11 }} label={{ value: "Price ($/kg)", position: "insideBottom", fill: axisColor, fontSize: 11 }} />
          <YAxis dataKey="y" name="Volume" tick={{ fill: axisColor, fontSize: 11 }} />
          <ZAxis dataKey="z" range={[40, 400]} />
          <Tooltip content={<PriceVolumeTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={ords.map(o => ({ x: parseFloat(o.price || 0), y: parseFloat(o.volume || 0), z: parseFloat(o.price || 0) * parseFloat(o.volume || 0) }))} fill="#8b5cf6" fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    );
    if (id === "income_by_month") return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={incomeByMonth}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 10 }} /><YAxis tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} /><Tooltip contentStyle={tooltipCfg} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Income"]} /><Bar dataKey="income" fill="#06b6d4" radius={[4, 4, 0, 0]} /></BarChart>
      </ResponsiveContainer>
    );
    if (id === "order_frequency") return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={orderFreqData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 10 }} />
          <YAxis dataKey="volume" tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={v => `${Number(v).toLocaleString()} kg`} width={70} />
          <Tooltip content={<OrderFreqTooltip />} />
          <Line type="monotone" dataKey="volume" stroke="#f472b6" strokeWidth={2} dot={{ fill: "#f472b6", r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    );
        if (id === "delivery_compare") return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={deliveryCompareData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 10 }} />
          <YAxis tick={{ fill: axisColor, fontSize: 11 }} unit=" d" />
          <Tooltip contentStyle={tooltipCfg} formatter={(v: any, name: string) => [`${v} days`, name === "expected" ? "Expected" : "Actual"]} />
          <Legend />
          <Bar dataKey="expected" name="Expected" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
    return null;
  };

  return (
  <div className="flex gap-4 h-full" style={{ minHeight: 600 }}>
    <div style={{ width: `${leftW}%` }} className="flex flex-col gap-3 min-w-0">
      {/* Total Income — moved to top */}
      <div className="glass-card rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Total Income</p>
            <p className="text-2xl font-bold text-emerald-400">
              ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {totalNgn && <p className="text-sm text-amber-400 mt-0.5">≈ ₦{totalNgn.toLocaleString(undefined, { maximumFractionDigits: 0 })} NGN</p>}
            {ords.length > 0 && <p className="text-xs text-muted-foreground mt-1">Across {ords.length} order{ords.length !== 1 ? "s" : ""}</p>}
          </div>
          <button onClick={() => setShowRateInput(r => !r)} className="text-xs text-primary hover:underline shrink-0">Set Rate</button>
        </div>
        {showRateInput && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
            <span className="text-xs text-muted-foreground">$1 =</span>
            <input type="number" value={manualNgnRate} onChange={e => setManualNgnRate(e.target.value)}
              placeholder={ngnRate ? `Live: ${ngnRate.toLocaleString()}` : "e.g. 1650"}
              className="flex-1 h-7 rounded-lg border border-white/10 bg-black/20 px-2 text-xs focus:outline-none text-foreground" />
            <span className="text-xs text-muted-foreground">NGN</span>
            {manualNgnRate && <button onClick={() => setManualNgnRate("")} className="text-xs text-red-400">Clear</button>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Production Orders</p>
        <button onClick={exportTable} className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>
      <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5 border-b border-white/5">
                  <tr>
                    {[
                      { col: "price", label: "Price ($/kg)" },
                      { col: "volume", label: "Volume (kg)" },
                      { col: "dateOrdered", label: "Date Ordered" },
                      { col: "expectedDeliveryDate", label: "Expected Delivery" },
                      { col: "dateDelivered", label: "Date Delivered" },
                      { col: "income", label: "Income" },
                    ].map(({ col, label }) => (
                      <th key={col} onClick={() => toggleSort(col)}
                        className="px-3 py-2.5 text-left text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors select-none">
                        {label}<SortIcon col={col} />
                      </th>
                    ))}
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedOrds.map((o: any) => (
                  <tr key={o.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <input type="number" defaultValue={parseFloat(o.price || 0).toFixed(2)} onBlur={e => updateRow(o.id, { ...o, price: e.target.value })}
                        className="w-20 bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 h-7" step="0.01" min="0" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" defaultValue={o.volume} onBlur={e => updateRow(o.id, { ...o, volume: e.target.value })}
                        className="w-20 bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 h-7" step="0.01" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" placeholder="dd/mm/yyyy" defaultValue={o.dateOrdered} onBlur={e => updateRow(o.id, { ...o, dateOrdered: e.target.value })}
                        className="w-28 bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 h-7 placeholder:text-muted-foreground/40" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" placeholder="dd/mm/yyyy" defaultValue={o.expectedDeliveryDate} onBlur={e => updateRow(o.id, { ...o, expectedDeliveryDate: e.target.value })}
                        className="w-28 bg-transparent text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30 rounded px-1 h-7 placeholder:text-muted-foreground/40" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" placeholder="dd/mm/yyyy" defaultValue={o.dateDelivered} onBlur={e => updateRow(o.id, { ...o, dateDelivered: e.target.value })}
                        className="w-28 bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 h-7 placeholder:text-muted-foreground/40" />
                    </td>
                    <td className="px-3 py-2 text-emerald-400 font-medium">
                      ${(parseFloat(o.price || 0) * parseFloat(o.volume || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => deleteRow(o.id)} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addRow} className="w-full flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors border-t border-white/5">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
        </div>

      </div>

      <div className="w-1 bg-white/10 hover:bg-primary/40 cursor-col-resize rounded-full transition-colors" onMouseDown={e => {
        const startX = e.clientX;
        const startW = leftW;
        const onMove = (ev: MouseEvent) => {
          const delta = ((ev.clientX - startX) / window.innerWidth) * 100;
          setLeftW(Math.min(70, Math.max(30, startW + delta)));
        };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      }} />

      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto custom-scrollbar">
        {CHART_CFG.map(cfg => (
          <div key={cfg.id} className="glass-card rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground">{cfg.title}</p>
              <button onClick={() => setChartFull(cfg.id)} className="p-1 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground"><Maximize2 className="w-3.5 h-3.5" /></button>
            </div>
            <div style={{ height: 160 }}>{renderChart(cfg.id, 160)}</div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {chartFull && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">{CHART_CFG.find(c => c.id === chartFull)?.title}</h2>
              <button onClick={() => setChartFull(null)} className="p-2 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1">{renderChart(chartFull, 600)}</div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountInfoTab({ account, accountId }: { account: any; accountId: number }) {
  const queryClient = useQueryClient();
  const api = useApiCall();
  const { toast } = useToast();
  const { data: users = [] } = useListUsers();
  const { fmtNGN } = useExchangeRate();
  const [manSearch, setManSearch] = useState("");
  const [form, setForm] = useState<any>(account);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setForm(account); }, [account]);
  const setF = (k: string, v: any) => { setForm((f: any) => ({ ...f, [k]: v })); setDirty(true); };

  const toggleManager = (id: number) => {
    const mgrs = form.accountManagers || [];
    setF("accountManagers", mgrs.includes(id) ? mgrs.filter((x: number) => x !== id) : [...mgrs, id]);
  };

  const save = async () => {
    await api(`api/accounts/${accountId}`, { method: "PUT", body: JSON.stringify(form) });
    queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}`] });
    setDirty(false);
    toast({ title: "Account info updated" });
  };

  const filteredUsers = (users as any[]).filter((u: any) => u.name.toLowerCase().includes(manSearch.toLowerCase()));

  if (!form) return null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          ["Company", "company", "text"], ["Product Name", "productName", "text"],
          ["Contact Person", "contactPerson", "text"], ["CP Phone", "cpPhone", "text"],
          ["CP Email", "cpEmail", "email"], ["Application", "application", "text"],
          ["Target Price ($/kg)", "targetPrice", "number"], ["Volume (kg/month)", "volume", "number"],
          ["Selling Price ($/kg)", "sellingPrice", "number"], ["Margin (%)", "margin", "text"],
          ["Competitor Reference", "competitorReference", "text"],
        ].map(([label, key, type]) => (
          <div key={key}>
            <label className={lCls}>{label}</label>
            <input type={type} value={form[key] || ""} onChange={e => setF(key, e.target.value)} className={iCls}
              step={type === "number" ? "0.01" : undefined} />
            {(key === "targetPrice" || key === "sellingPrice") && form[key] && (
              <p className="text-xs text-emerald-400 mt-1">{fmtNGN(parseFloat(form[key]))}/kg</p>
            )}
          </div>
        ))}

        <div>
          <label className={lCls}>Product Type</label>
          <select value={form.productType || ""} onChange={e => setF("productType", e.target.value)} className={iCls + " cursor-pointer"}>
            {Object.entries(PRODUCT_TYPES).map(([v, l]) => <option key={v} value={v} className="bg-card">{l}</option>)}
          </select>
        </div>

        <div>
          <label className={lCls}>Customer Type</label>
          <select value={form.customerType || "new"} onChange={e => setF("customerType", e.target.value)} className={iCls + " cursor-pointer"}>
            <option value="new" className="bg-card">New Customer</option>
            <option value="existing" className="bg-card">Existing Customer</option>
          </select>
        </div>

        <div>
          <label className={lCls}>Urgency Level</label>
          <div className="flex gap-2 flex-wrap">
            {[["urgent", "Urgent", "text-red-400 bg-red-500/10 border-red-500/20", "bg-red-500"], ["medium", "Medium", "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", "bg-yellow-500"], ["normal", "Normal", "text-green-400 bg-green-500/10 border-green-500/20", "bg-green-500"]].map(([v, l, cls, dot]) => (
              <button key={v} type="button" onClick={() => setF("urgencyLevel", v)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all", form.urgencyLevel === v ? cn(cls) : "border-white/10 text-muted-foreground hover:border-white/20")}>
                <span className={cn("w-2 h-2 rounded-full", form.urgencyLevel === v ? dot : "bg-muted-foreground/40")} />{l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className={lCls}>Account Manager(s)</label>
        <input value={manSearch} onChange={e => setManSearch(e.target.value)} placeholder="Search staff…" className={iCls + " mb-2"} />
        <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
          {filteredUsers.map((u: any) => (
            <label key={u.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all", (form.accountManagers || []).includes(u.id) ? "border-primary/30 bg-primary/10 text-foreground" : "border-white/5 text-muted-foreground hover:border-white/10")}>
              <input type="checkbox" checked={(form.accountManagers || []).includes(u.id)} onChange={() => toggleManager(u.id)} className="accent-primary" />
              <span>{u.name}</span>
            </label>
          ))}
        </div>
      </div>

      {dirty && (
        <div className="flex gap-3">
          <button onClick={save} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90">
            <Save className="w-4 h-4" /> Save Changes
          </button>
          <button onClick={() => { setForm(account); setDirty(false); }} className="px-5 py-2.5 border border-white/10 text-muted-foreground rounded-xl text-sm hover:text-foreground">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function TasksInfoPanel({ account, accountId }: { account: any; accountId: number }) {
  const queryClient = useQueryClient();
  const api = useApiCall();
  const { fmtNGN } = useExchangeRate();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const setF = (k: string, v: string) => { setEditing(e => ({ ...e, [k]: v })); setDirty(true); };
  const merged = { ...account, ...editing };

  const save = async () => {
    await api(`api/accounts/${accountId}`, { method: "PUT", body: JSON.stringify({ ...account, ...editing }) });
    queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}`] });
    setDirty(false);
    setEditing({});
    toast({ title: "Saved" });
  };

  return (
    <div className="flex gap-6 flex-wrap">
      <div className="flex-1 min-w-[240px] space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client Details</p>
        {[
          ["Company", "company"], ["Product Name", "productName"],
          ["Product Type", "productType"], ["Contact Person", "contactPerson"],
          ["CP Phone", "cpPhone"], ["CP Email", "cpEmail"],
        ].map(([l, k]) => (
          <div key={k} className="glass-card rounded-xl px-3 py-2.5 border border-white/5">
            <p className="text-[10px] text-muted-foreground uppercase">{l}</p>
            <input value={(editing[k] !== undefined ? editing[k] : account?.[k]) || ""} onChange={e => setF(k, e.target.value)}
              className="w-full bg-transparent text-sm text-foreground focus:outline-none mt-0.5" />
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-[240px] space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commercial Details</p>
        {[
          ["Account Manager(s)", null],
          ["Customer Type", "customerType"],
          ["Target Price ($/kg)", "targetPrice"],
          ["Selling Price ($/kg)", "sellingPrice"],
          ["Margin (%)", "margin"],
        ].map(([l, k]) => (
          <div key={String(l)} className="glass-card rounded-xl px-3 py-2.5 border border-white/5">
            <p className="text-[10px] text-muted-foreground uppercase">{l}</p>
            {k === null ? (
              <p className="text-sm text-foreground mt-0.5">{(account?.accountManagerNames || []).join(", ") || "—"}</p>
            ) : (
              <div>
                <input value={(editing[k] !== undefined ? editing[k] : account?.[k]) || ""} onChange={e => setF(k, e.target.value)}
                  type={k === "targetPrice" || k === "sellingPrice" ? "number" : "text"}
                  step={k === "targetPrice" || k === "sellingPrice" ? "0.01" : undefined}
                  className="w-full bg-transparent text-sm text-foreground focus:outline-none mt-0.5" />
                {(k === "targetPrice" || k === "sellingPrice") && merged?.[k] && (
                  <p className="text-[10px] text-emerald-400">{fmtNGN(parseFloat(merged[k]))}/kg</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {dirty && (
        <div className="w-full flex gap-3">
          <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90"><Save className="w-3.5 h-3.5" /> Save</button>
          <button onClick={() => { setEditing({}); setDirty(false); }} className="px-4 py-2 border border-white/10 text-muted-foreground rounded-xl text-xs hover:text-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}

const ACCOUNT_TABS = ["Tasks", "Status Report", "Production Orders", "Account Info"] as const;

export default function AccountDetail() {
  const params = useParams<{ id: string }>();
  const accountId = parseInt(params.id);
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<typeof ACCOUNT_TABS[number]>("Tasks");
  const { theme } = useTheme();
  const isLight = theme === "light";
  const api = useApiCall();
  const [scoreFull, setScoreFull] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: [`/api/accounts/${accountId}`],
    queryFn: async () => { const res = await api(`api/accounts/${accountId}`); return res.json(); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">Loading account…</div>;
  if (!account) return <div className="text-muted-foreground">Account not found.</div>;

  const { score, breakdown } = calcPriority(account);
  const urgency = URGENCY[account.urgencyLevel as string] || URGENCY.normal;
  const scoreColor = score >= 8 ? "text-red-400" : score >= 5 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/sales-force")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Sales Force
        </button>
      </div>

      <div className="glass-card rounded-2xl p-5 border border-white/5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">{account.company}</h1>
              <span className={cn("flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border", urgency.color === "text-red-400" ? "border-red-500/20 bg-red-500/10" : urgency.color === "text-yellow-400" ? "border-yellow-500/20 bg-yellow-500/10" : "border-green-500/20 bg-green-500/10")}>
                <span className={cn("w-2 h-2 rounded-full", urgency.dot)} />{urgency.label}
              </span>
            </div>
            <p className="text-muted-foreground">{account.productName}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{PRODUCT_TYPES[account.productType] || account.productType}</p>
          </div>
          <div className="relative">
            <button onMouseEnter={() => setScoreFull(true)} onMouseLeave={() => setScoreFull(false)}
              className={cn("flex flex-col items-center justify-center w-16 h-16 rounded-2xl border bg-white/5 border-white/10 cursor-default", scoreColor)}>
              <span className="text-xl font-bold leading-tight">{score}</span>
              <span className="text-[10px] text-muted-foreground">/10</span>
            </button>
            <AnimatePresence>
              {scoreFull && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute right-0 top-full mt-1 z-30 glass-panel border border-white/10 rounded-xl p-3 w-48 shadow-xl">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Priority Score</p>
                  {breakdown.map(b => (
                    <div key={b.label} className="flex justify-between text-xs py-0.5">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="font-medium text-foreground">+{b.pts}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/10 mt-2 pt-2 flex justify-between text-xs font-bold">
                    <span>Total</span><span className={scoreColor}>{score}/10</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {score >= 8 ? "🔴 HIGH PRIORITY" : score >= 5 ? "🟡 MEDIUM PRIORITY" : "🟢 NORMAL PRIORITY"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className={cn("flex gap-1 p-1 rounded-2xl border w-fit",
        isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10"
      )}>
        {ACCOUNT_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              tab === t ? "bg-primary text-white shadow-lg shadow-primary/20" : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
            )}>
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          {tab === "Tasks" && (
            <div className="space-y-4">
              <TasksInfoPanel account={account} accountId={accountId} />
              <KanbanBoard accountId={accountId} account={account} />
            </div>
          )}
          {tab === "Status Report" && <StatusReportTab accountId={accountId} />}
          {tab === "Production Orders" && <ProductionOrdersTab accountId={accountId} />}
          {tab === "Account Info" && <AccountInfoTab account={account} accountId={accountId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
