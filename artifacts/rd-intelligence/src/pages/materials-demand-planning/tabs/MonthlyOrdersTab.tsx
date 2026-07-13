import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { BASE } from "../lib/constants";
import { authHeaders } from "../lib/helpers";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductionOrder = {
  id: number;
  accountId: number;
  accountCompany: string | null;
  productName: string | null;
  volume: string | null;
  dateOrdered: string | null;          // dd/mm/yyyy
  expectedDeliveryDate: string | null; // dd/mm/yyyy
  dateDelivered: string | null;        // dd/mm/yyyy
  createdAt: string | null;
  updatedAt: string | null;
};

type StatusRecord = {
  id: number;
  productionOrderId: number | null;
  productionStatus: string | null;
  distributionType: string | null;
  packingStatus: string | null;
  deliveryStatus: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDMY(dmy: string | null | undefined): Date | null {
  if (!dmy) return null;
  const parts = dmy.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function formatDMY(dmy: string | null | undefined): string {
  if (!dmy) return "—";
  const parsed = parseDMY(dmy);
  if (!parsed) return dmy;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dmyToIso(dmy: string | null | undefined): string {
  if (!dmy) return "";
  const parts = dmy.split("/");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function isoToDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Extract YYYY-MM from a dd/mm/yyyy string */
function dmyToYYYYMM(dmy: string | null | undefined): string {
  if (!dmy) return "";
  const parts = dmy.split("/");
  if (parts.length !== 3) return "";
  const [, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}`;
}

// ── Status select colours ──────────────────────────────────────────────────────

function productionStatusCls(v: string) {
  if (v === "Pending") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  if (v === "In Process") return "bg-blue-500/10 border-blue-500/20 text-blue-400";
  if (v === "Produced") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (v === "Warehouse") return "bg-purple-500/10 border-purple-500/20 text-purple-400";
  return "bg-sky-500/10 border-sky-500/20 text-sky-400";
}

function distributionCls(v: string) {
  return v === "Pick Up"
    ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
}

function packingCls(v: string) {
  if (v === "Not Packed") return "bg-red-500/10 border-red-500/20 text-red-400";
  if (v === "Partially Packed") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
}

function deliveryCls(v: string) {
  return v === "Yes"
    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
    : "bg-red-500/10 border-red-500/20 text-red-400";
}

const SELECT_CLS = "rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none";
const OPT = "bg-black text-white";

// ── Grouped row types ──────────────────────────────────────────────────────────

type OrderRow = ProductionOrder & {
  productionStatus: string;
  distributionType: string;
  packingStatus: string;
  deliveryStatus: string;
  statusRecordId: number | null;
};

type ProductGroup = {
  productName: string;
  orders: OrderRow[];
  totalVolume: number;
};

type CustomerGroup = {
  accountId: number;
  customerName: string;
  productGroups: ProductGroup[];
  totalOrders: number;
  latestUpdate: number; // epoch ms — used for "recently updated" sort
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MonthlyOrdersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = React.useState(defaultMonth);
  const [search, setSearch] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"alpha" | "recent">("alpha");

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<ProductionOrder[]>({
    queryKey: ["/api/production-orders/all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/production-orders?period=all`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch production orders");
      return res.json();
    },
    staleTime: 1000 * 60,
  });

  const { data: statusRecords = [], isLoading: statusLoading } = useQuery<StatusRecord[]>({
    queryKey: ["/api/mdp/monthly-orders/all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/monthly-orders`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch status records");
      return res.json();
    },
    staleTime: 1000 * 60,
  });

  // ── Status update mutation ───────────────────────────────────────────────

  const updateStatus = useMutation({
    mutationFn: async ({
      productionOrderId,
      updates,
      order,
    }: {
      productionOrderId: number;
      updates: Partial<Pick<StatusRecord, "productionStatus" | "distributionType" | "packingStatus" | "deliveryStatus">>;
      order: ProductionOrder;
    }) => {
      const month = dmyToYYYYMM(order.dateOrdered) || defaultMonth;
      const res = await fetch(
        `${BASE}api/mdp/monthly-orders/by-production-order/${productionOrderId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...updates,
            month,
            accountId: order.accountId,
            customerName: order.accountCompany ?? "",
            productDescription: order.productName ?? "",
            volumeKg: order.volume,
            dateOrdered: order.dateOrdered,
            expectedDeliveryDate: order.expectedDeliveryDate,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async ({ productionOrderId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/mdp/monthly-orders/all"] });
      const previous = queryClient.getQueryData<StatusRecord[]>(["/api/mdp/monthly-orders/all"]);
      queryClient.setQueryData<StatusRecord[]>(["/api/mdp/monthly-orders/all"], old => {
        if (!old) return old;
        const existing = old.find(r => r.productionOrderId === productionOrderId);
        if (existing) {
          return old.map(r =>
            r.productionOrderId === productionOrderId ? { ...r, ...updates } : r
          );
        }
        return [...old, {
          id: -productionOrderId,
          productionOrderId,
          productionStatus: updates.productionStatus ?? "Pending",
          distributionType: updates.distributionType ?? "Delivery",
          packingStatus: updates.packingStatus ?? "Not Packed",
          deliveryStatus: updates.deliveryStatus ?? "No",
        }];
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/mdp/monthly-orders/all"], ctx.previous);
      toast({ title: "Update failed", description: "Could not save status change", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/monthly-orders/all"] });
    },
  });

  // ── Delivery date mutation ───────────────────────────────────────────────

  const updateDeliveryDate = useMutation({
    mutationFn: async ({ orderId, dateDelivered }: { orderId: number; dateDelivered: string | null }) => {
      const res = await fetch(`${BASE}api/production-orders/${orderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ dateDelivered }),
      });
      if (!res.ok) throw new Error("Failed to update delivery date");
      return res.json();
    },
    onMutate: async ({ orderId, dateDelivered }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/production-orders/all"] });
      const previous = queryClient.getQueryData<ProductionOrder[]>(["/api/production-orders/all"]);
      queryClient.setQueryData<ProductionOrder[]>(["/api/production-orders/all"], old =>
        old ? old.map(o => o.id === orderId ? { ...o, dateDelivered } : o) : old
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/production-orders/all"], ctx.previous);
      toast({ title: "Update failed", description: "Could not save delivery date", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders/all"] });
    },
  });

  // ── Month options ────────────────────────────────────────────────────────

  const monthOptions = React.useMemo(() => {
    const options = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      for (let m = 1; m <= 12; m++) {
        const val = `${y}-${String(m).padStart(2, "0")}`;
        const label = new Date(y, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
        options.push({ value: val, label });
      }
    }
    return options;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Status lookup map ────────────────────────────────────────────────────

  const statusByProdOrderId = React.useMemo(() => {
    const map = new Map<number, StatusRecord>();
    statusRecords.forEach(r => {
      if (r.productionOrderId != null) map.set(r.productionOrderId, r);
    });
    return map;
  }, [statusRecords]);

  // ── Build customer groups with product sub-groups ────────────────────────

  const customerGroups: CustomerGroup[] = React.useMemo(() => {
    // Filter by month
    let filtered = allOrders.filter(o => dmyToYYYYMM(o.dateOrdered) === selectedMonth);

    // Filter by search (matches customer name OR product name)
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(o =>
        (o.accountCompany ?? "").toLowerCase().includes(q) ||
        (o.productName ?? "").toLowerCase().includes(q)
      );
    }

    // Merge production order data with status overrides
    const rows: OrderRow[] = filtered.map(o => {
      const status = statusByProdOrderId.get(o.id);
      return {
        ...o,
        productionStatus: status?.productionStatus ?? "Pending",
        distributionType: status?.distributionType ?? "Delivery",
        packingStatus: status?.packingStatus ?? "Not Packed",
        deliveryStatus: status?.deliveryStatus ?? "No",
        statusRecordId: status?.id ?? null,
      };
    });

    // Group by accountId
    const byAccount = new Map<number, OrderRow[]>();
    rows.forEach(r => {
      if (!byAccount.has(r.accountId)) byAccount.set(r.accountId, []);
      byAccount.get(r.accountId)!.push(r);
    });

    // Build CustomerGroup with nested ProductGroups
    const groups: CustomerGroup[] = Array.from(byAccount.entries()).map(([accountId, orders]) => {
      // Sub-group by product name
      const byProduct = new Map<string, OrderRow[]>();
      orders.forEach(o => {
        const key = o.productName ?? "—";
        if (!byProduct.has(key)) byProduct.set(key, []);
        byProduct.get(key)!.push(o);
      });

      const productGroups: ProductGroup[] = Array.from(byProduct.entries())
        .map(([productName, productOrders]) => ({
          productName,
          orders: productOrders.sort((a, b) => {
            const da = parseDMY(a.dateOrdered)?.getTime() ?? 0;
            const db_ = parseDMY(b.dateOrdered)?.getTime() ?? 0;
            return da - db_;
          }),
          totalVolume: productOrders.reduce((sum, o) => sum + (Number(o.volume) || 0), 0),
        }))
        .sort((a, b) => a.productName.localeCompare(b.productName));

      // Epoch ms of the most recently updated order — used for "Recently Updated" sort
      const latestUpdate = Math.max(
        ...orders.map(o => new Date(o.updatedAt ?? o.createdAt ?? 0).getTime())
      );

      return {
        accountId,
        customerName: orders[0].accountCompany ?? "Unknown",
        productGroups,
        totalOrders: orders.length,
        latestUpdate,
      };
    });

    if (sortMode === "alpha") {
      groups.sort((a, b) => a.customerName.localeCompare(b.customerName));
    } else {
      groups.sort((a, b) => b.latestUpdate - a.latestUpdate);
    }

    return groups;
  }, [allOrders, selectedMonth, statusByProdOrderId, search, sortMode]);

  const totalOrders = customerGroups.reduce((s, g) => s + g.totalOrders, 0);

  // ── Export ───────────────────────────────────────────────────────────────

  const exportXlsx = () => {
    const rows = customerGroups.flatMap(g =>
      g.productGroups.flatMap(pg =>
        pg.orders.map(o => ({
          "Customer Name": g.customerName,
          "Product Description": o.productName ?? "",
          "Volume (KG)": o.volume ?? "",
          "Date Ordered": o.dateOrdered ?? "",
          "Expected Delivery": o.expectedDeliveryDate ?? "",
          "Delivery Date": o.dateDelivered ?? "",
          "Production Status": o.productionStatus,
          "Distribution": o.distributionType,
          "Packing": o.packingStatus,
          "Delivery": o.deliveryStatus,
        }))
      )
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Orders");
    XLSX.writeFile(wb, `monthly-orders-${selectedMonth}.xlsx`);
  };

  const exportCsv = () => {
    const rows = customerGroups.flatMap(g =>
      g.productGroups.flatMap(pg =>
        pg.orders.map(o =>
          [g.customerName, o.productName ?? "", o.volume ?? "", o.dateOrdered ?? "",
            o.expectedDeliveryDate ?? "", o.dateDelivered ?? "",
            o.productionStatus, o.distributionType, o.packingStatus, o.deliveryStatus]
            .map(v => `"${String(v).replace(/"/g, '""')}"`)
            .join(",")
        )
      )
    );
    const header = ["Customer Name","Product Description","Volume (KG)","Date Ordered",
      "Expected Delivery","Delivery Date","Production Status","Distribution","Packing","Delivery"].join(",");
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `monthly-orders-${selectedMonth}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (ordersLoading || statusLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        {/* Left: month selector + search */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="month-selector">
              Month
            </label>
            <select
              id="month-selector"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className={cn(
                "h-10 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
                isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
              )}
            >
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="order-search">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                id="order-search"
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Customer or product…"
                className={cn(
                  "h-10 w-52 rounded-xl border pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  isLight
                    ? "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400"
                    : "border-white/10 bg-black/20 text-foreground placeholder:text-muted-foreground"
                )}
              />
            </div>
          </div>
        </div>

        {/* Right: sort toggle + export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn(
            "flex rounded-xl overflow-hidden border text-xs font-semibold",
            isLight ? "border-slate-200" : "border-white/10"
          )}>
            <button
              onClick={() => setSortMode("alpha")}
              className={cn(
                "h-9 px-3.5 transition-all",
                sortMode === "alpha"
                  ? (isLight ? "bg-slate-800 text-white" : "bg-white/10 text-foreground")
                  : (isLight ? "text-slate-500 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5")
              )}
            >
              A – Z
            </button>
            <button
              onClick={() => setSortMode("recent")}
              className={cn(
                "h-9 px-3.5 transition-all border-l",
                isLight ? "border-slate-200" : "border-white/10",
                sortMode === "recent"
                  ? (isLight ? "bg-slate-800 text-white" : "bg-white/10 text-foreground")
                  : (isLight ? "text-slate-500 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5")
              )}
            >
              Recent
            </button>
          </div>

          <button
            onClick={exportXlsx}
            className={cn(
              "flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}
          >
            <Download className="w-3.5 h-3.5" />Export Excel
          </button>
          <button
            onClick={exportCsv}
            className={cn(
              "flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}
          >
            <Download className="w-3.5 h-3.5" />Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={cn("border rounded-2xl overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className={cn("border-b", isLight ? "bg-slate-50 border-slate-100" : "bg-black/40 border-white/5")}>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Customer Name</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Product Description</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Volume (KG)</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Date Ordered</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Expected Delivery</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Delivery Date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Production Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Distribution</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Packing</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {customerGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    {search.trim()
                      ? `No orders match "${search}" for this month.`
                      : "No production orders found for this month."}
                  </td>
                </tr>
              ) : (
                customerGroups.map(group =>
                  group.productGroups.flatMap((pg, pgIdx) => {
                    const isPending = updateStatus.isPending;

                    const orderRows: React.ReactElement[] = pg.orders.map((order, orderIdx) => {
                      const isVeryFirst = pgIdx === 0 && orderIdx === 0;

                      const mutate = (field: string, value: string) =>
                        updateStatus.mutate({
                          productionOrderId: order.id,
                          updates: { [field]: value } as any,
                          order,
                        });

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "border-b",
                            isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]"
                          )}
                        >
                          {/* Customer name — shown only on the very first row of this customer group */}
                          <td className="px-4 py-3 text-xs">
                            {isVeryFirst ? (
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">{group.customerName}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {group.totalOrders} order{group.totalOrders !== 1 ? "s" : ""}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">↳</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-xs text-muted-foreground">{order.productName ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {order.volume ? Number(order.volume).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDMY(order.dateOrdered)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDMY(order.expectedDeliveryDate)}</td>
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={dmyToIso(order.dateDelivered)}
                              onChange={e => {
                                const dmy = e.target.value ? isoToDmy(e.target.value) : null;
                                updateDeliveryDate.mutate({ orderId: order.id, dateDelivered: dmy });
                              }}
                              className={cn(
                                "h-8 rounded-lg border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 [color-scheme:light] dark:[color-scheme:dark]",
                                isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
                              )}
                            />
                          </td>

                          <td className="px-4 py-3">
                            <select
                              value={order.productionStatus}
                              disabled={isPending}
                              onChange={e => mutate("productionStatus", e.target.value)}
                              className={cn(SELECT_CLS, productionStatusCls(order.productionStatus))}
                            >
                              <option value="Pending" className={OPT}>Pending</option>
                              <option value="In Process" className={OPT}>In Process</option>
                              <option value="Produced" className={OPT}>Produced</option>
                              <option value="Warehouse" className={OPT}>Warehouse</option>
                              <option value="Dispatch" className={OPT}>Dispatch</option>
                            </select>
                          </td>

                          <td className="px-4 py-3">
                            <select
                              value={order.distributionType}
                              disabled={isPending}
                              onChange={e => mutate("distributionType", e.target.value)}
                              className={cn(SELECT_CLS, distributionCls(order.distributionType))}
                            >
                              <option value="Pick Up" className={OPT}>Pick Up</option>
                              <option value="Delivery" className={OPT}>Delivery</option>
                            </select>
                          </td>

                          <td className="px-4 py-3">
                            <select
                              value={order.packingStatus}
                              disabled={isPending}
                              onChange={e => mutate("packingStatus", e.target.value)}
                              className={cn(SELECT_CLS, packingCls(order.packingStatus))}
                            >
                              <option value="Not Packed" className={OPT}>Not Packed</option>
                              <option value="Partially Packed" className={OPT}>Partially Packed</option>
                              <option value="Completed" className={OPT}>Completed</option>
                            </select>
                          </td>

                          <td className="px-4 py-3">
                            <select
                              value={order.deliveryStatus}
                              disabled={isPending}
                              onChange={e => mutate("deliveryStatus", e.target.value)}
                              className={cn(SELECT_CLS, deliveryCls(order.deliveryStatus))}
                            >
                              <option value="Yes" className={OPT}>Yes</option>
                              <option value="No" className={OPT}>No</option>
                            </select>
                          </td>
                        </tr>
                      );
                    });

                    // Subtotal row — only when a product appears 2+ times for this customer
                    if (pg.orders.length > 1) {
                      orderRows.push(
                        <tr
                          key={`sub-${group.accountId}-${pg.productName}`}
                          className={cn(
                            "border-b",
                            isLight ? "bg-slate-50/80 border-slate-100" : "bg-white/[0.025] border-white/5"
                          )}
                        >
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-xs font-semibold text-muted-foreground italic">
                            {pg.productName} — Total Volume
                          </td>
                          <td className="px-4 py-2 text-xs font-bold text-foreground">
                            {pg.totalVolume.toLocaleString()} KG
                          </td>
                          <td colSpan={7} className="px-4 py-2" />
                        </tr>
                      );
                    }

                    return orderRows;
                  })
                )
              )}
            </tbody>
          </table>
        </div>
        <div className={cn("px-4 py-2.5 text-xs text-muted-foreground border-t", isLight ? "border-slate-100" : "border-white/5")}>
          {totalOrders === 0
            ? (search.trim() ? `No results for "${search}"` : "No orders for this month")
            : `Showing ${totalOrders} order${totalOrders !== 1 ? "s" : ""} across ${customerGroups.length} customer${customerGroups.length !== 1 ? "s" : ""}`}
        </div>
      </div>
    </div>
  );
}
