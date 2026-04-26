import { useRoute } from "wouter";
import { useGetProject, useListTasks, useCreateTask, useUpdateTask, useDeleteTask, useUpdateProject, useListUsers } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Clock, MessageSquare, Send, Edit3, Check, X, Calendar, User, Phone, Mail, DollarSign, Package, Trash2, GripVertical, AtSign, Star, TrendingUp, Zap } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useExchangeRate, fmtNGN } from "@/hooks/useExchangeRate";

const BASE = import.meta.env.BASE_URL;
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const;
type TaskStatus = typeof TASK_STATUSES[number];
const STAGES = ["testing", "reformulation", "innovation", "cost_optimization", "modification"];
const STATUSES = ["approved", "awaiting_feedback", "on_hold", "in_progress", "new_inventory", "cancelled", "pushed_to_live"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const PRODUCT_TYPES = ["Seasoning", "Snack Dusting", "Bread & Dough Premix", "Dairy Premix", "Functional Blend", "Pasta Sauce", "Sweet Flavour", "Savoury Flavour"];

const COLUMN_COLORS: Record<string, string> = {
  todo: "border-white/10",
  in_progress: "border-blue-500/20",
  review: "border-yellow-500/20",
  done: "border-green-500/20",
  blocked: "border-red-500/20",
};
const COLUMN_HEADER_COLORS: Record<string, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-blue-400",
  review: "text-yellow-400",
  done: "text-green-400",
  blocked: "text-red-400",
};

function InlineEdit({ value, onSave, type = "text", options, placeholder, icon, label }: {
  value: string; onSave: (v: string) => void; type?: string; options?: string[];
  placeholder?: string; icon?: React.ReactNode; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);

  const save = () => { if (val !== value) onSave(val); setEditing(false); };
  const cancel = () => { setVal(value); setEditing(false); };
  const cls = "flex h-9 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground";

  return (
    <div className="glass-card rounded-xl p-4 group/field relative">
      <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground uppercase tracking-wide font-medium">
        {icon}{label}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          {options ? (
            <select value={val} onChange={e => setVal(e.target.value)} className={cls} autoFocus>
              <option value="" className="bg-card">— not set —</option>
              {options.map(o => <option key={o} value={o} className="bg-card capitalize">{o.replace(/_/g,' ')}</option>)}
            </select>
          ) : (
            <input type={type} value={val} onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              className={cls} placeholder={placeholder} autoFocus />
          )}
          <button onClick={save} className="p-1.5 text-green-400 hover:text-green-300 shrink-0"><Check className="w-4 h-4" /></button>
          <button onClick={cancel} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 group/val">
          <span className={`text-sm font-medium ${!value ? "text-muted-foreground italic" : "text-foreground"}`}>
            {type === "date" && value ? format(new Date(value), "MMMM d, yyyy") : (value || "Not set")}
          </span>
          <button onClick={() => setEditing(true)}
            className="opacity-0 group-hover/field:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

const CURRENCY_OPTIONS = [
  { code: "NGN", label: "Nigerian Naira", flag: "🇳🇬" },
  { code: "ZAR", label: "South African Rand", flag: "🇿🇦" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "KES", label: "Kenyan Shilling", flag: "🇰🇪" },
  { code: "GHS", label: "Ghanaian Cedi", flag: "🇬🇭" },
  { code: "CAD", label: "Canadian Dollar", flag: "🇨🇦" },
  { code: "AUD", label: "Australian Dollar", flag: "🇦🇺" },
  { code: "JPY", label: "Japanese Yen", flag: "🇯🇵" },
];

interface ConversionBarProps {
  converted: number | null;
  currency: string;
  currencyMeta?: { code: string; label: string; flag: string };
  isLoading: boolean;
  lastUpdated: string;
  isManualOverride: boolean;
  showOverride: boolean;
  setShowOverride: (v: boolean) => void;
  overrideInput: string;
  setOverrideInput: (v: string) => void;
  applyOverride: () => void;
  clearOverride: () => void;
  refresh: () => void;
  onChangeCurrency?: (code: string) => void;
}

function ConversionBar({ converted, currency, currencyMeta, isLoading, lastUpdated, isManualOverride, showOverride, setShowOverride, overrideInput, setOverrideInput, applyOverride, clearOverride, refresh, onChangeCurrency }: ConversionBarProps) {
  const fmtConverted = converted != null
    ? fmtNGN(converted)
    : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 border border-white/5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">≈</span>
        {isLoading ? (
          <span className="text-xs text-muted-foreground animate-pulse">Fetching rate…</span>
        ) : fmtConverted != null ? (
          <span className="text-xs font-semibold text-amber-400">
            {currencyMeta?.flag ?? "🇳🇬"} {currency === "NGN" ? "₦" : ""}{fmtConverted} {currency}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Rate not available</span>
        )}
        {onChangeCurrency ? (
          <select value={currency} onChange={e => onChangeCurrency(e.target.value)}
            className="ml-auto text-[11px] bg-transparent border border-white/10 rounded-md px-1.5 py-0.5 text-muted-foreground focus:outline-none hover:border-white/20 cursor-pointer"
            onClick={e => e.stopPropagation()}>
            {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code} className="bg-card">{c.flag} {c.code} — {c.label}</option>)}
          </select>
        ) : (
          <button onClick={refresh} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground px-1 rounded" title="Refresh rate">↻</button>
        )}
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Updated {lastUpdated}</span>}
          {isManualOverride && <span className="text-[10px] text-amber-500/80 font-medium">(manual rate)</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {isManualOverride && (
            <button onClick={clearOverride} className="text-[10px] text-red-400/70 hover:text-red-400 underline">Clear override</button>
          )}
          {currency === "NGN" && (
            <button onClick={() => setShowOverride(!showOverride)} className="text-[10px] text-primary/70 hover:text-primary underline">
              {showOverride ? "Cancel" : "Set rate"}
            </button>
          )}
        </div>
      </div>
      {showOverride && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0">$1 USD =</span>
          <input type="number" value={overrideInput} onChange={e => setOverrideInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyOverride(); if (e.key === "Escape") setShowOverride(false); }}
            placeholder="e.g. 1650" className="flex-1 h-7 rounded-md border border-white/10 bg-black/30 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground" autoFocus />
          <button onClick={applyOverride} className="px-2 py-1 text-[11px] bg-primary/20 text-primary rounded-md hover:bg-primary/30 shrink-0">Apply</button>
        </div>
      )}
    </div>
  );
}

