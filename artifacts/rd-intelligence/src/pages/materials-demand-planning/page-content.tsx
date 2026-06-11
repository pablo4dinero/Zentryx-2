import * as React from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, Edit3, Trash2, Download, Search, Loader2, X } from "lucide-react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useListUsers } from "@/api-client";
import { displayLabel, useServerProductTypes } from "@/lib/project-options";
import { CustomOptionsSelect } from "@/components/ui/CustomOptionsSelect";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import SalesForecastPage from "@/pages/sales-force/Forecast";
import StrategyEvaluatorTab from "@/pages/strategy-evaluator";
import { ProductionAnalyticsTab } from "./production-analytics";
import { ProductionOrdersTab } from "./tabs/ProductionOrdersTab";
import { MonthlyOrdersTab } from "./tabs/MonthlyOrdersTab";
import { ProductionPlanningTab } from "./tabs/ProductionPlanningTab";
import { ProductionHistoryTab } from "./tabs/ProductionHistoryTab";
import { UrgencyBadge, VolumeTag } from "./components/Badges";
import type { Account } from "./lib/types";
import { BASE, DEFAULT_FORM, SF_URGENCY } from "./lib/constants";
import { authHeaders, formatDate } from "./lib/helpers";
import { downloadCsv } from "./lib/exports";

