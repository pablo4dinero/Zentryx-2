import { useState, useEffect } from "react";
import { useListUsers } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Calendar, Trash2, Briefcase, Edit3, X, Check, Download, LayoutGrid, List, Table2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/useExchangeRate";

const BASE = import.meta.env.BASE_URL;
const STAGES = ["testing", "reformulation", "innovation", "cost_optimization", "modification"] as const;
const STATUSES = ["approved", "awaiting_feedback", "on_hold", "in_progress", "new_inventory", "cancelled", "pushed_to_live"] as const;
const PRODUCT_TYPES = ["Seasoning", "Snack Dusting", "Bread & Dough Premix", "Dairy Premix", "Functional Blend", "Pasta Sauce", "Sweet Flavour", "Savoury Flavour"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

type ViewMode = "list" | "portfolio" | "matrix";

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
  approved: "bg-green-50 text-green-700 border-green-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_feedback: "bg-yellow-50 text-yellow-700 border-yellow-200",
  on_hold: "bg-orange-50 text-orange-700 border-orange-200",
  new_inventory: "bg-purple-50 text-purple-700 border-purple-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  pushed_to_live: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-blue-400",
  high: "text-amber-400",
  critical: "text-red-400",
};

const STAGE_COLORS: Record<string, string> = {
  testing: "text-cyan-400 bg-cyan-500/10",
  reformulation: "text-amber-400 bg-amber-500/10",
  innovation: "text-violet-400 bg-violet-500/10",
  cost_optimization: "text-green-400 bg-green-500/10",
  modification: "text-rose-400 bg-rose-500/10",
};

const token = () => localStorage.getItem("rd_token");
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

function useBDItems() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}api/business-dev`, { headers: authHeaders() });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (body: any) => {
    const res = await fetch(`${BASE}api/business-dev`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const item = await res.json();
    setItems(prev => [item, ...prev]);
    return item;
  };

  const update = async (id: number, body: any) => {
    const res = await fetch(`${BASE}api/business-dev/${id}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const item = await res.json();
    setItems(prev => prev.map(x => x.id === id ? item : x));
    return item;
  };

  const remove = async (id: number) => {
    await fetch(`${BASE}api/business-dev/${id}`, { method: "DELETE", headers: authHeaders() });
    setItems(prev => prev.filter(x => x.id !== id));
  };

  return { items, loading, error, create, update, remove, reload: load };
}

