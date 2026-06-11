import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit3, Trash2, Download, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { Account, MonthlyOrder } from "../lib/types";
import { BASE } from "../lib/constants";
import { authHeaders, formatDate } from "../lib/helpers";
import { downloadMonthlyOrdersCsv, downloadMonthlyOrdersXlsx } from "../lib/exports";

export function MonthlyOrdersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";

  // Get current year and month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const defaultMonth = `${currentYear}-${currentMonth}`;

  const [selectedMonth, setSelectedMonth] = React.useState(defaultMonth);
  const [isAddRowOpen, setIsAddRowOpen] = React.useState(false);
  const [editingOrderId, setEditingOrderId] = React.useState<number | null>(null);
  const [editingOrder, setEditingOrder] = React.useState<Partial<MonthlyOrder> | null>(null);
  const [addRowForm, setAddRowForm] = React.useState({
    accountId: "",
    productDescription: "",
    volumeKg: "",
    dateOrdered: "",
    expectedDeliveryDateDate: "",
  });

  // Fetch accounts for dropdown
  const accountsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json() as Promise<Account[]>;
    },
  });

  // Fetch monthly orders
  const monthlyOrdersQuery = useQuery({
    queryKey: ["/api/mdp/monthly-orders", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/monthly-orders?month=${selectedMonth}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch monthly orders");
      return res.json() as Promise<MonthlyOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  // Update monthly order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: number;
      updates: Partial<MonthlyOrder>;
    }) => {
      const res = await fetch(`${BASE}api/mdp/monthly-orders/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update order");
      }
      return res.json();
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({
        queryKey: ["/api/mdp/monthly-orders", selectedMonth],
      });
      const previous = queryClient.getQueryData([
        "/api/mdp/monthly-orders",
        selectedMonth,
      ]) as MonthlyOrder[] | undefined;
      queryClient.setQueryData(["/api/mdp/monthly-orders", selectedMonth], (old: MonthlyOrder[] | undefined) => {
        if (!old) return old;
        return old.map((order) => (order.id === id ? { ...order, ...updates } : order));
      });
      return { previous };
    },
    onError: (err: any, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["/api/mdp/monthly-orders", selectedMonth],
          context.previous
        );
      }
      toast({
        title: "Update failed",
        description: err?.message || "Could not update order",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/mdp/monthly-orders", selectedMonth],
      });
    },
  });

  // Add row mutation
  const addRowMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/monthly-orders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to add order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/mdp/monthly-orders", selectedMonth],
      });
      toast({
        title: "Order added",
        description: "New monthly order created successfully",
      });
      setIsAddRowOpen(false);
      setAddRowForm({
        accountId: "",
        productDescription: "",
        volumeKg: "",
        dateOrdered: "",
        expectedDeliveryDateDate: "",
      });
    },
  });

  // Delete row mutation
  const deleteRowMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/monthly-orders/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/mdp/monthly-orders", selectedMonth],
      });
      toast({
        title: "Order deleted",
        description: "Monthly order removed successfully",
      });
    },
  });

  const handleAddRow = () => {
    if (!addRowForm.accountId || !addRowForm.productDescription || !addRowForm.volumeKg) {
      toast({
        title: "Missing fields",
        description: "Please fill in Customer, Product Description, and Volume KG",
        variant: "destructive",
      });
      return;
    }

    addRowMutation.mutate({
      month: selectedMonth,
      accountId: Number(addRowForm.accountId),
      customerName: accountsQuery.data?.find(a => String(a.id) === addRowForm.accountId)?.company || "",
      productDescription: addRowForm.productDescription,
      volumeKg: Number(addRowForm.volumeKg),
      dateOrdered: addRowForm.dateOrdered || new Date().toISOString().slice(0, 10),
      expectedDeliveryDateDate: addRowForm.expectedDeliveryDateDate || new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      productionStatus: "Pending",
      distributionType: "Delivery",
      packingStatus: "Not Packed",
      deliveryStatus: "No",
    });
  };

  // Group orders by accountId
  const groupedOrders = React.useMemo(() => {
    if (!monthlyOrdersQuery.data) return [];
    const grouped = new Map<number, MonthlyOrder[]>();
    monthlyOrdersQuery.data.forEach((order) => {
      if (!grouped.has(order.accountId)) {
        grouped.set(order.accountId, []);
      }
      grouped.get(order.accountId)!.push(order);
    });
    return Array.from(grouped.entries()).map(([accountId, orders]) => ({
      accountId,
      customerName: orders[0]?.customerName || "Unknown",
      productCount: orders.length,
      orders,
    }));
  }, [monthlyOrdersQuery.data]);

  // Generate month/year options (current year and next year)
  const monthOptions = React.useMemo(() => {
    const options = [];
    for (let y = currentYear - 1; y <= currentYear + 1; y++) {
      for (let m = 1; m <= 12; m++) {
        const month = String(m).padStart(2, "0");
        const label = new Date(y, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
        options.push({ value: `${y}-${month}`, label });
      }
    }
    return options;
  }, [currentYear]);

  if (monthlyOrdersQuery.isLoading) return <PageLoader />;

  const iCls = cn(
    "w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground",
    isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30"
  );
  const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";

  return (
    <div className="space-y-5">
      {/* Header with month selector and export buttons */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="month-selector">
            Choose a month
          </label>
          <select
            id="month-selector"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className={cn(
              "h-10 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
              isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
            )}
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadMonthlyOrdersXlsx(monthlyOrdersQuery.data || [])}
            className={cn(
              "flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight
                ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            onClick={() => downloadMonthlyOrdersCsv(monthlyOrdersQuery.data || [])}
            className={cn(
              "flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight
                ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => setIsAddRowOpen(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white text-xs font-semibold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
        </div>
      </div>

      {/* Monthly Orders Table */}
      <div className={cn("border rounded-2xl overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
        <table className="w-full text-sm">
          <thead>
            <tr className={cn("border-b", isLight ? "bg-slate-50 border-slate-100" : "bg-black/40 border-white/5")}>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Customer Name</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Product Description</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Volume (KG)</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Date Ordered</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Expected Delivery</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Production Status</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Distribution</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Packing</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Delivery</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {groupedOrders.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No orders for this month
                </td>
              </tr>
            ) : (
              groupedOrders.map((group) =>
                group.orders.map((order, idx) => {
                  const isFirstRow = idx === 0;
                  return (
                    <tr key={order.id} className={cn("border-b", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                      {/* Customer Name - only show on first row of group */}
                      <td className="px-4 py-3 text-xs">
                        {isFirstRow ? (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{group.customerName}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {group.productCount} product{group.productCount !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">↳</span>
                        )}
                      </td>

                      {/* Product Description */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">{order.productDescription}</td>

                      {/* Volume KG */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">{order.volumeKg}</td>

                      {/* Date Ordered */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(order.dateOrdered)}</td>

                      {/* Expected Delivery */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(order.expectedDeliveryDate)}</td>

                      {/* Production Status */}
                      <td className="px-4 py-3">
                        <select
                          value={order.productionStatus}
                          onChange={(e) =>
                            updateOrderMutation.mutate({
                              id: order.id,
                              updates: { productionStatus: e.target.value },
                            })
                          }
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                            order.productionStatus === "Pending"
                              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                              : order.productionStatus === "In Process"
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                              : order.productionStatus === "Produced"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : order.productionStatus === "Warehouse"
                              ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                              : "bg-sky-500/10 border-sky-500/20 text-sky-400"
                          )}
                        >
                          <option value="Pending" className="bg-black text-white">
                            Pending
                          </option>
                          <option value="In Process" className="bg-black text-white">
                            In Process
                          </option>
                          <option value="Produced" className="bg-black text-white">
                            Produced
                          </option>
                          <option value="Warehouse" className="bg-black text-white">
                            Warehouse
                          </option>
                          <option value="Dispatch" className="bg-black text-white">
                            Dispatch
                          </option>
                        </select>
                      </td>

                      {/* Distribution Type */}
                      <td className="px-4 py-3">
                        <select
                          value={order.distributionType}
                          onChange={(e) =>
                            updateOrderMutation.mutate({
                              id: order.id,
                              updates: { distributionType: e.target.value },
                            })
                          }
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                            order.distributionType === "Pick Up"
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          )}
                        >
                          <option value="Pick Up" className="bg-black text-white">
                            Pick Up
                          </option>
                          <option value="Delivery" className="bg-black text-white">
                            Delivery
                          </option>
                        </select>
                      </td>

                      {/* Packing Status */}
                      <td className="px-4 py-3">
                        <select
                          value={order.packingStatus}
                          onChange={(e) =>
                            updateOrderMutation.mutate({
                              id: order.id,
                              updates: { packingStatus: e.target.value },
                            })
                          }
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                            order.packingStatus === "Not Packed"
                              ? "bg-red-500/10 border-red-500/20 text-red-400"
                              : order.packingStatus === "Partially Packed"
                              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          )}
                        >
                          <option value="Not Packed" className="bg-black text-white">
                            Not Packed
                          </option>
                          <option value="Partially Packed" className="bg-black text-white">
                            Partially Packed
                          </option>
                          <option value="Completed" className="bg-black text-white">
                            Completed
                          </option>
                        </select>
                      </td>

                      {/* Delivery Status */}
                      <td className="px-4 py-3">
                        <select
                          value={order.deliveryStatus}
                          onChange={(e) =>
                            updateOrderMutation.mutate({
                              id: order.id,
                              updates: { deliveryStatus: e.target.value },
                            })
                          }
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                            order.deliveryStatus === "Yes"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : "bg-red-500/10 border-red-500/20 text-red-400"
                          )}
                        >
                          <option value="Yes" className="bg-black text-white">
                            Yes
                          </option>
                          <option value="No" className="bg-black text-white">
                            No
                          </option>
                        </select>
                      </td>

                      {/* Action Buttons */}
                      <td className="px-4 py-3 flex gap-1">
                        <button
                          onClick={() => {
                            setEditingOrderId(order.id);
                            setEditingOrder({ ...order });
                          }}
                          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteRowMutation.mutate(order.id)}
                          disabled={deleteRowMutation.isPending}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )
            )}
          </tbody>
        </table>
        <div className={cn("px-4 py-2.5 text-xs text-muted-foreground border-t", isLight ? "border-slate-100" : "border-white/5")}>
          Showing {monthlyOrdersQuery.data?.length || 0} orders
        </div>
      </div>

      {/* Add Row Modal */}
      <AnimatePresence>
        {isAddRowOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col",
                isLight ? "bg-white border-gray-200" : "glass-panel border-white/10"
              )}
            >
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Add Monthly Order</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a new monthly order</p>
                </div>
                <button
                  onClick={() => setIsAddRowOpen(false)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground"
                  )}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className={lCls}>Customer *</label>
                  <select
                    value={addRowForm.accountId}
                    onChange={(e) => setAddRowForm((p) => ({ ...p, accountId: e.target.value }))}
                    className={iCls + " cursor-pointer"}
                  >
                    <option value="" className="bg-black text-white">
                      Select customer…
                    </option>
                    {accountsQuery.data?.map((a) => (
                      <option key={a.id} value={a.id} className="bg-black text-white">
                        {a.company}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lCls}>Product Description *</label>
                  <input
                    value={addRowForm.productDescription}
                    onChange={(e) => setAddRowForm((p) => ({ ...p, productDescription: e.target.value }))}
                    placeholder="e.g., Premium Blend Mix"
                    className={iCls}
                  />
                </div>
                <div>
                  <label className={lCls}>Volume (KG) *</label>
                  <input
                    value={addRowForm.volumeKg}
                    onChange={(e) => setAddRowForm((p) => ({ ...p, volumeKg: e.target.value }))}
                    placeholder="0"
                    type="number"
                    min="0"
                    className={iCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lCls}>Date Ordered</label>
                    <input
                      value={addRowForm.dateOrdered}
                      onChange={(e) => setAddRowForm((p) => ({ ...p, dateOrdered: e.target.value }))}
                      type="date"
                      className={iCls}
                    />
                  </div>
                  <div>
                    <label className={lCls}>Expected Delivery</label>
                    <input
                      value={addRowForm.expectedDeliveryDateDate}
                      onChange={(e) => setAddRowForm((p) => ({ ...p, expectedDeliveryDateDate: e.target.value }))}
                      type="date"
                      className={iCls}
                    />
                  </div>
                </div>
              </div>
              <div className={cn("flex justify-end gap-3 px-6 py-4 border-t", isLight ? "border-gray-100" : "border-white/5")}>
                <button
                  onClick={() => setIsAddRowOpen(false)}
                  className={cn(
                    "px-4 h-9 rounded-xl text-xs font-semibold border transition-all",
                    isLight
                      ? "border-gray-200 text-gray-700 hover:bg-gray-100"
                      : "border-white/10 text-muted-foreground hover:bg-white/10"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRow}
                  disabled={addRowMutation.isPending}
                  className="px-4 h-9 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {addRowMutation.isPending ? "Adding..." : "Add Order"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {editingOrderId !== null && editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col",
                isLight ? "bg-white border-gray-200" : "glass-panel border-white/10"
              )}
            >
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Edit Monthly Order</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Update order details</p>
                </div>
                <button
                  onClick={() => {
                    setEditingOrderId(null);
                    setEditingOrder(null);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground"
                  )}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className={lCls}>Product Description</label>
                  <input
                    value={editingOrder.productDescription || ""}
                    onChange={(e) => setEditingOrder(p => ({ ...p, productDescription: e.target.value }))}
                    placeholder="e.g., Premium Blend Mix"
                    className={iCls}
                  />
                </div>
                <div>
                  <label className={lCls}>Volume (KG)</label>
                  <input
                    value={editingOrder.volumeKg || ""}
                    onChange={(e) => setEditingOrder(p => ({ ...p, volumeKg: Number(e.target.value) }))}
                    placeholder="0"
                    type="number"
                    min="0"
                    className={iCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lCls}>Date Ordered</label>
                    <input
                      value={editingOrder.dateOrdered?.slice(0, 10) || ""}
                      onChange={(e) => setEditingOrder(p => ({ ...p, dateOrdered: e.target.value }))}
                      type="date"
                      className={iCls}
                    />
                  </div>
                  <div>
                    <label className={lCls}>Expected Delivery *</label>
                    <input
                      value={editingOrder.expectedDeliveryDateDate?.slice(0, 10) || ""}
                      onChange={(e) => setEditingOrder(p => ({ ...p, expectedDeliveryDateDate: e.target.value }))}
                      type="date"
                      className={iCls}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className={cn("flex justify-end gap-3 px-6 py-4 border-t", isLight ? "border-gray-100" : "border-white/5")}>
                <button
                  onClick={() => {
                    setEditingOrderId(null);
                    setEditingOrder(null);
                  }}
                  className={cn(
                    "px-4 h-9 rounded-xl text-xs font-semibold border transition-all",
                    isLight
                      ? "border-gray-200 text-gray-700 hover:bg-gray-100"
                      : "border-white/10 text-muted-foreground hover:bg-white/10"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!editingOrder.expectedDeliveryDateDate) {
                      toast({
                        title: "Missing fields",
                        description: "Expected Delivery date is required",
                        variant: "destructive",
                      });
                      return;
                    }
                    updateOrderMutation.mutate({
                      id: editingOrderId,
                      updates: {
                        productDescription: editingOrder.productDescription,
                        volumeKg: editingOrder.volumeKg,
                        dateOrdered: editingOrder.dateOrdered,
                        expectedDeliveryDateDate: editingOrder.expectedDeliveryDateDate,
                      },
                    });
                    setEditingOrderId(null);
                    setEditingOrder(null);
                  }}
                  disabled={updateOrderMutation.isPending}
                  className="px-4 h-9 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {updateOrderMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

