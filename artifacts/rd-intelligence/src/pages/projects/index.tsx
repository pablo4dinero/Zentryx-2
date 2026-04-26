import { useState, useMemo } from "react";
import { useListProjects, useCreateProject, useDeleteProject, useListUsers, useUpdateProject } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Download, Layers } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { ViewSwitcher, type ViewType } from "./views/ViewSwitcher";
import { PortfolioView } from "./views/PortfolioView";
import { MatrixView } from "./views/MatrixView";
import { ListView } from "./views/ListView";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

const STAGES = ["testing", "reformulation", "innovation", "cost_optimization", "modification"] as const;
const STATUSES = ["approved", "awaiting_feedback", "on_hold", "in_progress", "new_inventory", "cancelled", "pushed_to_live"] as const;
const PRODUCT_TYPES = ["Seasoning", "Snack Dusting", "Bread & Dough Premix", "Dairy Premix", "Functional Blend", "Pasta Sauce", "Sweet Flavour", "Savoury Flavour"] as const;

export default function ProjectsList() {
  const [searchTerm, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"projects" | "export">("projects");
  const [view, setView] = useState<ViewType>("list");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productTypeFilter, setProductTypeFilter] = useState<string>("all");
  const [groupByType, setGroupByType] = useState(false);

  const { data: projects, isLoading } = useListProjects({});
  const { data: users } = useListUsers();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteProject();
  const updateMutation = useUpdateProject();
  const { toast } = useToast();
  const { theme: _plTheme } = useTheme();
  const isLight = _plTheme === "light";

  const handleDateChange = (id: number, date: string) => {
    updateMutation.mutate({ id, data: { targetDate: date || null } as any }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
    });
  };

  const filteredProjects = useMemo(() => {
    return (projects || []).filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((p as any).customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
        ((p as any).productType?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchType = productTypeFilter === "all" || (p as any).productType === productTypeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [projects, searchTerm, statusFilter, productTypeFilter]);

  const handleDelete = (id: number, name: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Project deleted", description: `"${name}" was permanently deleted.` });
      },
    });
  };

  const buildExportRows = (projs: any[]) => {
    const headers = ["ID", "Name", "Stage", "Status", "Product Type", "Customer Name", "Customer Email", "Customer Phone", "Cost Target ($)", "Selling Price ($)", "Volume (kg/Month)", "Revenue/Month ($)", "Start Date", "Due Date", "Assignees", "Tasks", "Progress %", "Created At"];
    const rows = projs.map(p => {
      const sp = p.sellingPrice ? parseFloat(p.sellingPrice) : null;
      const vol = p.volumeKgPerMonth ? parseFloat(p.volumeKgPerMonth) : null;
      const revenue = sp && vol ? sp * vol : "";
      return [
        p.id, p.name, p.stage, p.status,
        (p as any).productType || "",
        (p as any).customerName || "", (p as any).customerEmail || "", (p as any).customerPhone || "",
        (p as any).costTarget || "", sp || "", vol || "", revenue,
        p.startDate ? format(new Date(p.startDate), "yyyy-MM-dd") : "",
        p.targetDate ? format(new Date(p.targetDate), "yyyy-MM-dd") : "",
        ((p as any).assignees || []).map((a: any) => a.name).join("; "),
        p.taskCount,
        p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0,
        format(new Date(p.createdAt), "yyyy-MM-dd"),
      ];
    });
    return { headers, rows };
  };

  const handleExportCSV = () => {
    if (!projects || projects.length === 0) return;
    const { headers, rows } = buildExportRows(projects);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${projects.length} projects exported.` });
  };

  const handleExportXLSX = () => {
    if (!projects || projects.length === 0) return;
    const { headers, rows } = buildExportRows(projects);
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = headers.map(() => ({ wch: 20 }));
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) {
        cell.s = { font: { bold: true }, fill: { fgColor: { rgb: "7C3AED" } }, alignment: { horizontal: "center" } };
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projects");
    XLSX.writeFile(wb, `projects_export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Excel exported", description: `${projects.length} projects exported as XLSX.` });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Project Portfolio</h1>
          <p className="text-muted-foreground mt-1">Manage end-to-end R&D lifecycles.</p>
        </div>
        <div className="flex items-center gap-2">
          <CreateProjectModal users={users || []} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit border border-white/10">
          <button
            onClick={() => setActiveTab("projects")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "projects" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            Projects
          </button>
          <button
            onClick={() => setActiveTab("export")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "export" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Download className="w-4 h-4" /> Export Data
          </button>
        </div>

        {activeTab === "projects" && (
          <ViewSwitcher active={view} onChange={setView} />
        )}
      </div>

      {activeTab === "export" ? (
        <ExportTab projects={projects || []} onExportCSV={handleExportCSV} onExportXLSX={handleExportXLSX} />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search projects..." className="pl-9" value={searchTerm} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${statusFilter === "all" ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              >
                All
              </button>
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border capitalize ${statusFilter === s ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Layers className="w-3.5 h-3.5" /> Product Type:
            </div>
            <select
              value={productTypeFilter}
              onChange={e => setProductTypeFilter(e.target.value)}
              className={cn("h-8 px-3 rounded-lg border text-xs focus:outline-none cursor-pointer",
                isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground"
              )}
            >
              <option value="all">All Types</option>
              {PRODUCT_TYPES.map(t => <option key={t} value={t} className="bg-card">{t}</option>)}
            </select>
            {view === "portfolio" && (
              <button
                onClick={() => setGroupByType(g => !g)}
                className={`ml-auto px-3 py-1 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${groupByType ? "bg-primary/20 text-primary border-primary/40" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              >
                <Layers className="w-3 h-3" /> {groupByType ? "Ungroup" : "Group by Type"}
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
            >
              {view === "portfolio" && (
                <PortfolioView
                  projects={filteredProjects}
                  onDelete={handleDelete}
                  onDateChange={handleDateChange}
                  groupByType={groupByType}
                />
              )}
              {view === "matrix" && <MatrixView projects={filteredProjects} />}
              {view === "list" && <ListView projects={filteredProjects} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

function ExportTab({ projects, onExportCSV, onExportXLSX }: { projects: any[]; onExportCSV: () => void; onExportXLSX: () => void }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const totalRevenue = projects.reduce((acc, p) => {
    const sp = p.sellingPrice ? parseFloat(p.sellingPrice) : 0;
    const vol = p.volumeKgPerMonth ? parseFloat(p.volumeKgPerMonth) : 0;
    return acc + (sp * vol);
  }, 0);

  return (
    <div className="glass-card rounded-2xl p-8">
      <h2 className="text-xl font-display font-bold mb-2">Export Project Data</h2>
      <p className="text-muted-foreground text-sm mb-6">Export all structured project data for reporting and analysis. Includes all project metadata, financial data, and progress metrics.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className={`border rounded-xl p-5 ${isLight ? "border-gray-200" : "border-white/10"}`}>
          <h3 className="font-semibold mb-3">What's Included</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {["Product metadata & type", "Customer name, email, phone", "Project stage & status", "Start date & due date", "Cost targets & selling prices", "Volume & monthly revenue", "Assignee information", "Task progress metrics"].map(item => (
              <li key={item} className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{item}</li>
            ))}
          </ul>
        </div>
        <div className={`border rounded-xl p-5 ${isLight ? "border-gray-200" : "border-white/10"}`}>
          <h3 className="font-semibold mb-3">Export Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Projects:</span><span className={`font-medium ${isLight ? "text-gray-900" : ""}`}>{projects.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Columns:</span><span className={`font-medium ${isLight ? "text-gray-900" : ""}`}>18</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Monthly Revenue:</span><span className="font-medium text-green-500">${totalRevenue.toLocaleString()}</span></div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">CSV format:</span>
              <code className="text-primary">project_export_[date].csv</code>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Excel format:</span>
              <code className="text-primary">projects_export_[date].xlsx</code>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onExportCSV} className="gap-2"><Download className="w-4 h-4" /> Export as CSV</Button>
        <Button onClick={onExportXLSX} variant="outline" className="gap-2 border-green-500/30 text-green-400 hover:bg-green-500/10"><Download className="w-4 h-4" /> Export as Excel (.xlsx)</Button>
      </div>
    </div>
  );
}

function CreateProjectModal({ users }: { users: any[] }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createMutation = useCreateProject();
  const { toast } = useToast();
  const { theme: _cpm } = useTheme();
  const isCpmLight = _cpm === "light";

  const [form, setForm] = useState({
    name: "", description: "", stage: "innovation" as any, status: "in_progress" as any,
    priority: "medium" as any, productType: "" as any,
    customerName: "", customerEmail: "", customerPhone: "",
    startDate: "", targetDate: "", costTarget: "", sellingPrice: "", volumeKgPerMonth: "",
    assigneeIds: [] as number[],
  });

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleAssignee = (id: number) => {
    setForm(f => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter(x => x !== id) : [...f.assigneeIds, id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        name: form.name, description: form.description,
        stage: form.stage, status: form.status, priority: form.priority,
        productType: form.productType || undefined,
        customerName: form.customerName || undefined, customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        costTarget: form.costTarget || undefined,
        sellingPrice: form.sellingPrice || undefined,
        volumeKgPerMonth: form.volumeKgPerMonth || undefined,
        startDate: form.startDate || undefined, targetDate: form.targetDate || undefined,
        assigneeIds: form.assigneeIds,
      } as any,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        setOpen(false);
        toast({ title: "Project created!", description: form.name });
        setForm({ name: "", description: "", stage: "innovation", status: "in_progress", priority: "medium", productType: "", customerName: "", customerEmail: "", customerPhone: "", startDate: "", targetDate: "", costTarget: "", sellingPrice: "", volumeKgPerMonth: "", assigneeIds: [] });
      },
      onError: () => toast({ title: "Error", description: "Failed to create project", variant: "destructive" }),
    });
  };

  const inputCls = `flex h-10 w-full rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground ${isCpmLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20"}`;
  const selectCls = `flex h-10 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground ${isCpmLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20"}`;
  const labelCls = cn("text-sm font-medium", isCpmLight ? "text-gray-900" : "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> New Project</Button>
      </DialogTrigger>
      <DialogContent className={cn("sm:max-w-[650px] max-h-[90vh] overflow-y-auto", isCpmLight ? "bg-white border-gray-200 [&>button]:text-gray-900 [&>button]:opacity-100" : "glass-panel border-white/10 bg-card/95")}>
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className={labelCls}>Project Title *</label>
              <input required value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Project name..." className={inputCls} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={e => setF("description", e.target.value)} placeholder="Project objectives..." className={`flex min-h-[70px] w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground ${isCpmLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20"}`} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Stage</label>
              <select value={form.stage} onChange={e => setF("stage", e.target.value)} className={selectCls}>
                {STAGES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => setF("status", e.target.value)} className={selectCls}>
                {STATUSES.map(s => <option key={s} value={s} className="bg-card capitalize">{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={e => setF("priority", e.target.value)} className={selectCls}>
                {["low", "medium", "high", "critical"].map(p => <option key={p} value={p} className="bg-card capitalize">{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Product Type</label>
              <select value={form.productType} onChange={e => setF("productType", e.target.value)} className={selectCls}>
                <option value="" className="bg-card">Select type...</option>
                {PRODUCT_TYPES.map(p => <option key={p} value={p} className="bg-card">{p}</option>)}
              </select>
            </div>
            <div className={`sm:col-span-2 border-t pt-3 ${isCpmLight ? "border-gray-200" : "border-white/10"}`}>
              <p className={cn("text-sm font-semibold uppercase tracking-wide mb-3", isCpmLight ? "text-gray-500" : "text-muted-foreground")}>Customer Information</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Customer Name</label>
              <input value={form.customerName} onChange={e => setF("customerName", e.target.value)} placeholder="Customer / Client name" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Customer Email</label>
              <input type="email" value={form.customerEmail} onChange={e => setF("customerEmail", e.target.value)} placeholder="customer@email.com" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Customer Phone</label>
              <input value={form.customerPhone} onChange={e => setF("customerPhone", e.target.value)} placeholder="+1 234 567 8900" className={inputCls} />
            </div>
            <div className={`sm:col-span-2 border-t pt-3 ${isCpmLight ? "border-gray-200" : "border-white/10"}`}>
              <p className={cn("text-sm font-semibold uppercase tracking-wide mb-3", isCpmLight ? "text-gray-500" : "text-muted-foreground")}>Financial Details</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Cost Target ($)</label>
              <input type="number" value={form.costTarget} onChange={e => setF("costTarget", e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Selling Price (USD $)</label>
              <input type="number" value={form.sellingPrice} onChange={e => setF("sellingPrice", e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Volume (kg/Month)</label>
              <input type="number" value={form.volumeKgPerMonth} onChange={e => setF("volumeKgPerMonth", e.target.value)} placeholder="0" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setF("startDate", e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Due Date</label>
              <input type="date" value={form.targetDate} onChange={e => setF("targetDate", e.target.value)} className={inputCls} />
            </div>
          </div>

          {users.length > 0 && (
            <div className="space-y-2">
              <label className={labelCls}>Assignees</label>
              <div className={`flex flex-wrap gap-2 p-3 rounded-xl border max-h-32 overflow-y-auto ${isCpmLight ? "border-gray-200 bg-gray-50" : "border-white/10 bg-black/10"}`}>
                {users.map(u => (
                  <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                    className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border", form.assigneeIds.includes(u.id) ? "bg-primary text-white border-primary" : isCpmLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", isCpmLight ? "bg-gray-100 text-gray-700" : "bg-white/10")}>{u.name.charAt(0)}</span>
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