function CostTargetField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [displayVal, setDisplayVal] = useState(value);
  const [targetCurrency, setTargetCurrency] = useState(() => {
    try { return localStorage.getItem("rd_cost_currency") || "NGN"; } catch { return "NGN"; }
  });
  const [showOverride, setShowOverride] = useState(false);
  const [overrideInput, setOverrideInput] = useState("");
  const { convert, isLoading, isManualOverride, getLastUpdated, setManualNGN, refresh } = useExchangeRate();

  useEffect(() => { setVal(value); setDisplayVal(value); }, [value]);

  const save = () => {
    const trimmed = val.trim();
    if (trimmed !== displayVal) { onSave(trimmed); setDisplayVal(trimmed); }
    setEditing(false);
  };
  const cancel = () => { setVal(displayVal); setEditing(false); };

  const activeAmount = parseFloat(editing ? val : displayVal) || 0;
  const converted = activeAmount > 0 ? convert(activeAmount, targetCurrency) : null;
  const currencyMeta = CURRENCY_OPTIONS.find(c => c.code === targetCurrency);
  const lastUpdated = getLastUpdated();
  const changeCurrency = (code: string) => {
    setTargetCurrency(code);
    try { localStorage.setItem("rd_cost_currency", code); } catch {}
  };
  const applyOverride = () => {
    const v = parseFloat(overrideInput);
    if (!isNaN(v) && v > 0) { setManualNGN(v); setShowOverride(false); setOverrideInput(""); }
  };
  const clearOverride = () => { setManualNGN(null); setShowOverride(false); };

  const cls = "flex h-9 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground";

  return (
    <div className="glass-card rounded-xl p-4 group/field relative">
      <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground uppercase tracking-wide font-medium">
        <DollarSign className="w-3.5 h-3.5" /> Cost Target (USD $)
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <input type="number" value={val} onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                className={cls + " pl-7"} placeholder="0.00" autoFocus step="0.01" min="0" />
            </div>
            <button onClick={save} className="p-1.5 text-green-400 hover:text-green-300 shrink-0"><Check className="w-4 h-4" /></button>
            <button onClick={cancel} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
          </div>
          {activeAmount > 0 && (
            <ConversionBar converted={converted} currency={targetCurrency} currencyMeta={currencyMeta} isLoading={isLoading} lastUpdated={lastUpdated} isManualOverride={isManualOverride} showOverride={showOverride} setShowOverride={setShowOverride} overrideInput={overrideInput} setOverrideInput={setOverrideInput} applyOverride={applyOverride} clearOverride={clearOverride} refresh={refresh} onChangeCurrency={changeCurrency} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 group/val">
            <span className={`text-sm font-bold ${!displayVal ? "text-muted-foreground italic" : "text-green-400"}`}>
              {displayVal ? `$${parseFloat(displayVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not set"}
            </span>
            <button onClick={() => setEditing(true)} className="opacity-0 group-hover/field:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          {activeAmount > 0 && (
            <ConversionBar converted={converted} currency={targetCurrency} currencyMeta={currencyMeta} isLoading={isLoading} lastUpdated={lastUpdated} isManualOverride={isManualOverride} showOverride={showOverride} setShowOverride={setShowOverride} overrideInput={overrideInput} setOverrideInput={setOverrideInput} applyOverride={applyOverride} clearOverride={clearOverride} refresh={refresh} onChangeCurrency={changeCurrency} />
          )}
        </div>
      )}
    </div>
  );
}

function SellingPriceField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [displayVal, setDisplayVal] = useState(value);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideInput, setOverrideInput] = useState("");
  const { convert, isLoading, isManualOverride, getLastUpdated, setManualNGN, refresh } = useExchangeRate();

  useEffect(() => { setVal(value); setDisplayVal(value); }, [value]);

  const save = () => {
    const trimmed = val.trim();
    if (trimmed !== displayVal) { onSave(trimmed); setDisplayVal(trimmed); }
    setEditing(false);
  };
  const cancel = () => { setVal(displayVal); setEditing(false); };

  const activeAmount = parseFloat(editing ? val : displayVal) || 0;
  const converted = activeAmount > 0 ? convert(activeAmount, "NGN") : null;
  const lastUpdated = getLastUpdated();
  const applyOverride = () => {
    const v = parseFloat(overrideInput);
    if (!isNaN(v) && v > 0) { setManualNGN(v); setShowOverride(false); setOverrideInput(""); }
  };
  const clearOverride = () => { setManualNGN(null); setShowOverride(false); };

  const cls = "flex h-9 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground";

  return (
    <div className="glass-card rounded-xl p-4 group/field relative">
      <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground uppercase tracking-wide font-medium">
        <TrendingUp className="w-3.5 h-3.5" /> Selling Price (USD $)
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <input type="number" value={val} onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                className={cls + " pl-7"} placeholder="0.00" autoFocus step="0.01" min="0" />
            </div>
            <button onClick={save} className="p-1.5 text-green-400 hover:text-green-300 shrink-0"><Check className="w-4 h-4" /></button>
            <button onClick={cancel} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
          </div>
          {activeAmount > 0 && (
            <ConversionBar converted={converted} currency="NGN" currencyMeta={{ code: "NGN", label: "Nigerian Naira", flag: "🇳🇬" }} isLoading={isLoading} lastUpdated={lastUpdated} isManualOverride={isManualOverride} showOverride={showOverride} setShowOverride={setShowOverride} overrideInput={overrideInput} setOverrideInput={setOverrideInput} applyOverride={applyOverride} clearOverride={clearOverride} refresh={refresh} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 group/val">
            <span className={`text-sm font-bold ${!displayVal ? "text-muted-foreground italic" : "text-violet-400"}`}>
              {displayVal ? `$${parseFloat(displayVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not set"}
            </span>
            <button onClick={() => setEditing(true)} className="opacity-0 group-hover/field:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          {activeAmount > 0 && (
            <ConversionBar converted={converted} currency="NGN" currencyMeta={{ code: "NGN", label: "Nigerian Naira", flag: "🇳🇬" }} isLoading={isLoading} lastUpdated={lastUpdated} isManualOverride={isManualOverride} showOverride={showOverride} setShowOverride={setShowOverride} overrideInput={overrideInput} setOverrideInput={setOverrideInput} applyOverride={applyOverride} clearOverride={clearOverride} refresh={refresh} />
          )}
        </div>
      )}
    </div>
  );
}

