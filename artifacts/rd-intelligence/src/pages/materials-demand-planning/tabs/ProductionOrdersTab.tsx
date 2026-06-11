import * as React from "react";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Download, Search, Loader2, Settings, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { usePlannedOrders } from "../planned-orders-context";
import type { Account, BlendSpeed, MergedOrder, ProductionOrder, SFOrder } from "../lib/types";
import { BASE, DEFAULT_BLEND_SPEEDS, LS_BLEND_SPEEDS, LS_ORDER_BLENDSPEED, MICROBIAL_OPTIONS } from "../lib/constants";
import { authHeaders, blendSpeedColor, calcPriorityScore, getMicrobialColor, parseBlendSpeedsFromStorage, priorityScoreStyle } from "../lib/helpers";
import { downloadProductionOrdersCsv, downloadProductionOrdersXlsx } from "../lib/exports";
import { ConfigurationDialog } from "../components/ConfigurationDialog";

export function ProductionOrdersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { addPlannedOrder, removePlannedOrder, isPlanningOrder } = usePlannedOrders();
  const [searchOrders, setSearchOrders] = React.useState("");
  const [ordersViewMode, setOrdersViewMode] = React.useState<"daily" | "weekly" | "monthly">("weekly");
  const [microbialById, setMicrobialById] = React.useState<Record<number, string>>({});
  const [rawMaterialById, setRawMaterialById] = React.useState<Record<number, string>>({});
  const [blendSpeeds, setBlendSpeeds] = React.useState<BlendSpeed[]>(() => {
    try { return parseBlendSpeedsFromStorage(JSON.parse(localStorage.getItem(LS_BLEND_SPEEDS) || "null")); }
    catch { return DEFAULT_BLEND_SPEEDS; }
  });
  const [blendSpeedById, setBlendSpeedById] = React.useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_ORDER_BLENDSPEED) || "null") ?? {}; }
    catch { return {}; }
  });
  const [isConfigOpen, setIsConfigOpen] = React.useState(false);
  const [isNewOrderOpen, setIsNewOrderOpen] = React.useState(false);
  const [newOrderForm, setNewOrderForm] = React.useState({
    accountId: "", volume: "", price: "", expectedDeliveryDateDate: "",
    rawMaterialStatus: "Pending", microbialAnalysis: "Normal",
  });

  const accountsForOrderQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json() as Promise<{id: number; company: string; productName: string | null; productType: string | null}[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });
  const orderAccounts = accountsForOrderQuery.data ?? [];

  const accountTypeMap = React.useMemo(() => {
    const map: Record<number, string | null> = {};
    orderAccounts.forEach(a => { map[a.id] = a.productType; });
    return map;
  }, [orderAccounts]);

  const mdpOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load production orders");
      }
      return res.json() as Promise<ProductionOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  }) as UseQueryResult<ProductionOrder[], Error>;

  const mdpOrderBySalesId = React.useMemo(() => {
    const map: Record<number, ProductionOrder> = {};
    (mdpOrdersQuery.data ?? []).forEach(o => {
      if (o.salesOrderId != null) map[o.salesOrderId] = o;
    });
    return map;
  }, [mdpOrdersQuery.data]);

  const sfOrdersQuery = useQuery({
    queryKey: ["/api/production-orders", ordersViewMode],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/production-orders?period=${ordersViewMode}`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load orders");
      }
      return res.json() as Promise<SFOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  const mergedOrders = React.useMemo((): MergedOrder[] => {
    const sfOrders = sfOrdersQuery.data ?? [];
    return sfOrders
      .map(sf => {
        const mdpOrder = mdpOrderBySalesId[sf.id];
        if (!mdpOrder) return null;
        return {
          ...mdpOrder,
          sfId: sf.id,
          accountId: sf.accountId,
          accountCompany: sf.accountCompany,
          productName: sf.productName,
          volume: sf.volume,
          productType: mdpOrder.productType ?? accountTypeMap[sf.accountId] ?? null,
          dateOrdered: sf.dateOrdered,
          expectedDeliveryDate: sf.expectedDeliveryDate,
          createdAt: sf.createdAt,
        } as MergedOrder;
      })
      .filter((o): o is MergedOrder => o !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sfOrdersQuery.data, mdpOrderBySalesId, accountTypeMap]);

  const ordersLoading = sfOrdersQuery.isLoading || mdpOrdersQuery.isLoading;

  React.useEffect(() => {
    if (!mergedOrders.length) return;
    setMicrobialById((current) => {
      const next = { ...current };
      mergedOrders.forEach((order) => {
        next[order.id] = order.microbialAnalysis ?? "Normal";
      });
      return next;
    });
    setRawMaterialById((current) => {
      const next = { ...current };
      mergedOrders.forEach((order) => {
        next[order.id] = order.rawMaterialStatus ?? "Pending";
      });
      return next;
    });
    setBlendSpeedById((current) => {
      const next = { ...current };
      mergedOrders.forEach((order) => {
        if (order.blendSpeedId) next[order.id] = order.blendSpeedId;
      });
      return next;
    });
    mergedOrders.forEach((order) => {
      if (order.isPlanned) addPlannedOrder(order.id);
    });
  }, [mergedOrders, addPlannedOrder]);

  const productionUpdate = useMutation({
    mutationFn: async ({ orderId, changes }: { orderId: number; changes: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}api/mdp/production-orders/${orderId}`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify(changes),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        if (error.error === "Conflict") throw new Error("conflict");
        throw new Error(error.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
    },
    onError: (error: any) => {
      if (error?.message === "conflict") {
        toast({ title: "Edit conflict", description: "Someone else updated this order. Please refresh and try again.", variant: "destructive" });
      }
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to create order"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
      setIsNewOrderOpen(false);
      setNewOrderForm({ accountId: "", volume: "", price: "", expectedDeliveryDateDate: "", rawMaterialStatus: "Pending", microbialAnalysis: "Normal" });
      toast({ title: "Order created" });
    },
    onError: (error: any) => toast({ title: "Could not create order", description: error?.message, variant: "destructive" }),
  });

  const handleChangeMicrobial = async (orderId: number, value: string) => {
    setMicrobialById(c => ({ ...c, [orderId]: value }));
    try { await productionUpdate.mutateAsync({ orderId, changes: { microbialAnalysis: value } }); }
    catch { toast({ title: "Could not save", variant: "destructive" }); }
  };

  const handleChangeRawMaterial = async (orderId: number, value: string) => {
    setRawMaterialById(c => ({ ...c, [orderId]: value }));
    try { await productionUpdate.mutateAsync({ orderId, changes: { rawMaterialStatus: value } }); }
    catch { toast({ title: "Could not save", variant: "destructive" }); }
  };

  const handleChangeBlendSpeed = async (orderId: number, value: string) => {
    setBlendSpeedById(c => {
      const next = { ...c, [orderId]: value };
      localStorage.setItem(LS_ORDER_BLENDSPEED, JSON.stringify(next));
      return next;
    });
    // Also save to server so all users see the same blend speed
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { blendSpeedId: value } });
    } catch {
      toast({ title: "Could not save blend speed", variant: "destructive" });
    }
  };

  const handleSaveBlendSpeeds = (speeds: BlendSpeed[]) => {
    setBlendSpeeds(speeds);
    localStorage.setItem(LS_BLEND_SPEEDS, JSON.stringify(speeds));
  };

  const handlePlanNow = async (orderId: number) => {
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: "Planned", isPlanned: true } });
      addPlannedOrder(orderId);
      toast({ title: "Order planned", description: "Now visible in Production Planning → Planned Orders." });
    } catch (error: any) {
      toast({ title: "Could not plan order", description: error?.message, variant: "destructive" });
    }
  };

  const handleUnplan = async (orderId: number) => {
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: "Ordered", isPlanned: false } });
      removePlannedOrder(orderId);
      toast({ title: "Order unplanned" });
    } catch (error: any) {
      toast({ title: "Could not unplan", description: error?.message, variant: "destructive" });
    }
  };

  const tableOrders = React.useMemo(() => {
    const term = searchOrders.trim().toLowerCase();
    return mergedOrders.filter((order) => {
      if (!term) return true;
      return [order.accountCompany ?? "", order.productName ?? "", order.productType ?? "", String(order.volume ?? ""), order.dateOrdered ?? ""]
        .join(" ").toLowerCase().includes(term);
    });
  }, [mergedOrders, searchOrders]);

  if (ordersLoading) return <PageLoader />;

  const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
  const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">New Production Orders</h2>
          <p className="text-sm text-muted-foreground">Manage production orders, raw material availability and microbial analysis.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {(["daily", "weekly", "monthly"] as const).map(mode => (
              <button key={mode} onClick={() => setOrdersViewMode(mode)}
                className={cn("rounded-full px-4 py-1.5 text-xs font-semibold transition duration-150",
                  ordersViewMode === mode ? "bg-primary text-white" : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-white/5 text-muted-foreground hover:bg-white/10")}>
                {mode === "daily" ? "Daily" : mode === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIsConfigOpen(true)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-foreground hover:border-white/20 hover:bg-white/5")}>
            <Settings className="w-4 h-4" /> Configuration
          </button>
          <button onClick={() => downloadProductionOrdersCsv(tableOrders)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20")}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => downloadProductionOrdersXlsx(tableOrders)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20")}>
            <Download className="w-4 h-4" /> Export XLSX
          </button>
        </div>
      </div>

      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={searchOrders} onChange={e => setSearchOrders(e.target.value)} placeholder="Search orders..." className={cn("h-9 pl-9 pr-4 rounded-xl border text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/50", isLight ? "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground")} />
      </div>

      <div className={cn("glass-card rounded-2xl overflow-x-auto custom-scrollbar border", isLight ? "border-slate-200 bg-white" : "border-white/5 bg-white/5")}>
        <table className="w-full text-sm">
          <thead className={cn("text-xs text-muted-foreground border-b", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/5")}>
            <tr>
              <th className="px-4 py-3 text-left font-medium">Account</th>
              <th className="px-4 py-3 text-left font-medium">Product Type</th>
              <th className="px-4 py-3 text-right font-medium">Volume (KG)</th>
              <th className="px-4 py-3 text-left font-medium">Order</th>
              <th className="px-4 py-3 text-left font-medium">Expected</th>
              <th className="px-4 py-3 text-left font-medium">Raw Material</th>
              <th className="px-4 py-3 text-left font-medium">Microbial Analysis</th>
              <th className="px-4 py-3 text-left font-medium">Blend Speed</th>
              <th className="px-4 py-3 text-left font-medium">Priority Score</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableOrders.length === 0 ? (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No production orders found.</td></tr>
            ) : (
              tableOrders.map((order) => {
                const microbial = microbialById[order.id] ?? order.microbialAnalysis ?? "Normal";
                const rawMaterial = rawMaterialById[order.id] ?? order.rawMaterialStatus ?? "Pending";
                const planned = order.isPlanned || isPlanningOrder(order.id);
                const blendSpeedId = blendSpeedById[order.id] ?? "";
                return (
                  <tr key={order.sfId ?? order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50/70" : "border-white/5 hover:bg-white/[0.03]")}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground text-sm">{order.accountCompany ?? "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{order.productName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {order.productType ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-sm">{Number(order.volume ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{order.dateOrdered ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{order.expectedDeliveryDate ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select value={rawMaterial} onChange={e => handleChangeRawMaterial(order.id, e.target.value)}
                        className={cn("rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                          rawMaterial === "Available" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          rawMaterial === "Not Available" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        )}>
                        <option value="Available" className="bg-black text-white">Available</option>
                        <option value="Not Available" className="bg-black text-white">Not Available</option>
                        <option value="Pending" className="bg-black text-white">Pending</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", getMicrobialColor(microbial))} />
                        <select value={microbial} onChange={e => handleChangeMicrobial(order.id, e.target.value)}
                          className={cn("rounded-xl border px-2 py-1 text-xs focus:outline-none cursor-pointer",
                            microbial === "Critical" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                            microbial === "Important" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/10 text-foreground"
                          )}>
                          {MICROBIAL_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-black text-white">{opt.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select value={blendSpeedId} onChange={e => handleChangeBlendSpeed(order.id, e.target.value)}
                        className={cn("rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                          blendSpeedId ? blendSpeedColor(blendSpeedId) : isLight ? "border-slate-200 bg-white text-slate-500" : "border-white/10 bg-black/20 text-muted-foreground"
                        )}>
                        <option value="" className="bg-black text-white">— Select —</option>
                        {blendSpeeds.map(s => <option key={s.id} value={s.id} className="bg-black text-white">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const ps = calcPriorityScore(
                          rawMaterial,
                          microbial,
                          blendSpeedId,
                          Number(order.volume ?? 0),
                          order.expectedDeliveryDate,
                        );
                        return (
                          <span className={cn("inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums", priorityScoreStyle(ps))}>
                            {ps > 0 ? `+${ps}` : ps}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => planned ? handleUnplan(order.id) : handlePlanNow(order.id)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap",
                          planned
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                            : isLight ? "border-slate-200 text-slate-700 hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
                              : "border-white/10 text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
                        )}>
                        {planned ? "✓ Un-plan" : "Plan Now"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className={cn("px-4 py-2.5 text-xs text-muted-foreground border-t", isLight ? "border-slate-100" : "border-white/5")}>
          Showing {tableOrders.length} of {mergedOrders.length} production orders
        </div>
      </div>

      {/* ── Configuration Dialog ── */}
      <AnimatePresence>
        {isConfigOpen && (
          <ConfigurationDialog
            open={isConfigOpen}
            onClose={() => setIsConfigOpen(false)}
            blendSpeeds={blendSpeeds}
            onSave={handleSaveBlendSpeeds}
          />
        )}
      </AnimatePresence>

      {/* ── New Production Order Modal ── */}
      <AnimatePresence>
        {isNewOrderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn("border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                <div>
                  <h2 className="text-lg font-bold text-foreground">New Production Order</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a production order from an existing account</p>
                </div>
                <button onClick={() => setIsNewOrderOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className={lCls}>Account *</label>
                  <select value={newOrderForm.accountId} onChange={e => setNewOrderForm(p => ({ ...p, accountId: e.target.value }))} className={iCls + " cursor-pointer"}>
                    <option value="" className="bg-black text-white">Select account…</option>
                    {orderAccounts.map(a => (
                      <option key={a.id} value={a.id} className="bg-black text-white">
                        {a.company}{a.productName ? ` — ${a.productName}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lCls}>Volume (kg) *</label>
                    <input value={newOrderForm.volume} onChange={e => setNewOrderForm(p => ({ ...p, volume: e.target.value }))} placeholder="0" type="number" min="0" className={iCls} />
                  </div>
                  <div>
                    <label className={lCls}>Price ($/kg)</label>
                    <input value={newOrderForm.price} onChange={e => setNewOrderForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                  </div>
                </div>
                <div>
                  <label className={lCls}>Expected Delivery Date</label>
                  <input value={newOrderForm.expectedDeliveryDateDate} onChange={e => setNewOrderForm(p => ({ ...p, expectedDeliveryDateDate: e.target.value }))} type="date" className={iCls} />
                </div>
                <div>
                  <label className={lCls}>Raw Material Status</label>
                  <select value={newOrderForm.rawMaterialStatus} onChange={e => setNewOrderForm(p => ({ ...p, rawMaterialStatus: e.target.value }))} className={iCls + " cursor-pointer"}>
                    <option value="Available" className="bg-black text-white">Available</option>
                    <option value="Not Available" className="bg-black text-white">Not Available</option>
                    <option value="Pending" className="bg-black text-white">Pending</option>
                  </select>
                </div>
                <div>
                  <label className={lCls}>Microbial Analysis</label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {MICROBIAL_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setNewOrderForm(p => ({ ...p, microbialAnalysis: opt.value }))}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                          newOrderForm.microbialAnalysis === opt.value
                            ? opt.value === "Critical" ? "bg-red-500/10 border-red-500/20 text-red-400"
                              : opt.value === "Important" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                            : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20"
                        )}>
                        <span className={cn("w-2 h-2 rounded-full", opt.color)} />{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                <button onClick={() => {
                    if (!newOrderForm.accountId || !newOrderForm.volume) {
                      toast({ title: "Account and Volume are required", variant: "destructive" }); return;
                    }
                    createOrderMutation.mutate({
                      accountId: Number(newOrderForm.accountId),
                      volume: Number(newOrderForm.volume),
                      price: newOrderForm.price || null,
                      expectedDeliveryDateDate: newOrderForm.expectedDeliveryDateDate || null,
                      rawMaterialStatus: newOrderForm.rawMaterialStatus,
                      microbialAnalysis: newOrderForm.microbialAnalysis,
                      orderStatus: "Ordered",
                      isPlanned: false,
                    });
                  }}
                  disabled={createOrderMutation.status === "pending"}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                  {createOrderMutation.status === "pending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {createOrderMutation.status === "pending" ? "Creating…" : "Create Order"}
                </button>
                <button onClick={() => setIsNewOrderOpen(false)} className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