export default function BusinessDev() {
  const { items, loading, error, create, update, remove } = useBDItems();
  const { data: users } = useListUsers();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { fmtNGN } = useExchangeRate();

  const filtered = items.filter(item => {
    const matchSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.productType?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Permanently delete "${name}"?`)) return;
    await remove(id);
    toast({ title: "Deleted", description: `"${name}" removed.` });
  };

  const handleExport = () => {
    const headers = ["ID","Title","Stage","Status","Product Type","Customer Name","Customer Email","Customer Phone","Cost Target","Start Date","Due Date","Assignees"];
    const rows = items.map(i => [
      i.id, i.name, i.stage, i.status, i.productType || "", i.customerName || "",
      i.customerEmail || "", i.customerPhone || "", i.costTarget || "",
      i.startDate ? format(new Date(i.startDate), "yyyy-MM-dd") : "",
      i.targetDate ? format(new Date(i.targetDate), "yyyy-MM-dd") : "",
      (i.assignees || []).map((a: any) => a.name).join("; "),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `bd-items-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${items.length} BD items exported.` });
  };

  if (loading) return <PageLoader />;
  if (error) return (
    <div className="glass-card rounded-2xl p-8 text-center">
      <p className="text-destructive">{error}</p>
      <Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
    </div>
  );

  const viewBtnCls = (v: ViewMode) => cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
    viewMode === v
      ? "bg-primary text-white border-primary"
      : isLight
        ? "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        : "border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={cn("text-3xl font-display font-bold flex items-center gap-3", isLight ? "text-gray-900" : "text-foreground")}>
            <Briefcase className="w-8 h-8 text-primary" /> Business Development
          </h1>
          <p className={cn("mt-1 text-sm", isLight ? "text-gray-500" : "text-muted-foreground")}>Track and manage BD opportunities and customer pipelines.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} className="gap-2"><Download className="w-4 h-4" /> Export</Button>
          <CreateBDModal users={users || []} onCreate={create} />
        </div>
      </div>

      {/* View toggle */}
      <div className={cn("flex items-center gap-1 p-1 rounded-xl border w-fit", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
        <button className={viewBtnCls("list")} onClick={() => setViewMode("list")}>
          <List className="w-3.5 h-3.5" /> List
        </button>
        <button className={viewBtnCls("portfolio")} onClick={() => setViewMode("portfolio")}>
          <LayoutGrid className="w-3.5 h-3.5" /> Portfolio
        </button>
        <button className={viewBtnCls("matrix")} onClick={() => setViewMode("matrix")}>
          <Table2 className="w-3.5 h-3.5" /> Matrix
        </button>
      </div>

      {/* Search + status filters — directly below view toggles */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search BD items..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter && s !== "all" ? "all" : s)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize",
                statusFilter === s
                  ? "bg-primary text-white border-primary"
                  : isLight
                    ? "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}>
              {s === "all" ? "All" : s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {viewMode === "portfolio" && (
        <PortfolioView
          items={filtered}
          isLight={isLight}
          fmtNGN={fmtNGN}
          onUpdate={update}
          onDelete={handleDelete}
          onEdit={setEditingCard}
        />
      )}
      {viewMode === "list" && (
        <ListView
          items={filtered}
          isLight={isLight}
          fmtNGN={fmtNGN}
          onUpdate={update}
          onDelete={handleDelete}
          onEdit={setEditingCard}
        />
      )}
      {viewMode === "matrix" && (
        <MatrixView
          items={filtered}
          isLight={isLight}
          fmtNGN={fmtNGN}
          onUpdate={update}
          onDelete={handleDelete}
          onEdit={setEditingCard}
        />
      )}

      {filtered.length === 0 && (
        <div className={cn("text-center py-20 rounded-2xl", isLight ? "bg-slate-50 border border-slate-200" : "glass-card")}>
          <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className={cn("text-lg font-medium", isLight ? "text-gray-700" : "text-foreground")}>No BD items found</h3>
          <p className="text-muted-foreground text-sm mt-1">Create a new opportunity or adjust your filters.</p>
        </div>
      )}

      {editingCard && (
        <EditBDModal item={editingCard} users={users || []} onUpdate={update} onClose={() => setEditingCard(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────────── Portfolio View ─────────────────────────── */
function PortfolioView({ items, isLight, fmtNGN, onUpdate, onDelete, onEdit }: any) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {items.map((item: any) => (
        <BDCard key={item.id} item={item} isLight={isLight} fmtNGN={fmtNGN} onUpdate={onUpdate} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </div>
  );
}

/* ─────────────────────────────── List View ──────────────────────────────── */
function ListView({ items, isLight, fmtNGN, onUpdate, onDelete, onEdit }: any) {
  if (items.length === 0) return null;
  return (
    <div className={cn("rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-card/60")}>
      {items.map((item: any, idx: number) => {
        const sc = isLight ? STATUS_COLORS_LIGHT : STATUS_COLORS;
        return (
          <div key={item.id} className={cn(
            "flex items-center gap-4 px-5 py-4 transition-colors",
            idx !== 0 && (isLight ? "border-t border-slate-100" : "border-t border-white/5"),
            isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
          )}>
            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <p className={cn("font-semibold text-sm truncate", isLight ? "text-gray-900" : "text-foreground")}>{item.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {item.productType && <span className="text-xs text-muted-foreground">{item.productType}</span>}
                {item.customerName && <span className="text-xs text-muted-foreground">· {item.customerName}</span>}
              </div>
            </div>

            {/* Stage badge */}
            <span className={cn("hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize", STAGE_COLORS[item.stage] || "text-muted-foreground bg-white/5")}>
              {item.stage?.replace(/_/g, ' ')}
            </span>

            {/* Status badge */}
            <span className={cn("hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize", sc[item.status] || "border-white/10 text-muted-foreground")}>
              {item.status?.replace(/_/g, ' ')}
            </span>

            {/* Priority */}
            <span className={cn("hidden lg:inline text-xs font-medium capitalize", PRIORITY_COLORS[item.priority] || "text-muted-foreground")}>
              {item.priority}
            </span>

            {/* Due date */}
            <span className="hidden xl:inline text-xs text-muted-foreground whitespace-nowrap">
              {item.targetDate ? format(new Date(item.targetDate), "MMM d, yyyy") : "—"}
            </span>

            {/* Assignee avatars */}
            <div className="flex items-center gap-0.5">
              {(item.assignees || []).slice(0, 3).map((a: any) => (
                <div key={a.id} title={a.name} className="w-6 h-6 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 border border-white/20 flex items-center justify-center text-white text-[10px] font-bold">
                  {a.name.charAt(0)}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button onClick={() => onEdit(item)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-slate-100 text-slate-400 hover:text-slate-700" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}>
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(item.id, item.name)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── Matrix View ────────────────────────────── */
type SortKey = "name" | "stage" | "status" | "priority" | "targetDate" | "customerName" | "costTarget";

const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function MatrixView({ items, isLight, fmtNGN, onUpdate, onDelete, onEdit }: any) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (items.length === 0) return null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...items].sort((a, b) => {
    let va: any, vb: any;
    if (sortKey === "priority") { va = PRIORITY_ORDER[a.priority] ?? 0; vb = PRIORITY_ORDER[b.priority] ?? 0; }
    else if (sortKey === "targetDate") { va = a.targetDate ? new Date(a.targetDate).getTime() : 0; vb = b.targetDate ? new Date(b.targetDate).getTime() : 0; }
    else if (sortKey === "costTarget") { va = parseFloat(a.costTarget) || 0; vb = parseFloat(b.costTarget) || 0; }
    else { va = (a[sortKey] || "").toLowerCase(); vb = (b[sortKey] || "").toLowerCase(); }
    return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const thCls = cn("px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left cursor-pointer select-none whitespace-nowrap",
    isLight ? "text-slate-500 hover:text-slate-700" : "text-muted-foreground hover:text-foreground"
  );
  const tdCls = cn("px-4 py-3 text-sm", isLight ? "text-gray-700" : "text-foreground/80");
  const sc = isLight ? STATUS_COLORS_LIGHT : STATUS_COLORS;

  return (
    <div className={cn("rounded-2xl border overflow-x-auto", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-card/60")}>
      <table className="w-full min-w-[800px]">
        <thead>
          <tr className={cn("border-b", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <th className={thCls} onClick={() => handleSort("name")}>
              <span className="flex items-center gap-1">Title <SortIcon k="name" /></span>
            </th>
            <th className={thCls} onClick={() => handleSort("stage")}>
              <span className="flex items-center gap-1">Stage <SortIcon k="stage" /></span>
            </th>
            <th className={thCls} onClick={() => handleSort("status")}>
              <span className="flex items-center gap-1">Status <SortIcon k="status" /></span>
            </th>
            <th className={thCls} onClick={() => handleSort("priority")}>
              <span className="flex items-center gap-1">Priority <SortIcon k="priority" /></span>
            </th>
            <th className={thCls} onClick={() => handleSort("customerName")}>
              <span className="flex items-center gap-1">Customer <SortIcon k="customerName" /></span>
            </th>
            <th className={thCls}>Product Type</th>
            <th className={thCls} onClick={() => handleSort("costTarget")}>
              <span className="flex items-center gap-1">Cost Target <SortIcon k="costTarget" /></span>
            </th>
            <th className={thCls} onClick={() => handleSort("targetDate")}>
              <span className="flex items-center gap-1">Due Date <SortIcon k="targetDate" /></span>
            </th>
            <th className={thCls}>Team</th>
            <th className={cn(thCls, "text-right cursor-default")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item: any, idx: number) => (
            <tr key={item.id} className={cn(
              "transition-colors",
              idx !== 0 && (isLight ? "border-t border-slate-100" : "border-t border-white/5"),
              isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
            )}>
              <td className={cn(tdCls, "font-medium max-w-[200px]")}>
                <span className="line-clamp-1">{item.name}</span>
              </td>
              <td className={tdCls}>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize", STAGE_COLORS[item.stage] || "text-muted-foreground bg-white/5")}>
                  {item.stage?.replace(/_/g, ' ')}
                </span>
              </td>
              <td className={tdCls}>
                <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize", sc[item.status] || "border-white/10 text-muted-foreground")}>
                  {item.status?.replace(/_/g, ' ')}
                </span>
              </td>
              <td className={tdCls}>
                <span className={cn("text-xs font-semibold capitalize", PRIORITY_COLORS[item.priority] || "text-muted-foreground")}>
                  {item.priority}
                </span>
              </td>
              <td className={cn(tdCls, "text-xs")}>{item.customerName || "—"}</td>
              <td className={cn(tdCls, "text-xs")}>{item.productType || "—"}</td>
              <td className={cn(tdCls, "text-xs")}>
                {item.costTarget ? (() => {
                  const usd = parseFloat(item.costTarget);
                  const ngn = fmtNGN(usd);
                  return (
                    <div className="leading-tight">
                      <span className="font-semibold text-green-500">${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      {ngn !== "—" && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{ngn}</p>}
                    </div>
                  );
                })() : "—"}
              </td>
              <td className={cn(tdCls, "text-xs whitespace-nowrap")}>
                {item.targetDate ? format(new Date(item.targetDate), "MMM d, yyyy") : "—"}
              </td>
              <td className={tdCls}>
                <div className="flex items-center gap-0.5">
                  {(item.assignees || []).slice(0, 3).map((a: any) => (
                    <div key={a.id} title={a.name} className="w-6 h-6 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 border border-white/20 flex items-center justify-center text-white text-[10px] font-bold">
                      {a.name.charAt(0)}
                    </div>
                  ))}
                  {item.assignees?.length > 3 && <span className="text-xs text-muted-foreground ml-1">+{item.assignees.length - 3}</span>}
                </div>
              </td>
              <td className={tdCls}>
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={() => onEdit(item)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-slate-100 text-slate-400 hover:text-slate-700" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(item.id, item.name)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────── Portfolio Card ────────────────────────── */
function BDCard({ item, isLight, fmtNGN, onUpdate, onDelete, onEdit }: { item: any; isLight: boolean; fmtNGN: (v: number) => string; onUpdate: any; onDelete: any; onEdit: any }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(item.name);

  const saveTitle = async () => {
    if (!titleVal.trim()) return;
    await onUpdate(item.id, { name: titleVal });
    setEditingTitle(false);
  };

  const cls = cn(
    "h-8 rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground",
    isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/30"
  );
  const sc = isLight ? STATUS_COLORS_LIGHT : STATUS_COLORS;

  return (
    <div className={cn("rounded-2xl p-6 flex flex-col relative group", isLight ? "bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow" : "glass-card")}>
      <div className="flex justify-between items-start mb-3">
        <select value={item.stage} onChange={e => onUpdate(item.id, { stage: e.target.value })} className={`${cls} text-xs capitalize`} onClick={e => e.stopPropagation()}>
          {STAGES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}
        </select>
        <select value={item.status} onChange={e => onUpdate(item.id, { status: e.target.value })} className={`${cls} capitalize`} onClick={e => e.stopPropagation()}>
          {STATUSES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {editingTitle ? (
        <div className="flex items-center gap-2 mb-2">
          <input value={titleVal} onChange={e => setTitleVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleVal(item.name); } }}
            className={cn("text-base font-bold bg-transparent border-b border-primary focus:outline-none flex-1", isLight ? "text-gray-900" : "text-foreground")} autoFocus />
          <button onClick={saveTitle} className="text-green-500"><Check className="w-4 h-4" /></button>
          <button onClick={() => { setEditingTitle(false); setTitleVal(item.name); }} className="text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 group/title mb-2">
          <h3 className={cn("text-lg font-bold font-display line-clamp-1 flex-1", isLight ? "text-gray-900" : "text-foreground")}>{item.name}</h3>
          <button onClick={() => setEditingTitle(true)} className="opacity-0 group-hover/title:opacity-100 p-0.5 text-muted-foreground hover:text-foreground shrink-0">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {item.productType && <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-muted-foreground")}>📦 {item.productType}</p>}
      {item.customerName && <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-muted-foreground")}>👤 {item.customerName}</p>}
      {item.customerEmail && <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-muted-foreground")}>✉ {item.customerEmail}</p>}
      {item.customerPhone && <p className={cn("text-xs mb-2", isLight ? "text-slate-500" : "text-muted-foreground")}>📞 {item.customerPhone}</p>}
      {item.description && <p className={cn("text-sm line-clamp-2 mb-3 flex-1", isLight ? "text-slate-600" : "text-muted-foreground")}>{item.description}</p>}

      {item.assignees?.length > 0 && (
        <div className="flex items-center gap-1 mb-3">
          {item.assignees.slice(0, 4).map((a: any) => (
            <div key={a.id} title={a.name} className="w-6 h-6 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 border border-white/20 flex items-center justify-center text-white text-[10px] font-bold">
              {a.name.charAt(0)}
            </div>
          ))}
          {item.assignees.length > 4 && <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs text-muted-foreground">+{item.assignees.length - 4}</div>}
        </div>
      )}

      <div className={cn("mt-auto pt-3 border-t flex items-start justify-between gap-3 text-xs flex-wrap", isLight ? "border-slate-100 text-slate-500" : "border-white/5 text-muted-foreground")}>
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <input type="date"
            value={item.targetDate ? format(new Date(item.targetDate), "yyyy-MM-dd") : ""}
            onChange={e => onUpdate(item.id, { targetDate: e.target.value || null })}
            className={cn("bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/50 rounded cursor-pointer text-xs w-28 min-w-0", isLight ? "text-slate-500" : "text-muted-foreground")}
            title="Set due date" />
        </div>
        {item.costTarget && (() => {
          const usd = parseFloat(item.costTarget);
          const ngn = fmtNGN(usd);
          return (
            <div className="text-right leading-tight">
              <span className="text-green-500 font-semibold">${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {ngn !== "—" && <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-400" : "text-muted-foreground/70")}>{ngn}</p>}
            </div>
          );
        })()}
      </div>

      <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
        <button onClick={() => onEdit(item)} className={cn("p-1.5 rounded-lg", isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-500" : "bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground")} title="Edit all details">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="absolute top-3 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
        <button onClick={() => onDelete(item.id, item.name)} className="p-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Edit Modal ─────────────────────────────── */
function EditBDModal({ item, users, onUpdate, onClose }: { item: any; users: any[]; onUpdate: any; onClose: () => void }) {
  const [form, setForm] = useState({
    name: item.name || "",
    description: item.description || "",
    stage: item.stage || "innovation",
    status: item.status || "in_progress",
    priority: item.priority || "medium",
    productType: item.productType || "",
    customerName: item.customerName || "",
    customerEmail: item.customerEmail || "",
    customerPhone: item.customerPhone || "",
    costTarget: item.costTarget || "",
    startDate: item.startDate ? format(new Date(item.startDate), "yyyy-MM-dd") : "",
    targetDate: item.targetDate ? format(new Date(item.targetDate), "yyyy-MM-dd") : "",
    assigneeIds: (item.assignees || []).map((a: any) => a.id) as number[],
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleAssignee = (id: number) => setForm(f => ({ ...f, assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter(x => x !== id) : [...f.assigneeIds, id] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(item.id, { ...form, costTarget: form.costTarget || undefined, startDate: form.startDate || null, targetDate: form.targetDate || null });
      toast({ title: "Saved!" });
      onClose();
    } catch { toast({ title: "Error saving", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const { theme: _editTheme } = useTheme();
  const isLight = _editTheme === "light";
  const cls = cn("flex h-10 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20");
  const lbl = cn("text-sm font-medium", isLight ? "text-gray-900" : "");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={cn("sm:max-w-[640px] max-h-[90vh] overflow-y-auto", isLight ? "bg-white border-gray-200 [&>button]:text-gray-900 [&>button]:opacity-100" : "glass-panel border-white/10 bg-card/95")}>
        <DialogHeader><DialogTitle className="text-xl font-display">Edit BD Item — {item.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5"><label className={lbl}>Title *</label><input value={form.name} onChange={e => setF("name", e.target.value)} className={cls} /></div>
            <div className="sm:col-span-2 space-y-1.5"><label className={lbl}>Description</label><textarea value={form.description} onChange={e => setF("description", e.target.value)} className={cn("flex min-h-[60px] w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20")} /></div>
            <div className="space-y-1.5"><label className={lbl}>Stage</label><select value={form.stage} onChange={e => setF("stage", e.target.value)} className={cls}>{STAGES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}</select></div>
            <div className="space-y-1.5"><label className={lbl}>Status</label><select value={form.status} onChange={e => setF("status", e.target.value)} className={cls}>{STATUSES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}</select></div>
            <div className="space-y-1.5"><label className={lbl}>Priority</label><select value={form.priority} onChange={e => setF("priority", e.target.value)} className={cls}>{PRIORITIES.map(p => <option key={p} value={p} className="bg-card capitalize">{p}</option>)}</select></div>
            <div className="space-y-1.5"><label className={lbl}>Product Type</label><select value={form.productType} onChange={e => setF("productType", e.target.value)} className={cls}><option value="" className="bg-card">Select...</option>{PRODUCT_TYPES.map(p => <option key={p} value={p} className="bg-card">{p}</option>)}</select></div>
            <div className={cn("sm:col-span-2 border-t pt-2", isLight ? "border-gray-100" : "border-white/10")}><p className={cn("text-xs font-semibold uppercase tracking-wide mb-2", isLight ? "text-gray-500" : "text-muted-foreground")}>Customer</p></div>
            <div className="space-y-1.5"><label className={lbl}>Name</label><input value={form.customerName} onChange={e => setF("customerName", e.target.value)} className={cls} placeholder="Customer name" /></div>
            <div className="space-y-1.5"><label className={lbl}>Email</label><input type="email" value={form.customerEmail} onChange={e => setF("customerEmail", e.target.value)} className={cls} placeholder="email@example.com" /></div>
            <div className="space-y-1.5"><label className={lbl}>Phone</label><input value={form.customerPhone} onChange={e => setF("customerPhone", e.target.value)} className={cls} placeholder="+27 xx xxx xxxx" /></div>
            <div className="space-y-1.5"><label className={lbl}>Cost Target (USD $)</label><input type="number" value={form.costTarget} onChange={e => setF("costTarget", e.target.value)} className={cls} placeholder="0.00" /></div>
            <div className="space-y-1.5"><label className={lbl}>Start Date</label><input type="date" value={form.startDate} onChange={e => setF("startDate", e.target.value)} className={cls} /></div>
            <div className="space-y-1.5"><label className={lbl}>Due Date</label><input type="date" value={form.targetDate} onChange={e => setF("targetDate", e.target.value)} className={cls} /></div>
          </div>
          {users.length > 0 && (
            <div className="space-y-2">
              <label className={lbl}>Assignees</label>
              <div className={cn("flex flex-wrap gap-2 p-3 rounded-xl border max-h-28 overflow-y-auto", isLight ? "border-gray-200 bg-gray-50" : "border-white/10 bg-black/10")}>
                {users.map(u => (
                  <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all", form.assigneeIds.includes(u.id) ? "bg-primary text-white border-primary" : isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", isLight ? "bg-gray-100 text-gray-700" : "bg-white/10")}>{u.name.charAt(0)}</span>
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────── Create Modal ───────────────────────────── */
function CreateBDModal({ users, onCreate }: { users: any[]; onCreate: (data: any) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const emptyForm = { name: "", description: "", stage: "innovation", status: "in_progress", priority: "medium", productType: "", customerName: "", customerEmail: "", customerPhone: "", startDate: "", targetDate: "", costTarget: "", assigneeIds: [] as number[] };
  const [form, setForm] = useState(emptyForm);
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleAssignee = (id: number) => setForm(f => ({ ...f, assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter(x => x !== id) : [...f.assigneeIds, id] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      await onCreate({ ...form, productType: form.productType || undefined, customerName: form.customerName || undefined, customerEmail: form.customerEmail || undefined, customerPhone: form.customerPhone || undefined, costTarget: form.costTarget || undefined, startDate: form.startDate || null, targetDate: form.targetDate || null });
      toast({ title: "BD item created!", description: form.name });
      setOpen(false);
      setForm(emptyForm);
    } catch { toast({ title: "Error", description: "Failed to create", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const { theme: _createTheme } = useTheme();
  const isLight = _createTheme === "light";
  const cls = cn("flex h-10 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20");
  const lbl = cn("text-sm font-medium", isLight ? "text-gray-900" : "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> New BD Item</Button></DialogTrigger>
      <DialogContent className={cn("sm:max-w-[620px] max-h-[90vh] overflow-y-auto", isLight ? "bg-white border-gray-200 [&>button]:text-gray-900 [&>button]:opacity-100" : "glass-panel border-white/10 bg-card/95")}>
        <DialogHeader><DialogTitle className="text-xl font-display">New Business Development</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5"><label className={lbl}>Title *</label><input required value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Seasoning Launch for Client X" className={cls} /></div>
            <div className="sm:col-span-2 space-y-1.5"><label className={lbl}>Description</label><textarea value={form.description} onChange={e => setF("description", e.target.value)} placeholder="BD opportunity details..." className={cn("flex min-h-[60px] w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20")} /></div>
            <div className="space-y-1.5"><label className={lbl}>Stage</label><select value={form.stage} onChange={e => setF("stage", e.target.value)} className={cls}>{STAGES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}</select></div>
            <div className="space-y-1.5"><label className={lbl}>Status</label><select value={form.status} onChange={e => setF("status", e.target.value)} className={cls}>{STATUSES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g,' ')}</option>)}</select></div>
            <div className="space-y-1.5"><label className={lbl}>Priority</label><select value={form.priority} onChange={e => setF("priority", e.target.value)} className={cls}>{PRIORITIES.map(p => <option key={p} value={p} className="bg-card capitalize">{p}</option>)}</select></div>
            <div className="space-y-1.5"><label className={lbl}>Product Type</label><select value={form.productType} onChange={e => setF("productType", e.target.value)} className={cls}><option value="" className="bg-card">Select type...</option>{PRODUCT_TYPES.map(p => <option key={p} value={p} className="bg-card">{p}</option>)}</select></div>
            <div className={cn("sm:col-span-2 border-t pt-2", isLight ? "border-gray-100" : "border-white/10")}><p className={cn("text-xs font-semibold uppercase tracking-wide mb-2", isLight ? "text-gray-500" : "text-muted-foreground")}>Customer Info</p></div>
            <div className="space-y-1.5"><label className={lbl}>Customer Name</label><input value={form.customerName} onChange={e => setF("customerName", e.target.value)} placeholder="Customer name" className={cls} /></div>
            <div className="space-y-1.5"><label className={lbl}>Email</label><input type="email" value={form.customerEmail} onChange={e => setF("customerEmail", e.target.value)} placeholder="email@example.com" className={cls} /></div>
            <div className="space-y-1.5"><label className={lbl}>Phone</label><input value={form.customerPhone} onChange={e => setF("customerPhone", e.target.value)} placeholder="+27 xx xxx xxxx" className={cls} /></div>
            <div className="space-y-1.5"><label className={lbl}>Cost Target (USD $)</label><input type="number" value={form.costTarget} onChange={e => setF("costTarget", e.target.value)} placeholder="0.00" className={cls} /></div>
            <div className="space-y-1.5"><label className={lbl}>Start Date</label><input type="date" value={form.startDate} onChange={e => setF("startDate", e.target.value)} className={cls} /></div>
            <div className="space-y-1.5"><label className={lbl}>Due Date</label><input type="date" value={form.targetDate} onChange={e => setF("targetDate", e.target.value)} className={cls} /></div>
          </div>
          {users.length > 0 && (
            <div className="space-y-2">
              <label className={lbl}>Assignees</label>
              <div className={cn("flex flex-wrap gap-2 p-3 rounded-xl border max-h-28 overflow-y-auto", isLight ? "border-gray-200 bg-gray-50" : "border-white/10 bg-black/10")}>
                {users.map(u => (
                  <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all", form.assigneeIds.includes(u.id) ? "bg-primary text-white border-primary" : isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", isLight ? "bg-gray-100 text-gray-700" : "bg-white/10")}>{u.name.charAt(0)}</span>
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={cn("flex justify-end gap-3 pt-2 border-t", isLight ? "border-gray-100" : "border-white/10")}>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create BD Item"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