const TEMPLATE_TASKS = [
  "Fill Brief Sheet",
  "Descriptive analysis of Sample(s)",
  "Create recipe(s)",
  "Sensory evaluation of sample(s)",
  "In-house approval",
  "Send samples to customer",
  "Send follow-up mail for samples sent",
  "TDS, MSDS and COA from QC",
  "Customer approval",
  "Align with Procurement Department",
  "Push to live",
  "Pre-Commercialization Meeting",
  "First Bulk Production",
];

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = Number(params?.id);
  const [activeTab, setActiveTab] = useState<"tasks" | "comments" | "info" | "revenue">("tasks");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [starActive, setStarActive] = useState(false);
  const [templateTaskIds, setTemplateTaskIds] = useState<number[]>([]);
  const [liveSellingPrice, setLiveSellingPrice] = useState<number | null>(null);
  const [liveVolume, setLiveVolume] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: project, isLoading: loadingProj } = useGetProject(projectId);
  const { data: tasks, isLoading: loadingTasks } = useListTasks({ projectId });
  const { data: users } = useListUsers();
  const updateTaskMut = useUpdateTask();
  const deleteTaskMut = useDeleteTask();
  const createTaskMut = useCreateTask();
  const updateProjectMut = useUpdateProject();

  useEffect(() => {
    if (project) {
      setTitleValue(project.name);
      setDescValue(project.description || "");
      const sp = (project as any).sellingPrice;
      const vol = (project as any).volumeKgPerMonth;
      setLiveSellingPrice(sp ? parseFloat(String(sp)) : null);
      setLiveVolume(vol ? parseFloat(String(vol)) : null);
    }
  }, [project]);

  if (loadingProj || loadingTasks) return <PageLoader />;
  if (!project) return <div className="glass-card p-12 text-center rounded-2xl text-muted-foreground">Project not found</div>;

  const moveTask = (taskId: number, newStatus: TaskStatus) => {
    updateTaskMut.mutate({ id: taskId, data: { status: newStatus } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] })
    });
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData("taskId", String(taskId));
    e.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e: React.DragEvent, col: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  };

  const handleDrop = (e: React.DragEvent, col: TaskStatus) => {
    e.preventDefault();
    const taskId = parseInt(e.dataTransfer.getData("taskId"));
    if (taskId) moveTask(taskId, col);
    setDragOverCol(null);
    setDraggingTaskId(null);
  };

  const saveField = (field: string, value: any) => {
    if (field === "sellingPrice") setLiveSellingPrice(value ? parseFloat(value) : null);
    if (field === "volumeKgPerMonth") setLiveVolume(value ? parseFloat(value) : null);
    updateProjectMut.mutate({ id: projectId, data: { [field]: value || null } as any }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); toast({ title: "Saved" }); },
    });
  };

  const saveTitle = () => {
    if (!titleValue.trim()) return;
    updateProjectMut.mutate({ id: projectId, data: { name: titleValue } as any }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); setEditingTitle(false); }
    });
  };

  const saveDesc = () => {
    updateProjectMut.mutate({ id: projectId, data: { description: descValue } as any }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); setEditingDesc(false); }
    });
  };

  const handleStarClick = async () => {
    if (starActive && templateTaskIds.length > 0) {
      for (const id of templateTaskIds) {
        try { await deleteTaskMut.mutateAsync({ id }); } catch {}
      }
      setTemplateTaskIds([]);
      setStarActive(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Template tasks removed" });
    } else {
      const createdIds: number[] = [];
      for (const title of TEMPLATE_TASKS) {
        try {
          const task = await createTaskMut.mutateAsync({ data: { projectId, title, status: "todo", priority: "medium" } as any });
          createdIds.push((task as any).id);
        } catch {}
      }
      setTemplateTaskIds(createdIds);
      setStarActive(true);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Template tasks created", description: `${createdIds.length} tasks added.` });
    }
  };

  const selectCls = "h-8 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-primary hover:underline flex items-center gap-1 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Portfolio
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input value={titleValue} onChange={e => setTitleValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                  className="text-2xl font-bold font-display bg-transparent border-b-2 border-primary focus:outline-none text-foreground w-full" autoFocus />
                <button onClick={saveTitle} className="p-1 text-green-400"><Check className="w-5 h-5" /></button>
                <button onClick={() => setEditingTitle(false)} className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">{project.name}</h1>
                <button onClick={() => setEditingTitle(true)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <select value={project.stage} onChange={e => saveField("stage", e.target.value)} className={selectCls}>
                {STAGES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={project.status} onChange={e => saveField("status", e.target.value)} className={selectCls}>
                {STATUSES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={project.priority || "medium"} onChange={e => saveField("priority", e.target.value)} className={selectCls}>
                {PRIORITIES.map(p => <option key={p} value={p} className="bg-card capitalize">{p} Priority</option>)}
              </select>
            </div>
            <div className="mt-3 max-w-2xl">
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea value={descValue} onChange={e => setDescValue(e.target.value)} autoFocus
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground min-h-[80px] resize-none" />
                  <div className="flex gap-2">
                    <button onClick={saveDesc} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs"><Check className="w-3 h-3" /> Save</button>
                    <button onClick={() => { setEditingDesc(false); setDescValue(project.description || ""); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-muted-foreground text-xs"><X className="w-3 h-3" /> Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 group">
                  <p className="text-muted-foreground text-sm flex-1">{project.description || <span className="italic">No description. Click to add.</span>}</p>
                  <button onClick={() => setEditingDesc(true)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground shrink-0"><Edit3 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          </div>
          <div className="text-right text-sm shrink-0 space-y-1">
            {(project as any).customerName && <div className="font-medium text-foreground">{(project as any).customerName}</div>}
            {(project as any).productType && <div className="text-muted-foreground">📦 {(project as any).productType}</div>}
            {project.targetDate && (
              <div className="text-muted-foreground flex items-center justify-end gap-1">
                <Calendar className="w-3.5 h-3.5" /> Due: {format(new Date(project.targetDate), "MMM d, yyyy")}
              </div>
            )}
            {(project as any).costTarget && (
              <div className="text-green-400 font-medium text-xs">Cost: ${parseFloat(String((project as any).costTarget)).toLocaleString()}</div>
            )}
            {(project as any).sellingPrice && (
              <div className="text-violet-400 font-bold">
                <TrendingUp className="w-3 h-3 inline mr-0.5" />${parseFloat(String((project as any).sellingPrice)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            )}
            {(project as any).sellingPrice && (project as any).volumeKgPerMonth && (
              <div className="text-xs text-emerald-400 font-semibold">
                <Zap className="w-3 h-3 inline mr-0.5" />
                ${(parseFloat(String((project as any).sellingPrice)) * parseFloat(String((project as any).volumeKgPerMonth))).toLocaleString()}/mo
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit flex-wrap border border-white/10">
        {[
          { id: "tasks", label: "Tasks" },
          { id: "comments", label: "Status Reports" },
          { id: "info", label: "Project Info" },
          { id: "revenue", label: "Revenue" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? t.id === "revenue" ? "bg-emerald-600 text-white" : "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.id === "revenue" && <TrendingUp className="w-3.5 h-3.5 inline mr-1.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "tasks" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <GripVertical className="w-3.5 h-3.5" /> Drag tasks between columns · Click <Edit3 className="w-3 h-3 inline" /> to edit
            </p>
            <button
              onClick={handleStarClick}
              title={starActive ? "Remove template tasks" : "Add template workflow tasks"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                starActive
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"
                  : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${starActive ? "fill-yellow-400" : ""}`} />
              {starActive ? "Remove Template Tasks" : "Template Tasks"}
            </button>
          </div>
          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="flex gap-5 min-w-max">
              {TASK_STATUSES.map(status => {
                const columnTasks = (tasks || []).filter(t => t.status === status);
                const isOver = dragOverCol === status;
                return (
                  <div key={status}
                    className={`w-72 flex flex-col rounded-2xl border transition-colors ${COLUMN_COLORS[status]} ${isOver ? "bg-white/5 scale-[1.01]" : ""}`}
                    onDragOver={e => handleDragOver(e, status)}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={e => handleDrop(e, status)}>
                    <div className="flex items-center justify-between p-3 pb-2 shrink-0">
                      <h3 className={`font-semibold capitalize flex items-center gap-2 text-sm ${COLUMN_HEADER_COLORS[status]}`}>
                        {status.replace(/_/g, ' ')}
                        <span className="bg-white/10 text-xs px-1.5 py-0.5 rounded-full text-muted-foreground">{columnTasks.length}</span>
                      </h3>
                      {status === 'todo' && <CreateTaskModal projectId={projectId} />}
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 p-2 pt-1 max-h-[62vh]">
                      {columnTasks.map(task => (
                        <div key={task.id}
                          draggable
                          onDragStart={e => handleDragStart(e, task.id)}
                          onDragEnd={handleDragEnd}
                          className={`glass-card p-3 rounded-xl group cursor-grab active:cursor-grabbing select-none transition-opacity ${draggingTaskId === task.id ? "opacity-40" : "opacity-100"}`}>
                          <div className="flex justify-between items-start mb-1.5">
                            <Badge variant={task.priority === 'critical' ? 'destructive' : task.priority === 'high' ? 'warning' : 'outline'} className="text-[10px]">{task.priority}</Badge>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingTask(task)} className="p-1 hover:bg-white/10 rounded text-muted-foreground hover:text-foreground" title="Edit task">
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button onClick={() => { deleteTaskMut.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }) }); }}
                                className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive" title="Delete task">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <h4 className="text-sm font-medium text-foreground mb-1 leading-tight">{task.title}</h4>
                          {task.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                            <GripVertical className="w-3 h-3 opacity-30" />
                            <Clock className="w-3 h-3" />
                            <span>{format(new Date(task.createdAt), "MMM d")}</span>
                          </div>
                        </div>
                      ))}
                      {columnTasks.length === 0 && (
                        <div className={`border-2 border-dashed rounded-xl h-20 flex items-center justify-center text-muted-foreground text-xs transition-colors ${isOver ? "border-primary/40 bg-primary/5" : "border-white/5"}`}>
                          {isOver ? "Drop here" : "Empty"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {activeTab === "comments" && <CommentsTab projectId={projectId} users={users || []} />}

      {activeTab === "revenue" && (
        <RevenueScreen
          sellingPrice={liveSellingPrice}
          volume={liveVolume}
          projectName={project.name}
          onGoToInfo={() => setActiveTab("info")}
        />
      )}

      {activeTab === "info" && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">Click any field to edit it directly.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <InlineEdit label="Customer Name" value={project.customerName || ""} onSave={v => saveField("customerName", v)} icon={<User className="w-3.5 h-3.5" />} placeholder="Customer / client name" />
            <InlineEdit label="Customer Email" value={project.customerEmail || ""} onSave={v => saveField("customerEmail", v)} type="email" icon={<Mail className="w-3.5 h-3.5" />} placeholder="email@example.com" />
            <InlineEdit label="Customer Phone" value={project.customerPhone || ""} onSave={v => saveField("customerPhone", v)} icon={<Phone className="w-3.5 h-3.5" />} placeholder="+27 xx xxx xxxx" />
            <InlineEdit label="Product Type" value={(project as any).productType || ""} onSave={v => saveField("productType", v)} options={PRODUCT_TYPES} icon={<Package className="w-3.5 h-3.5" />} />
            <CostTargetField value={(project as any).costTarget ? String(parseFloat(String((project as any).costTarget))) : ""} onSave={v => saveField("costTarget", v)} />
            <SellingPriceField value={(project as any).sellingPrice ? String(parseFloat(String((project as any).sellingPrice))) : ""} onSave={v => saveField("sellingPrice", v)} />
            <InlineEdit label="Volume (kg/Month)" value={(project as any).volumeKgPerMonth ? String(parseFloat(String((project as any).volumeKgPerMonth))) : ""} onSave={v => saveField("volumeKgPerMonth", v)} type="number" icon={<Package className="w-3.5 h-3.5" />} placeholder="e.g. 500" />
            <InlineEdit label="Priority" value={project.priority || "medium"} onSave={v => saveField("priority", v)} options={PRIORITIES} icon={<Edit3 className="w-3.5 h-3.5" />} />
            <InlineEdit label="Stage" value={project.stage || ""} onSave={v => saveField("stage", v)} options={STAGES} icon={<Edit3 className="w-3.5 h-3.5" />} />
            <InlineEdit label="Status" value={project.status || ""} onSave={v => saveField("status", v)} options={STATUSES} icon={<Edit3 className="w-3.5 h-3.5" />} />
            <InlineEdit label="Start Date" value={project.startDate ? format(new Date(project.startDate), "yyyy-MM-dd") : ""} onSave={v => saveField("startDate", v)} type="date" icon={<Calendar className="w-3.5 h-3.5" />} />
            <InlineEdit label="Due Date" value={project.targetDate ? format(new Date(project.targetDate), "yyyy-MM-dd") : ""} onSave={v => saveField("targetDate", v)} type="date" icon={<Calendar className="w-3.5 h-3.5" />} />
          </div>
          {(project as any).assignees?.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Assignees</div>
              <div className="flex flex-wrap gap-2">
                {(project as any).assignees.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[10px] font-bold">{a.name.charAt(0)}</div>
                    <span className="text-sm text-foreground">{a.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">· {a.role.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AssigneeEditor currentAssigneeIds={((project as any).assignees || []).map((a: any) => a.id)} users={users || []} onSave={(ids) => saveField("assigneeIds", ids)} />
        </div>
      )}

      {editingTask && (
        <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)}
          onSave={(data) => {
            updateTaskMut.mutate({ id: editingTask.id, data }, {
              onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); setEditingTask(null); toast({ title: "Task updated" }); }
            });
          }} />
      )}
    </div>
  );
}

function RevenueScreen({ sellingPrice, volume, projectName, onGoToInfo }: {
  sellingPrice: number | null; volume: number | null; projectName: string; onGoToInfo: () => void;
}) {
  const revenue = sellingPrice && volume ? sellingPrice * volume : null;
  const hasData = sellingPrice !== null && volume !== null;

  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl overflow-hidden border border-emerald-500/20 bg-gradient-to-br from-black via-emerald-950/20 to-black p-8">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(16,185,129,0.3) 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, rgba(16,185,129,0.3) 0px, transparent 1px, transparent 20px)" }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-[0.3em]">Revenue Calculator</span>
            <div className="h-px flex-1 bg-emerald-500/20" />
            <span className="text-xs font-mono text-muted-foreground">{projectName}</span>
          </div>

          {!hasData ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-muted-foreground text-sm mb-2">No financial data set yet</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Set <strong className="text-emerald-400">Selling Price ($)</strong> and <strong className="text-emerald-400">Volume (kg/Month)</strong> in Project Info to calculate revenue.</p>
              <button onClick={onGoToInfo} className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/20 transition-all">
                Go to Project Info →
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="rounded-xl bg-black/40 border border-white/10 p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-mono">Selling Price</p>
                  <p className="font-mono text-2xl font-bold text-violet-400">${sellingPrice!.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">USD per kg</p>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/10 p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-mono">Volume</p>
                  <p className="font-mono text-2xl font-bold text-blue-400">{volume!.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">kg / month</p>
                </div>
              </div>

              <div className="rounded-2xl bg-black/60 border border-emerald-500/30 p-6 text-center">
                <p className="text-[10px] text-emerald-400/60 uppercase tracking-[0.4em] font-mono mb-3">Monthly Revenue</p>
                <div className="text-5xl font-mono font-black text-emerald-400 mb-2 tabular-nums" style={{ textShadow: "0 0 30px rgba(16,185,129,0.5), 0 0 60px rgba(16,185,129,0.2)" }}>
                  ${revenue!.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  ${sellingPrice!.toLocaleString()} × {volume!.toLocaleString()} kg
                </p>
                <div className="mt-4 pt-4 border-t border-emerald-500/10 grid grid-cols-2 gap-4 text-left">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Annual Revenue</p>
                    <p className="text-lg font-mono font-bold text-emerald-300 mt-0.5">${(revenue! * 12).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Daily Avg</p>
                    <p className="text-lg font-mono font-bold text-emerald-300 mt-0.5">${(revenue! / 30).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditTaskModal({ task, onClose, onSave }: { task: any; onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    priority: task.priority || "medium",
    status: task.status || "todo",
    dueDate: task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "",
  });
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const cls = "flex h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] glass-panel border-white/10 bg-card/95">
        <DialogHeader><DialogTitle className="font-display">Edit Task</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5"><label className="text-sm font-medium">Title *</label>
            <input value={form.title} onChange={e => setF("title", e.target.value)} className={cls} autoFocus />
          </div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Description</label>
            <textarea value={form.description} onChange={e => setF("description", e.target.value)}
              className="flex min-h-[80px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground resize-none"
              placeholder="Task details..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><label className="text-sm font-medium">Priority</label>
              <select value={form.priority} onChange={e => setF("priority", e.target.value)} className={cls}>
                {["low", "medium", "high", "critical"].map(p => <option key={p} value={p} className="bg-card capitalize">{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Status</label>
              <select value={form.status} onChange={e => setF("status", e.target.value)} className={cls}>
                {TASK_STATUSES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 col-span-2"><label className="text-sm font-medium">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setF("dueDate", e.target.value)} className={cls} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave({ ...form, dueDate: form.dueDate || null })} disabled={!form.title.trim()}>Save Task</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssigneeEditor({ currentAssigneeIds, users, onSave }: { currentAssigneeIds: number[]; users: any[]; onSave: (ids: number[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number[]>(currentAssigneeIds);
  useEffect(() => { setSelected(currentAssigneeIds); }, [JSON.stringify(currentAssigneeIds)]);
  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  if (users.length === 0) return null;
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2"><User className="w-3.5 h-3.5" /> Edit Assignees</div>
        {!editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Edit3 className="w-3.5 h-3.5 mr-1" /> Edit</Button>}
      </div>
      {editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {users.map(u => (
              <button key={u.id} type="button" onClick={() => toggle(u.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${selected.includes(u.id) ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">{u.name.charAt(0)}</span>
                {u.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { onSave(selected); setEditing(false); }}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelected(currentAssigneeIds); setEditing(false); }}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{selected.length === 0 ? "No assignees set." : `${selected.length} assignee(s) assigned.`}</p>
      )}
    </div>
  );
}

function CommentsTab({ projectId, users }: { projectId: number; users: any[] }) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [pendingMentions, setPendingMentions] = useState<Map<string, number>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`${BASE}api/projects/${projectId}/comments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
    }).then(r => r.json()).then(d => setComments(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  }, [projectId]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = textBefore.slice(atIdx + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        setMentionQuery(query);
        setMentionStart(atIdx);
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (user: any) => {
    const before = newComment.slice(0, mentionStart);
    const after = newComment.slice(mentionStart + 1 + (mentionQuery?.length || 0));
    const inserted = `@${user.name} `;
    setNewComment(before + inserted + after);
    setPendingMentions(m => new Map(m).set(user.name, user.id));
    setMentionQuery(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const filteredUsers = mentionQuery !== null
    ? users.filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  const post = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    const mentionedUserIds = Array.from(pendingMentions.entries())
      .filter(([name]) => newComment.includes(`@${name}`))
      .map(([, id]) => id);
    try {
      const res = await fetch(`${BASE}api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
        body: JSON.stringify({ content: newComment, mentionedUserIds }),
      });
      const data = await res.json();
      setComments(c => [...c, data]);
      setNewComment("");
      setPendingMentions(new Map());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } finally { setPosting(false); }
  };

  const renderContent = (content: string) => {
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

  if (loading) return <PageLoader />;

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <h3 className="text-lg font-semibold font-display flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" /> Status Reports & Comments
      </h3>
      <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
        {comments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No status reports yet. Add the first one below.</p>
          </div>
        ) : comments.map(c => (
          <div key={c.id} className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {c.authorName?.charAt(0) || "?"}
            </div>
            <div className="flex-1 bg-white/5 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-foreground">{c.authorName}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy · h:mm a")}</span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{renderContent(c.content)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="pt-2 border-t border-white/5">
        <div className="relative">
          {mentionQuery !== null && filteredUsers.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 w-72 glass-panel rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 text-xs text-muted-foreground">
                <AtSign className="w-3.5 h-3.5 text-primary" /> Mention a team member
                {mentionQuery && <span className="font-mono text-primary">"{mentionQuery}"</span>}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredUsers.map(u => (
                  <button key={u.id} onMouseDown={e => { e.preventDefault(); insertMention(u); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left transition-colors">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{u.role.replace(/_/g, ' ')}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleTextareaChange}
            onKeyDown={e => {
              if (mentionQuery !== null && e.key === "Escape") { setMentionQuery(null); return; }
              if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) { e.preventDefault(); post(); }
            }}
            placeholder="Write a status report... Type @ to mention a team member (Enter to send)"
            className="w-full min-h-[72px] rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground resize-none"
          />
          <AtSign className="absolute right-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none opacity-50" />
        </div>
        {pendingMentions.size > 0 && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Mentions:</span>
            {Array.from(pendingMentions.entries()).filter(([name]) => newComment.includes(`@${name}`)).map(([name, id]) => (
              <span key={id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">@{name}</span>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-2">
          <Button onClick={post} disabled={posting || !newComment.trim()} className="gap-2">
            <Send className="w-4 h-4" /> {posting ? "Sending..." : "Post Report"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateTaskModal({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createMutation = useCreateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<any>("medium");
  const [dueDate, setDueDate] = useState("");
  const cls = "flex h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none text-foreground placeholder:text-muted-foreground";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: { projectId, title, description: description || undefined, status: "todo" as any, priority, dueDate: dueDate || undefined } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        setOpen(false); setTitle(""); setDescription(""); setDueDate(""); setPriority("medium");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors" title="Add task"><Plus className="w-4 h-4" /></button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] glass-panel border-white/10 bg-card/95">
        <DialogHeader><DialogTitle className="font-display">Add Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5"><label className="text-sm font-medium">Title *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." className={cls} autoFocus />
          </div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details..." className="flex min-h-[60px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none text-foreground placeholder:text-muted-foreground resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={cls}>
                {["low", "medium", "high", "critical"].map(p => <option key={p} value={p} className="bg-card capitalize">{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={cls} />
            </div>
          </div>
          <div className="pt-1 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>Add Task</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