export function MaterialsDemandPlanningPageContent(props: { productsQuery: UseQueryResult<Account[], Error> }) {
  const { productsQuery } = props;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState("customer-products");
  const [search, setSearch] = React.useState("");
  const [urgencyFilter, setUrgencyFilter] = React.useState("all");
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Account | null>(null);
  const [formValues, setFormValues] = React.useState({ ...DEFAULT_FORM });
  const [manSearch, setManSearch] = React.useState("");
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
    const saved = localStorage.getItem("mdp_column_widths");
    return saved ? JSON.parse(saved) : {};
  });
  const [resizingColumn, setResizingColumn] = React.useState<string | null>(null);
  const typeOpts = useServerProductTypes();

  const { data: users } = useListUsers();

  // Column resize handlers
  const handleMouseDown = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    setResizingColumn(columnKey);
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey] || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(80, startWidth + diff);
      setColumnWidths(prev => {
        const updated = { ...prev, [columnKey]: newWidth };
        localStorage.setItem("mdp_column_widths", JSON.stringify(updated));
        return updated;
      });
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const getColumnWidth = (columnKey: string) => {
    const width = columnWidths[columnKey];
    return width ? `${width}px` : undefined;
  };

  const products = productsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/accounts`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsAddOpen(false);
      setFormValues({ ...DEFAULT_FORM });
      setManSearch("");
      toast({ title: "Product added", description: "New account record was saved." });
    },
    onError: (error: any) => {
      toast({ title: "Could not save", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!editingProduct) throw new Error("No account selected");
      const res = await fetch(`${BASE}api/accounts/${editingProduct.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ ...payload, updatedAt: editingProduct.updatedAt }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        if (error.error === "Conflict") throw new Error("conflict");
        throw new Error(error.error || "Failed to update account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsEditOpen(false);
      setEditingProduct(null);
      toast({ title: "Product updated", description: "Account information was updated." });
    },
    onError: (error: any) => {
      if (error?.message === "conflict") {
        toast({ title: "Edit conflict", description: "Someone else updated this record. Please close, refresh and try again.", variant: "destructive" });
      } else {
        toast({ title: "Could not update", description: error?.message || "Try again.", variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/accounts/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Product removed", description: "The account record was deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Could not delete", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const { theme } = useTheme();
  const isLight = theme === "light";
  const creating = createMutation.status === "pending";
  const updating = updateMutation.status === "pending";

  const filteredUsers = React.useMemo(
    () => (users || []).filter((u: any) => u.name.toLowerCase().includes(manSearch.toLowerCase())),
    [users, manSearch]
  );

  const toggleManager = (id: number) => {
    setFormValues(f => ({
      ...f,
      accountManagers: f.accountManagers.includes(id)
        ? f.accountManagers.filter(x => x !== id)
        : [...f.accountManagers, id],
    }));
  };

  const filteredProducts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((a) => {
      const matchesSearch =
        !term ||
        [a.company, a.productName ?? "", a.productType ?? "", (a.accountManagerNames || []).join(" ")].some((v) =>
          v.toLowerCase().includes(term)
        );
      const matchesUrgency = urgencyFilter === "all" || a.urgencyLevel === urgencyFilter;
      return matchesSearch && matchesUrgency;
    });
  }, [products, search, urgencyFilter]);

  type SortKey = "account" | "productType" | "volume" | "managers" | "urgency" | "added";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Urgency ordering matches the visible severity: urgent > medium > normal.
  const URGENCY_RANK: Record<string, number> = { urgent: 3, medium: 2, normal: 1 };

  const sortedProducts = React.useMemo(() => {
    if (!sortKey) return filteredProducts;
    const sign = sortDir === "asc" ? 1 : -1;
    const get = (a: Account): string | number => {
      switch (sortKey) {
        case "account":     return (a.company ?? "").toLowerCase();
        case "productType": return (a.productType ?? "").toLowerCase();
        case "volume":      return parseFloat(a.volume || "0") || 0;
        case "managers":    return (a.accountManagerNames || []).join(", ").toLowerCase();
        case "urgency":     return URGENCY_RANK[(a.urgencyLevel ?? "").toLowerCase()] ?? 0;
        case "added":       return new Date(a.createdAt).getTime() || 0;
      }
    };
    return [...filteredProducts].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va < vb) return -1 * sign;
      if (va > vb) return  1 * sign;
      return 0;
    });
  }, [filteredProducts, sortKey, sortDir]);

  const SortHeader = ({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) => {
    const active = sortKey === k;
    return (
      <th className={cn("px-5 py-3 font-medium", align === "right" ? "text-right" : "text-left")}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn("inline-flex items-center gap-1 text-xs uppercase tracking-wide transition-colors",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
          <span className="text-[9px] leading-none">
            {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  const summary = React.useMemo(() => {
    const total = products.length;
    const urgentCount = products.filter((a) => a.urgencyLevel === "urgent").length;
    const totalVolume = products.reduce((sum, a) => sum + parseFloat(a.volume || "0"), 0);
    const averageVolume = total ? Math.round(totalVolume / total) : 0;
    const recentCount = products.filter((a) => {
      const date = new Date(a.createdAt);
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);
      return date >= threshold;
    }).length;
    return { total, averageVolume, urgentCount, recentCount, totalVolume };
  }, [products]);

  const openEditForm = (account: Account) => {
    setEditingProduct(account);
    setFormValues({
      company: account.company,
      productName: account.productName ?? "",
      productType: account.productType ?? "",
      customerType: account.customerType ?? "new",
      contactPerson: account.contactPerson ?? "",
      cpPhone: account.cpPhone ?? "",
      cpEmail: account.cpEmail ?? "",
      application: account.application ?? "",
      targetPrice: account.targetPrice ?? "",
      volume: account.volume ?? "",
      urgencyLevel: account.urgencyLevel ?? "normal",
      competitorReference: account.competitorReference ?? "",
      accountManagers: account.accountManagers ?? [],
    });
    setManSearch("");
    setIsEditOpen(true);
  };

  const submitForm = async () => {
    if (!formValues.company || !formValues.productName || !formValues.productType) {
      toast({ title: "Company, Product Name and Product Type are required", variant: "destructive" });
      return;
    }
    const payload = { ...formValues };
    if (editingProduct && isEditOpen) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const openAddForm = () => {
    setEditingProduct(null);
    setFormValues({ ...DEFAULT_FORM });
    setManSearch("");
    setIsAddOpen(true);
  };

  const openEditDialog = (account: Account) => {
    openEditForm(account);
  };

  const MDP_TABS = [
    { value: "customer-products", label: "Customer Products" },
    { value: "monthly-orders", label: "Monthly Orders" },
    { value: "production-orders", label: "Production Orders" },
    { value: "production-planning", label: "Production Planning" },
    { value: "production-history", label: "Production History" },
    { value: "strategy-evaluator", label: "Strategy Evaluator" },
    { value: "production-analytics", label: "Analytics", beta: true },
    { value: "forecast", label: "Forecast" },
  ] as const;
  type MdpTab = typeof MDP_TABS[number]["value"];

  return (
    <div className="space-y-0">
      <div className="mb-5 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" /> Materials & Demand Planning
          </h1>
          <p className="text-muted-foreground mt-1">Manage raw materials, demand forecasting, and procurement planning.</p>
        </div>
      </div>

      <div className={cn("flex gap-1 p-1 rounded-2xl border mb-6 w-fit max-w-full overflow-x-auto custom-scrollbar",
        isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10"
      )}>
        {MDP_TABS.map(tab => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value as MdpTab)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
              activeTab === tab.value
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {activeTab === "customer-products" && <ErrorBoundary label="Customer Products">{(
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Total accounts", value: summary.total },
                  { label: "Urgent", value: summary.urgentCount },
                  { label: "Total volume", value: `${summary.totalVolume.toLocaleString()} kg` },
                  { label: "Avg. volume", value: `${summary.averageVolume.toLocaleString()} kg` },
                  { label: "Recent (30d)", value: summary.recentCount },
                ].map(stat => (
                  <div key={stat.label} className={cn("rounded-2xl border p-5",
                    isLight ? "border-slate-200 bg-white shadow-sm" : "border-white/5 bg-white/5"
                  )}>
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search company or product"
                      className={cn("h-9 pl-9 pr-4 rounded-xl border text-sm w-60 focus:outline-none focus:ring-2 focus:ring-primary/50",
                        isLight ? "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground"
                      )}
                    />
                  </div>
                  <select
                    value={urgencyFilter}
                    onChange={(event) => setUrgencyFilter(event.target.value)}
                    className={cn("h-9 px-3 rounded-xl border text-sm focus:outline-none cursor-pointer",
                      isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground"
                    )}
                  >
                    <option value="all">All urgencies</option>
                    <option value="normal">Normal</option>
                    <option value="medium">Medium</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={() => downloadCsv(sortedProducts as Account[])}
                    className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-all",
                      isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                    )}>
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button onClick={openAddForm}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4" /> Add Product
                  </button>
                </div>
              </div>

            {/* ── Customer Products Table ── */}
            <div className={cn("glass-card rounded-2xl overflow-x-auto custom-scrollbar border", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
              <table className="w-full text-sm min-w-[760px]">
                <thead className={cn("text-xs text-muted-foreground border-b", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/5")}>
                  <tr>
                    <th className="relative group" style={{ width: getColumnWidth("account") }}>
                      <div className="px-5 py-3 font-medium">
                        <SortHeader label="Account" k="account" />
                      </div>
                      <div
                        onMouseDown={(e) => handleMouseDown(e, "account")}
                        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                          resizingColumn === "account" ? "bg-primary" : "bg-transparent")}
                        title="Drag to resize"
                      />
                    </th>
                    <th className="relative group" style={{ width: getColumnWidth("productType") }}>
                      <div className="px-5 py-3 font-medium">
                        <SortHeader label="Product Type" k="productType" />
                      </div>
                      <div
                        onMouseDown={(e) => handleMouseDown(e, "productType")}
                        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                          resizingColumn === "productType" ? "bg-primary" : "bg-transparent")}
                        title="Drag to resize"
                      />
                    </th>
                    <th className="relative group" style={{ width: getColumnWidth("volume") }}>
                      <div className="px-5 py-3 font-medium">
                        <SortHeader label="Volume (kg)" k="volume" />
                      </div>
                      <div
                        onMouseDown={(e) => handleMouseDown(e, "volume")}
                        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                          resizingColumn === "volume" ? "bg-primary" : "bg-transparent")}
                        title="Drag to resize"
                      />
                    </th>
                    <th className="relative group" style={{ width: getColumnWidth("managers") }}>
                      <div className="px-5 py-3 font-medium">
                        <SortHeader label="Manager(s)" k="managers" />
                      </div>
                      <div
                        onMouseDown={(e) => handleMouseDown(e, "managers")}
                        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                          resizingColumn === "managers" ? "bg-primary" : "bg-transparent")}
                        title="Drag to resize"
                      />
                    </th>
                    <th className="relative group" style={{ width: getColumnWidth("urgency") }}>
                      <div className="px-5 py-3 font-medium">
                        <SortHeader label="Urgency" k="urgency" />
                      </div>
                      <div
                        onMouseDown={(e) => handleMouseDown(e, "urgency")}
                        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                          resizingColumn === "urgency" ? "bg-primary" : "bg-transparent")}
                        title="Drag to resize"
                      />
                    </th>
                    <th className="relative group" style={{ width: getColumnWidth("added") }}>
                      <div className="px-5 py-3 font-medium">
                        <SortHeader label="Added" k="added" />
                      </div>
                      <div
                        onMouseDown={(e) => handleMouseDown(e, "added")}
                        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                          resizingColumn === "added" ? "bg-primary" : "bg-transparent")}
                        title="Drag to resize"
                      />
                    </th>
                    <th className="px-5 py-3 text-left font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                        No accounts match the current filters.
                      </td>
                    </tr>
                  ) : (
                    sortedProducts.map((account) => (
                      <tr key={account.id}
                        className={cn("border-b last:border-0 transition-colors group",
                          isLight ? "border-slate-100 hover:bg-slate-50/70" : "border-white/5 hover:bg-white/[0.03]"
                        )}>
                        <td className="px-5 py-3" style={{ width: getColumnWidth("account") }}>
                          <p className="font-medium text-foreground text-sm">{account.company}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{account.productName ?? "—"}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground" style={{ width: getColumnWidth("productType") }}>
                          {account.productType ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-xs" style={{ width: getColumnWidth("volume") }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground font-medium">{parseFloat(account.volume || "0").toLocaleString()}</span>
                            <VolumeTag volume={account.volume} />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground" style={{ width: getColumnWidth("managers") }}>
                          {(account.accountManagerNames || []).join(", ") || "—"}
                        </td>
                        <td className="px-5 py-3" style={{ width: getColumnWidth("urgency") }}><UrgencyBadge level={account.urgencyLevel} /></td>
                        <td className="px-5 py-3 text-xs text-muted-foreground" style={{ width: getColumnWidth("added") }}>{formatDate(account.createdAt)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditDialog(account)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="Edit">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteMutation.mutate(account.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className={cn("px-5 py-2.5 text-xs text-muted-foreground border-t", isLight ? "border-slate-100" : "border-white/5")}>
                Showing {sortedProducts.length} of {products.length} accounts
              </div>
            </div>

            {/* ── Add Product Modal ── */}
            <AnimatePresence>
              {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={cn("border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
                    <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">Add Product</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Create a new account record</p>
                      </div>
                      <button onClick={() => setIsAddOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {(() => {
                        const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
                        const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";
                        return (
                          <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className={lCls}>Company *</label>
                                <input value={formValues.company} onChange={e => setFormValues(p => ({ ...p, company: e.target.value }))} placeholder="Company name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Name *</label>
                                <input value={formValues.productName} onChange={e => setFormValues(p => ({ ...p, productName: e.target.value }))} placeholder="Product name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Type *</label>
                                <CustomOptionsSelect
                                  value={formValues.productType}
                                  onChange={v => setFormValues(p => ({ ...p, productType: v }))}
                                  handle={typeOpts}
                                  displayFn={displayLabel}
                                  placeholder="Select product type…"
                                  isLight={isLight}
                                />
                              </div>
                              <div>
                                <label className={lCls}>Customer Type</label>
                                <select value={formValues.customerType} onChange={e => setFormValues(p => ({ ...p, customerType: e.target.value }))} className={iCls + " cursor-pointer"}>
                                  <option value="new" className="bg-white text-black">New Customer</option>
                                  <option value="existing" className="bg-white text-black">Existing Customer</option>
                                </select>
                              </div>
                              <div>
                                <label className={lCls}>Contact Person (CP)</label>
                                <input value={formValues.contactPerson} onChange={e => setFormValues(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Full name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Phone Number</label>
                                <input value={formValues.cpPhone} onChange={e => setFormValues(p => ({ ...p, cpPhone: e.target.value }))} placeholder="+234 xxx xxxx xxxx" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Email</label>
                                <input value={formValues.cpEmail} onChange={e => setFormValues(p => ({ ...p, cpEmail: e.target.value }))} placeholder="email@company.com" type="email" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Application</label>
                                <input value={formValues.application} onChange={e => setFormValues(p => ({ ...p, application: e.target.value }))} placeholder="e.g. Noodles, Chips" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Target Price ($/kg)</label>
                                <input value={formValues.targetPrice} onChange={e => setFormValues(p => ({ ...p, targetPrice: e.target.value }))} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Volume (kg/month)</label>
                                <input value={formValues.volume} onChange={e => setFormValues(p => ({ ...p, volume: e.target.value }))} placeholder="0" type="number" min="0" className={iCls} />
                                {formValues.volume && <div className="mt-1"><VolumeTag volume={formValues.volume} /></div>}
                              </div>
                              <div>
                                <label className={lCls}>Urgency Level</label>
                                <div className="flex gap-2 flex-wrap mt-1">
                                  {SF_URGENCY.map(u => (
                                    <button key={u.value} type="button" onClick={() => setFormValues(p => ({ ...p, urgencyLevel: u.value }))}
                                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                                        formValues.urgencyLevel === u.value ? cn(u.bg, u.color) : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20"
                                      )}>
                                      <span className={cn("w-2 h-2 rounded-full", u.dot)} />{u.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className={lCls}>Competitor Reference</label>
                                <input value={formValues.competitorReference} onChange={e => setFormValues(p => ({ ...p, competitorReference: e.target.value }))} placeholder="Competitor names" className={iCls} />
                              </div>
                            </div>
                            <div>
                              <label className={lCls}>Account Manager(s)</label>
                              <input value={manSearch} onChange={e => setManSearch(e.target.value)} placeholder="Search staff…" className={iCls + " mb-2"} />
                              <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredUsers.map((u: any) => (
                                  <label key={u.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all",
                                    formValues.accountManagers.includes(u.id) ? "border-primary/30 bg-primary/10 text-foreground" : isLight ? "border-gray-100 text-gray-600 hover:bg-gray-50" : "border-white/5 text-muted-foreground hover:border-white/10"
                                  )}>
                                    <input type="checkbox" checked={formValues.accountManagers.includes(u.id)} onChange={() => toggleManager(u.id)} className="accent-primary" />
                                    <span className="flex-1">{u.name}</span>
                                    <span className="text-[10px] text-muted-foreground/60">{u.department || u.role?.replace(/_/g, " ")}</span>
                                  </label>
                                ))}
                              </div>
                              {formValues.accountManagers.length > 0 && (
                                <p className="text-xs text-primary mt-1">{formValues.accountManagers.length} manager{formValues.accountManagers.length > 1 ? "s" : ""} selected</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                      <button onClick={submitForm} disabled={creating}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {creating ? "Saving…" : "Add Product"}
                      </button>
                      <button onClick={() => setIsAddOpen(false)}
                        className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ── Edit Product Modal ── */}
            <AnimatePresence>
              {isEditOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={cn("border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
                    <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">Edit Product</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Update account record details</p>
                      </div>
                      <button onClick={() => setIsEditOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {(() => {
                        const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
                        const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";
                        return (
                          <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className={lCls}>Company *</label>
                                <input value={formValues.company} onChange={e => setFormValues(p => ({ ...p, company: e.target.value }))} placeholder="Company name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Name *</label>
                                <input value={formValues.productName} onChange={e => setFormValues(p => ({ ...p, productName: e.target.value }))} placeholder="Product name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Type *</label>
                                <CustomOptionsSelect
                                  value={formValues.productType}
                                  onChange={v => setFormValues(p => ({ ...p, productType: v }))}
                                  handle={typeOpts}
                                  displayFn={displayLabel}
                                  placeholder="Select product type…"
                                  isLight={isLight}
                                />
                              </div>
                              <div>
                                <label className={lCls}>Customer Type</label>
                                <select value={formValues.customerType} onChange={e => setFormValues(p => ({ ...p, customerType: e.target.value }))} className={iCls + " cursor-pointer"}>
                                  <option value="new" className="bg-white text-black">New Customer</option>
                                  <option value="existing" className="bg-white text-black">Existing Customer</option>
                                </select>
                              </div>
                              <div>
                                <label className={lCls}>Contact Person (CP)</label>
                                <input value={formValues.contactPerson} onChange={e => setFormValues(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Full name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Phone Number</label>
                                <input value={formValues.cpPhone} onChange={e => setFormValues(p => ({ ...p, cpPhone: e.target.value }))} placeholder="+234 xxx xxxx xxxx" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Email</label>
                                <input value={formValues.cpEmail} onChange={e => setFormValues(p => ({ ...p, cpEmail: e.target.value }))} placeholder="email@company.com" type="email" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Application</label>
                                <input value={formValues.application} onChange={e => setFormValues(p => ({ ...p, application: e.target.value }))} placeholder="e.g. Noodles, Chips" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Target Price ($/kg)</label>
                                <input value={formValues.targetPrice} onChange={e => setFormValues(p => ({ ...p, targetPrice: e.target.value }))} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Volume (kg/month)</label>
                                <input value={formValues.volume} onChange={e => setFormValues(p => ({ ...p, volume: e.target.value }))} placeholder="0" type="number" min="0" className={iCls} />
                                {formValues.volume && <div className="mt-1"><VolumeTag volume={formValues.volume} /></div>}
                              </div>
                              <div>
                                <label className={lCls}>Urgency Level</label>
                                <div className="flex gap-2 flex-wrap mt-1">
                                  {SF_URGENCY.map(u => (
                                    <button key={u.value} type="button" onClick={() => setFormValues(p => ({ ...p, urgencyLevel: u.value }))}
                                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                                        formValues.urgencyLevel === u.value ? cn(u.bg, u.color) : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20"
                                      )}>
                                      <span className={cn("w-2 h-2 rounded-full", u.dot)} />{u.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className={lCls}>Competitor Reference</label>
                                <input value={formValues.competitorReference} onChange={e => setFormValues(p => ({ ...p, competitorReference: e.target.value }))} placeholder="Competitor names" className={iCls} />
                              </div>
                            </div>
                            <div>
                              <label className={lCls}>Account Manager(s)</label>
                              <input value={manSearch} onChange={e => setManSearch(e.target.value)} placeholder="Search staff…" className={iCls + " mb-2"} />
                              <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredUsers.map((u: any) => (
                                  <label key={u.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all",
                                    formValues.accountManagers.includes(u.id) ? "border-primary/30 bg-primary/10 text-foreground" : isLight ? "border-gray-100 text-gray-600 hover:bg-gray-50" : "border-white/5 text-muted-foreground hover:border-white/10"
                                  )}>
                                    <input type="checkbox" checked={formValues.accountManagers.includes(u.id)} onChange={() => toggleManager(u.id)} className="accent-primary" />
                                    <span className="flex-1">{u.name}</span>
                                    <span className="text-[10px] text-muted-foreground/60">{u.department || u.role?.replace(/_/g, " ")}</span>
                                  </label>
                                ))}
                              </div>
                              {formValues.accountManagers.length > 0 && (
                                <p className="text-xs text-primary mt-1">{formValues.accountManagers.length} manager{formValues.accountManagers.length > 1 ? "s" : ""} selected</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                      <button onClick={submitForm} disabled={updating}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                        {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                        {updating ? "Saving…" : "Save Changes"}
                      </button>
                      <button onClick={() => setIsEditOpen(false)}
                        className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
          )}</ErrorBoundary>}

          {activeTab === "production-orders" && <ErrorBoundary label="Production Orders"><ProductionOrdersTab /></ErrorBoundary>}

          {activeTab === "monthly-orders" && <ErrorBoundary label="Monthly Orders"><MonthlyOrdersTab /></ErrorBoundary>}

          {activeTab === "strategy-evaluator" && <ErrorBoundary label="Strategy Evaluator"><StrategyEvaluatorTab /></ErrorBoundary>}

          {activeTab === "production-planning" && <ErrorBoundary label="Production Planning"><ProductionPlanningTab /></ErrorBoundary>}

          {activeTab === "production-analytics" && <ErrorBoundary label="Analytics"><ProductionAnalyticsTab isLight={isLight} /></ErrorBoundary>}

          {activeTab === "production-history" && <ErrorBoundary label="Production History"><ProductionHistoryTab /></ErrorBoundary>}

          {activeTab === "forecast" && <ErrorBoundary label="Forecast"><SalesForecastPage /></ErrorBoundary>}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
