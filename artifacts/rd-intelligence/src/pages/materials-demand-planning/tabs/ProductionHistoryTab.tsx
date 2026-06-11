import * as React from "react";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Download, Search, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetCurrentUser } from "@/api-client";
import type { Account, ProducedOrder, ProductionHistoryView, ProductionOrder } from "../lib/types";
import { BASE } from "../lib/constants";
import { authHeaders, formatDateTime, getHistoryRangeLabel, getCurrentWeekLabel } from "../lib/helpers";
import { downloadProductionHistoryCsv, downloadProductionHistoryXlsx } from "../lib/exports";

export function ProductionHistoryTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  // Only admins can clear lists or delete individual rows. Everyone else can
  // still update delivery status / Return to Floor Planning.
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = ((currentUser?.role as string | undefined) ?? "").toLowerCase() === "admin";
  const [view, setView] = React.useState<ProductionHistoryView>("weekly");
  const [selectedWeek, setSelectedWeek] = React.useState<string>(getCurrentWeekLabel());
  const [pendingSearch, setPendingSearch] = React.useState("");
  const [historySearch, setHistorySearch] = React.useState("");
  const [splitPct, setSplitPct] = React.useState(38);
  const [clearConfirm, setClearConfirm] = React.useState<"pending" | "history" | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  const allOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to load orders"); }
      return res.json() as Promise<ProductionOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  }) as UseQueryResult<ProductionOrder[], Error>;

  const historyAccountsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json() as Promise<{id: number; company: string; productName: string | null; productType: string | null}[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  const historyAccountMap = React.useMemo(() => {
    const map: Record<number, {company: string; productName: string | null; productType: string | null}> = {};
    (historyAccountsQuery.data ?? []).forEach(a => { map[a.id] = { company: a.company, productName: a.productName, productType: a.productType }; });
    return map;
  }, [historyAccountsQuery.data]);

  const pendingOrders = React.useMemo(() => {
    return (allOrdersQuery.data ?? []).filter(o => !o.isPlanned);
  }, [allOrdersQuery.data]);

  const producedHistoryQuery = useQuery({
    queryKey: ["/api/mdp/produced-orders", view, selectedWeek],
    queryFn: async () => {
      const params = new URLSearchParams({ view });
      if (view === "weekly") params.set("week", selectedWeek);
      const res = await fetch(`${BASE}api/mdp/produced-orders?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load production history");
      }
      return (await res.json()) as ProducedOrder[];
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  }) as UseQueryResult<ProducedOrder[], Error>;

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/mdp/produced-orders`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to clear history");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders"] });
      setClearConfirm(null);
      toast({ title: "History cleared", description: "All production history records have been removed." });
    },
    onError: () => toast({ title: "Error", description: "Could not clear history.", variant: "destructive" }),
  });

  const deliverMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${BASE}api/mdp/produced-orders/${id}/deliver`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update delivery status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders", view] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      toast({ title: "Status updated", description: "Production order status has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Could not update status", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const deletePendingMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/production-orders/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to delete order"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders"] });
      toast({ title: "Order deleted", description: "Pending order removed from the system." });
    },
    onError: (error: any) => toast({ title: "Could not delete order", description: error?.message || "Try again.", variant: "destructive" }),
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/produced-orders/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to delete record"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders"] });
      toast({ title: "Record deleted", description: "History entry removed." });
    },
    onError: (error: any) => toast({ title: "Could not delete record", description: error?.message || "Try again.", variant: "destructive" }),
  });

  const returnToPlanningMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/produced-orders/${id}/return-to-planning`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to return to planning"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      toast({ title: "Returned to Floor Planning", description: "The order is back on the original floor and day." });
    },
    onError: (error: any) => toast({ title: "Could not return to planning", description: error?.message || "Try again.", variant: "destructive" }),
  });

  const producedOrders = React.useMemo(
    () => (producedHistoryQuery.data ?? []).slice().sort((a, b) => new Date(b.producedAt).getTime() - new Date(a.producedAt).getTime()),
    [producedHistoryQuery.data]
  );

  const filteredPending = React.useMemo(() => {
    const term = pendingSearch.trim().toLowerCase();
    if (!term) return pendingOrders;
    return pendingOrders.filter(o => {
      const acc = historyAccountMap[o.accountId ?? 0];
      return [acc?.company ?? o.accountName ?? "", acc?.productName ?? o.productName ?? "", o.productType ?? ""]
        .join(" ").toLowerCase().includes(term);
    });
  }, [pendingOrders, pendingSearch, historyAccountMap]);

  const filteredHistory = React.useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    if (!term) return producedOrders;
    return producedOrders.filter(o =>
      [o.accountName, o.productName, o.productType, o.deliveryStatus].join(" ").toLowerCase().includes(term)
    );
  }, [producedOrders, historySearch]);

  const rangeLabel = React.useMemo(() => {
    if (view === "weekly") {
      const [yr, wk] = selectedWeek.split("-W").map(Number);
      const jan1 = new Date(yr, 0, 1);
      const dayOffset = (wk - 1) * 7 - jan1.getDay() + 1;
      const start = new Date(yr, 0, 1 + dayOffset);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return getHistoryRangeLabel(view);
  }, [view, selectedWeek]);

  const startDrag = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(70, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPct(pct);
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  if (producedHistoryQuery.isLoading) {
    return <PageLoader />;
  }

  const inputCls = cn("h-8 pl-8 pr-3 rounded-lg border text-xs w-full focus:outline-none focus:ring-2 focus:ring-primary/50",
    isLight ? "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground");

  return (
    <div className="space-y-4">
      {/* ── Confirm clear dialog ── */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={cn("rounded-2xl border p-6 w-80 shadow-2xl", isLight ? "bg-white border-slate-200" : "bg-[#0f1117] border-white/10")}>
            <h3 className="text-sm font-bold text-foreground mb-2">
              {clearConfirm === "history" ? "Clear Production History?" : "Clear Pending Orders view?"}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {clearConfirm === "history"
                ? "This will permanently delete all production history records."
                : "This will clear the search filter on pending orders."}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setClearConfirm(null)} className={cn("px-4 py-2 rounded-xl text-xs font-medium border", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>Cancel</button>
              <button onClick={() => {
                if (clearConfirm === "history") clearHistoryMutation.mutate();
                else { setPendingSearch(""); setClearConfirm(null); }
              }} className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600">
                {clearHistoryMutation.isPending ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Split layout: Pending (left) | History (right) ── */}
      {/* Definite height so each inner panel's overflow-y-auto clamps and
          scrolls independently instead of bubbling to the page. */}
      <div ref={containerRef} className={cn("flex h-[calc(100vh-280px)] min-h-[480px] rounded-2xl border overflow-hidden select-none", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>

        {/* ── LEFT: Pending Orders ── */}
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
          <div className={cn("px-4 py-3 border-b shrink-0", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Pending Orders</h3>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", pendingOrders.length > 0 ? "bg-amber-500/10 text-amber-400" : isLight ? "bg-slate-100 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                  {filteredPending.length}
                </span>
              </div>
              {isAdmin && (
                <button onClick={() => setClearConfirm("pending")} className="text-[10px] text-red-400 hover:text-red-300 font-medium">Clear</button>
              )}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} placeholder="Search pending orders…" className={inputCls} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredPending.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">{pendingOrders.length === 0 ? "All orders planned" : "No results"}</p>
                  <p className="text-xs text-muted-foreground mt-1">{pendingOrders.length === 0 ? "No pending production orders." : "Try a different search term."}</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className={cn("text-xs text-muted-foreground border-b sticky top-0 z-10", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1117] border-white/5")}>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Vol.</th>
                    <th className="px-3 py-2.5 text-left font-medium">Material</th>
                    {isAdmin && <th className="w-9" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map(order => {
                    // Backend enriches with account data, use it directly
                    const company = order.accountName ?? order.company ?? order.accountCompany ?? "—";
                    const productName = order.productName ?? null;
                    const productTypeKey = order.productType ?? null;
                    const rawMat = order.rawMaterialStatus ?? "Pending";
                    return (
                      <tr key={order.id} className={cn("group border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-foreground text-xs leading-tight truncate max-w-[130px]">{company}</p>
                          {productName && <p className="text-[10px] text-muted-foreground truncate max-w-[130px]">{productName}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-muted-foreground">{productTypeKey ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold">{Number(order.volume ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            rawMat === "Available" ? "bg-emerald-500/10 text-emerald-400" :
                            rawMat === "Not Available" ? "bg-red-500/10 text-red-400" :
                            "bg-amber-500/10 text-amber-400"
                          )}>{rawMat}</span>
                        </td>
                        {isAdmin && (
                          <td className="px-2 py-2.5 text-right">
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete pending order "${company}"? This removes it from the system.`)) {
                                  deletePendingMutation.mutate(order.id);
                                }
                              }}
                              title="Delete pending order"
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── DRAG HANDLE ── */}
        <div onMouseDown={startDrag}
          className={cn("w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group transition-colors",
            isLight ? "bg-slate-200 hover:bg-primary/30" : "bg-white/10 hover:bg-primary/40")}>
          <div className={cn("w-0.5 h-8 rounded-full transition-colors", isLight ? "bg-slate-400 group-hover:bg-primary" : "bg-white/20 group-hover:bg-primary")} />
        </div>

        {/* ── RIGHT: Production History ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className={cn("px-4 py-3 border-b shrink-0", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Production History</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Viewing: {rangeLabel}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className={cn("flex gap-0.5 p-0.5 rounded-xl border", isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10")}>
                  {(["daily", "weekly", "monthly", "yearly"] as ProductionHistoryView[]).map((option) => (
                    <button key={option} type="button" onClick={() => setView(option)}
                      className={cn("rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all",
                        view === option ? "bg-primary text-white shadow-sm" : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
                      )}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </button>
                  ))}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn("flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-medium border transition-all",
                      isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                    )}>
                      <Download className="w-3.5 h-3.5" /> Export
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[160px]">
                    <DropdownMenuItem onClick={() => downloadProductionHistoryCsv(producedOrders, view)}>Export CSV</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => downloadProductionHistoryXlsx(producedOrders, view)}>Export XLSX</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {isAdmin && (
                  <button onClick={() => setClearConfirm("history")} className="text-[10px] text-red-400 hover:text-red-300 font-medium h-8 px-2">Clear History</button>
                )}
              </div>
            </div>
            {view === "weekly" && (
              <div className="flex items-center gap-2 mb-2">
                <label className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">Week:</label>
                <input type="week" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
                  className={cn("h-7 px-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                    isLight ? "bg-white border-slate-200 text-slate-800" : "bg-black/20 border-white/10 text-foreground [color-scheme:dark]")} />
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search history…" className={inputCls} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredHistory.length === 0 ? (
              <div className="flex h-full items-center justify-center p-10 text-center">
                <div>
                  <p className="text-base font-semibold text-foreground">{producedOrders.length === 0 ? "No production history yet." : "No results"}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{producedOrders.length === 0 ? "Click \"Produced\" on any floor assignment in Production Planning." : "Try a different search term."}</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className={cn("text-xs text-muted-foreground border-b sticky top-0 z-10", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1117] border-white/5")}>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">Product Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Volume (KG)</th>
                    <th className="px-3 py-2.5 text-left font-medium">Produced At</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Action</th>
                    {isAdmin && <th className="w-9" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((order) => (
                    <tr key={order.id} className={cn("group border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-foreground text-sm leading-tight">{order.accountName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{order.productName}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{order.productType ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-sm">{Number(order.volume ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(order.producedAt)}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                          order.deliveryStatus === "Delivered" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          order.deliveryStatus === "Stored in Warehouse" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          order.deliveryStatus === "In process" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                          "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          {order.deliveryStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={cn("px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors",
                              isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
                            )}>Update Status ▾</button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[210px]">
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "Delivered" })}>Mark as Delivered</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "Stored in Warehouse" })}>Stored in Warehouse</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "In process" })}>In process</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                if (window.confirm("Return this order to Floor Planning? It will reappear on its original floor and day, and be removed from Production History.")) {
                                  returnToPlanningMutation.mutate(order.id);
                                }
                              }}
                              className="text-amber-500 focus:text-amber-500"
                            >
                              Return to Floor Planning
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-3 text-right">
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete this history entry for ${order.accountName}?`)) {
                                deleteHistoryMutation.mutate(order.id);
                              }
                            }}
                            title="Delete history entry"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

