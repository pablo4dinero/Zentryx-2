import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
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

type ViewMode = "month" | "quarter" | "year";

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

const QUARTER_MONTHS: Record<number, string> = {
  1: "Jan – Mar",
  2: "Apr – Jun",
  3: "Jul – Sep",
  4: "Oct – Dec",
};

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
const PAGE_SIZE = 50;

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
  latestUpdate: number;
};

// ── Pagination bar ─────────────────────────────────────────────────────────────

function PaginationBar({
  page,
  totalPages,
  onPage,
  isLight,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  isLight: boolean;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push("...");
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i);
    if (page < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
  }

  const btnBase = cn(
    "h-7 min-w-[28px] px-2 rounded-lg text-xs font-medium transition-all",
    isLight ? "border border-slate-200" : "border border-white/10"
  );
  const activeCls = isLight ? "bg-slate-800 text-white border-slate-800" : "bg-white/10 text-foreground border-white/20";
  const inactiveCls = isLight ? "text-slate-600 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5";
  const disabledCls = "opacity-30 cursor-not-allowed";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className={cn(btnBase, page === 0 ? disabledCls : inactiveCls)}
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className={cn(btnBase, p === page ? activeCls : inactiveCls)}
          >
            {(p as number) + 1}
          </button>
        )
      )}
      <button
        onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
        disabled={page === totalPages - 1}
        className={cn(btnBase, page === totalPages - 1 ? disabledCls : inactiveCls)}
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MonthlyOrdersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultQuarter = `${now.getFullYear()}-Q${currentQ}`;
  const defaultYear = String(now.getFullYear());

  const [viewMode, setViewMode] = React.useState<ViewMode>("month");
  const [selectedMonth, setSelectedMonth] = React.useState(defaultMonth);
  const [selectedQuarter, setSelectedQuarter] = React.useState(defaultQuarter);
  const [selectedYear, setSelectedYear] = React.useState(defaultYear);
  const [search, setSearch] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"alpha" | "recent">("alpha");
  const [page, setPage] = React.useState(0);

  // Reset pagination when any filter changes
  React.useEffect(() => { setPage(0); }, [viewMode, selectedMonth, selectedQuarter, selectedYear, search, sortMode]);

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

  // Actual produced/dispatched batch volumes per sales order ID.
  // Using this instead of the monthly order's total volume avoids counting the
  // whole order the moment any single batch is produced or dispatched.
  const { data: producedSummary = {} } = useQuery<Record<number, { producedVolume: number; dispatchedVolume: number; isProduced: boolean; excessKg: number }>>({
    queryKey: ["/api/mdp/produced-orders/summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/produced-orders/summary`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch produced summary");
      return res.json();
    },
    staleTime: 1000 * 30,
  });

  // ── Mutations ────────────────────────────────────────────────────────────

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
        if (existing) return old.map(r => r.productionOrderId === productionOrderId ? { ...r, ...updates } : r);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mdp/monthly-orders/all"] }),
  });

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/production-orders/all"] }),
  });

  const updateExcess = useMutation({
    mutationFn: async ({ orderId, accountId, excessKg }: { orderId: number; accountId: number; excessKg: number }) => {
      const res = await fetch(`${BASE}api/accounts/${accountId}/production-orders/${orderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ excessKg }),
      });
      if (!res.ok) throw new Error("Failed to update excess");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders/summary"] }),
  });

  // ── Selector options ─────────────────────────────────────────────────────

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

  const quarterOptions = React.useMemo(() => {
    const options = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      for (let q = 1; q <= 4; q++) {
        options.push({ value: `${y}-Q${q}`, label: `Q${q} ${y}  (${QUARTER_MONTHS[q]})` });
      }
    }
    return options;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
    .map(y => ({ value: String(y), label: String(y) }));

  // ── Status lookup ────────────────────────────────────────────────────────

  const statusByProdOrderId = React.useMemo(() => {
    const map = new Map<number, StatusRecord>();
    statusRecords.forEach(r => { if (r.productionOrderId != null) map.set(r.productionOrderId, r); });
    return map;
  }, [statusRecords]);

  // ── Period match predicate ───────────────────────────────────────────────

  function matchesPeriod(o: ProductionOrder): boolean {
    const yyyymm = dmyToYYYYMM(o.dateOrdered);
    if (!yyyymm) return false;
    if (viewMode === "month") return yyyymm === selectedMonth;
    if (viewMode === "quarter") {
      const [yearStr, qStr] = selectedQuarter.split("-Q");
      const q = Number(qStr);
      const m = Number(yyyymm.slice(5));
      return yyyymm.slice(0, 4) === yearStr && Math.ceil(m / 3) === q;
    }
    // year
    return yyyymm.slice(0, 4) === selectedYear;
  }

  // ── Build all customer groups (full dataset, used for stats + export) ────

  const customerGroups: CustomerGroup[] = React.useMemo(() => {
    let filtered = allOrders.filter(matchesPeriod);

    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(o =>
        (o.accountCompany ?? "").toLowerCase().includes(q) ||
        (o.productName ?? "").toLowerCase().includes(q)
      );
    }

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

    const byAccount = new Map<number, OrderRow[]>();
    rows.forEach(r => {
      if (!byAccount.has(r.accountId)) byAccount.set(r.accountId, []);
      byAccount.get(r.accountId)!.push(r);
    });

    const groups: CustomerGroup[] = Array.from(byAccount.entries()).map(([accountId, orders]) => {
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

      const latestUpdate = Math.max(
        ...orders.map(o => new Date(o.updatedAt ?? o.createdAt ?? 0).getTime())
      );

      return { accountId, customerName: orders[0].accountCompany ?? "Unknown", productGroups, totalOrders: orders.length, latestUpdate };
    });

    if (sortMode === "alpha") {
      groups.sort((a, b) => a.customerName.localeCompare(b.customerName));
    } else {
      groups.sort((a, b) => b.latestUpdate - a.latestUpdate);
    }

    return groups;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders, viewMode, selectedMonth, selectedQuarter, selectedYear, statusByProdOrderId, search, sortMode]);

  const totalOrders = customerGroups.reduce((s, g) => s + g.totalOrders, 0);

  // ── Summary stats ────────────────────────────────────────────────────────

  const summaryStats = React.useMemo(() => {
    const allOrders = customerGroups.flatMap(g => g.productGroups.flatMap(pg => pg.orders));
    const uniqueProducts = new Set(
      customerGroups.flatMap(g => g.productGroups.map(pg => pg.productName))
    ).size;
    const totalVolume = allOrders.reduce((sum, o) => sum + (Number(o.volume) || 0), 0);
    // Sum actual produced/dispatched batch volumes rather than the full order
    // volume, so partial batches are counted correctly.
    const totalVolumeProduced = allOrders.reduce((sum, o) => sum + (producedSummary[o.id]?.producedVolume ?? 0), 0);
    const totalVolumeDispatched = allOrders.reduce((sum, o) => sum + (producedSummary[o.id]?.dispatchedVolume ?? 0), 0);
    const uniqueCustomers = new Set(customerGroups.map(g => g.customerName)).size;
    return { customers: uniqueCustomers, products: uniqueProducts, totalVolume, totalVolumeProduced, totalVolumeDispatched };
  }, [customerGroups, producedSummary]);

  // ── Pagination ───────────────────────────────────────────────────────────

  const { pagedGroups, totalPages, rowStart, rowEnd } = React.useMemo(() => {
    const pages: CustomerGroup[][] = [];
    let current: CustomerGroup[] = [];
    let count = 0;

    for (const group of customerGroups) {
      if (count > 0 && count + group.totalOrders > PAGE_SIZE) {
        pages.push(current);
        current = [];
        count = 0;
      }
      current.push(group);
      count += group.totalOrders;
    }
    if (current.length > 0) pages.push(current);

    const safePage = Math.min(page, Math.max(0, pages.length - 1));
    const safeGroups = pages[safePage] ?? [];
    let rs = 0;
    for (let i = 0; i < safePage; i++) rs += (pages[i] ?? []).reduce((s, g) => s + g.totalOrders, 0);
    const re = rs + safeGroups.reduce((s, g) => s + g.totalOrders, 0);

    return { pagedGroups: safeGroups, totalPages: Math.max(1, pages.length), rowStart: rs + 1, rowEnd: re };
  }, [customerGroups, page]);

  // ── Export (always exports all pages) ───────────────────────────────────

  const periodLabel =
    viewMode === "month" ? selectedMonth :
    viewMode === "quarter" ? selectedQuarter :
    selectedYear;

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
    XLSX.writeFile(wb, `orders-${periodLabel}.xlsx`);
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
    const a = document.createElement("a"); a.href = url; a.download = `orders-${periodLabel}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (ordersLoading || statusLoading) return <PageLoader />;

  const selectCls = cn(
    "h-10 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
    isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
  );

  return (
    <div className="space-y-5">

      {/* ── Summary boxes ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: "Total Customers",         value: summaryStats.customers.toLocaleString() },
          { label: "Total Products",          value: summaryStats.products.toLocaleString() },
          { label: "Total Volume Ordered",    value: `${summaryStats.totalVolume.toLocaleString()} KG` },
          { label: "Total Volume Produced",   value: `${summaryStats.totalVolumeProduced.toLocaleString()} KG`, highlight: true },
          { label: "Total Volume Dispatched", value: `${summaryStats.totalVolumeDispatched.toLocaleString()} KG`, highlightSky: true },
        ].map(box => (
          <div
            key={box.label}
            className={cn(
              "rounded-2xl border p-5",
              (box as any).highlightSky
                ? isLight ? "bg-sky-50 border-sky-200" : "bg-sky-500/10 border-sky-500/20"
                : box.highlight
                  ? isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-500/10 border-emerald-500/20"
                  : isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10"
            )}
          >
            <div className={cn(
              "text-[10px] font-semibold uppercase tracking-widest mb-2",
              (box as any).highlightSky ? "text-sky-600" : box.highlight ? "text-emerald-600" : "text-muted-foreground"
            )}>
              {box.label}
            </div>
            <div className={cn(
              "text-2xl font-bold",
              (box as any).highlightSky ? "text-sky-600" : box.highlight ? "text-emerald-600" : "text-foreground"
            )}>
              {box.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Controls row ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">

        {/* Left: period mode + selector + search */}
        <div className="flex flex-wrap items-end gap-3">

          {/* Period mode toggle + matching selector */}
          <div className="flex items-end gap-5">
            {/* Mode toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period</label>
              <div className={cn("flex rounded-xl overflow-hidden border text-xs font-semibold h-10",
                isLight ? "border-slate-200" : "border-white/10")}>
                {(["month", "quarter", "year"] as ViewMode[]).map((mode, i) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "px-3.5 capitalize transition-all",
                      i > 0 && (isLight ? "border-l border-slate-200" : "border-l border-white/10"),
                      viewMode === mode
                        ? (isLight ? "bg-slate-800 text-white" : "bg-white/10 text-foreground")
                        : (isLight ? "text-slate-500 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5")
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {viewMode === "month" ? "Month" : viewMode === "quarter" ? "Quarter" : "Year"}
              </label>
              {viewMode === "month" && (
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className={selectCls}>
                  {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {viewMode === "quarter" && (
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(e.target.value)} className={selectCls}>
                  {quarterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {viewMode === "year" && (
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className={selectCls}>
                  {yearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Search (no label, 2× width) */}
          <div className="relative self-end">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Customer or product…"
              className={cn(
                "h-10 w-[26rem] rounded-xl border pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isLight
                  ? "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400"
                  : "border-white/10 bg-black/20 text-foreground placeholder:text-muted-foreground"
              )}
            />
          </div>
        </div>

        {/* Right: sort + export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("flex rounded-xl overflow-hidden border text-xs font-semibold",
            isLight ? "border-slate-200" : "border-white/10")}>
            <button
              onClick={() => setSortMode("alpha")}
              className={cn(
                "h-9 px-3.5 transition-all",
                sortMode === "alpha"
                  ? (isLight ? "bg-slate-800 text-white" : "bg-white/10 text-foreground")
                  : (isLight ? "text-slate-500 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5")
              )}
            >A – Z</button>
            <button
              onClick={() => setSortMode("recent")}
              className={cn(
                "h-9 px-3.5 transition-all border-l",
                isLight ? "border-slate-200" : "border-white/10",
                sortMode === "recent"
                  ? (isLight ? "bg-slate-800 text-white" : "bg-white/10 text-foreground")
                  : (isLight ? "text-slate-500 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5")
              )}
            >Recent</button>
          </div>

          <button
            onClick={exportXlsx}
            className={cn(
              "flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}
          ><Download className="w-3.5 h-3.5" />Export Excel</button>
          <button
            onClick={exportCsv}
            className={cn(
              "flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}
          ><Download className="w-3.5 h-3.5" />Export CSV</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className={cn("border rounded-2xl overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
        <div className="table-scroll custom-scrollbar">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className={cn("border-b", isLight ? "bg-slate-50 border-slate-100" : "bg-black/40 border-white/5")}>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Customer Name</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Product Description</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Volume (KG)</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Date Ordered</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Expected Delivery</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Produced (Kg)</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Deficit (Kg)</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Excess (Kg)</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Delivery Date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Production Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Distribution</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Packing</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {pagedGroups.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    {search.trim()
                      ? `No orders match "${search}" for this period.`
                      : "No production orders found for this period."}
                  </td>
                </tr>
              ) : (
                pagedGroups.map(group =>
                  group.productGroups.flatMap((pg, pgIdx) => {
                    const isPending = updateStatus.isPending;

                    const orderRows: React.ReactElement[] = pg.orders.map((order, orderIdx) => {
                      const isVeryFirst = pgIdx === 0 && orderIdx === 0;

                      const mutate = (field: string, value: string) =>
                        updateStatus.mutate({ productionOrderId: order.id, updates: { [field]: value } as any, order });

                      return (
                        <tr
                          key={order.id}
                          className={cn("border-b", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}
                        >
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
                          {(() => {
                            const producedKg = producedSummary[order.id]?.producedVolume ?? 0;
                            const isOrdProduced = producedSummary[order.id]?.isProduced ?? false;
                            const vol = Number(order.volume) || 0;
                            const deficitKg = isOrdProduced ? Math.max(0, vol - producedKg) : 0;
                            const storedExcess = producedSummary[order.id]?.excessKg ?? 0;
                            return (
                              <>
                                <td className="px-4 py-3 text-xs font-medium text-cyan-400 whitespace-nowrap">
                                  {producedKg > 0 ? producedKg.toLocaleString() : "—"}
                                </td>
                                <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                                  {producedKg > 0
                                    ? <span className={deficitKg > 0 ? "text-orange-400" : "text-emerald-400"}>
                                        {deficitKg > 0 ? deficitKg.toLocaleString() : "0"}
                                      </span>
                                    : "—"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    defaultValue={storedExcess || ""}
                                    placeholder="0"
                                    key={`excess-${order.id}-${storedExcess}`}
                                    onBlur={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (val !== storedExcess) {
                                        updateExcess.mutate({ orderId: order.id, accountId: order.accountId, excessKg: val });
                                      }
                                    }}
                                    className={cn(
                                      "w-24 h-7 rounded-lg border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-violet-400 font-medium",
                                      isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/20"
                                    )}
                                  />
                                </td>
                              </>
                            );
                          })()}
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
                            <select value={order.productionStatus} disabled={isPending}
                              onChange={e => mutate("productionStatus", e.target.value)}
                              className={cn(SELECT_CLS, productionStatusCls(order.productionStatus))}>
                              <option value="Pending" className={OPT}>Pending</option>
                              <option value="In Process" className={OPT}>In Process</option>
                              <option value="Produced" className={OPT}>Produced</option>
                              <option value="Warehouse" className={OPT}>Warehouse</option>
                              <option value="Dispatch" className={OPT}>Dispatch</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select value={order.distributionType} disabled={isPending}
                              onChange={e => mutate("distributionType", e.target.value)}
                              className={cn(SELECT_CLS, distributionCls(order.distributionType))}>
                              <option value="Pick Up" className={OPT}>Pick Up</option>
                              <option value="Delivery" className={OPT}>Delivery</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select value={order.packingStatus} disabled={isPending}
                              onChange={e => mutate("packingStatus", e.target.value)}
                              className={cn(SELECT_CLS, packingCls(order.packingStatus))}>
                              <option value="Not Packed" className={OPT}>Not Packed</option>
                              <option value="Partially Packed" className={OPT}>Partially Packed</option>
                              <option value="Completed" className={OPT}>Completed</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select value={order.deliveryStatus} disabled={isPending}
                              onChange={e => mutate("deliveryStatus", e.target.value)}
                              className={cn(SELECT_CLS, deliveryCls(order.deliveryStatus))}>
                              <option value="Yes" className={OPT}>Yes</option>
                              <option value="No" className={OPT}>No</option>
                            </select>
                          </td>
                        </tr>
                      );
                    });

                    // Subtotal row for products with 2+ orders
                    if (pg.orders.length > 1) {
                      orderRows.push(
                        <tr key={`sub-${group.accountId}-${pg.productName}`}
                          className={cn("border-b", isLight ? "bg-slate-50/80 border-slate-100" : "bg-white/[0.025] border-white/5")}>
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

        {/* Footer: row count + pagination */}
        <div className={cn(
          "flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground",
          isLight ? "border-slate-100" : "border-white/5"
        )}>
          <span>
            {totalOrders === 0
              ? (search.trim() ? `No results for "${search}"` : "No orders for this period")
              : `Showing ${rowStart}–${rowEnd} of ${totalOrders} order${totalOrders !== 1 ? "s" : ""} across ${customerGroups.length} customer${customerGroups.length !== 1 ? "s" : ""}`}
          </span>
          <PaginationBar page={page} totalPages={totalPages} onPage={setPage} isLight={isLight} />
        </div>
      </div>
    </div>
  );
}
