import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Download, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL;

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  seasoning: "Seasoning",
  snacks_dusting: "Snacks Dusting",
  dairy_premix: "Dairy Premix",
  bakery_dough_premix: "Bakery & Dough Premix",
  sweet_flavours: "Sweet Flavours",
  savoury_flavour: "Savoury Flavour",
};

type TodayOrder = {
  id: number;
  productionOrderId: number;
  accountId: number;
  accountCompany: string | null;
  productName: string | null;
  price: string | null;
  volume: string | null;
  dateOrdered: string | null;
  expectedDeliveryDate: string | null;
  dateDelivered: string | null;
  createdAt: string;
};

type Account = {
  id: number;
  company: string;
  productName: string;
  productType: string | null;
};

type ViewMode = "daily" | "weekly" | "monthly";
type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly" | "all";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("rd_token")}`,
    "Content-Type": "application/json",
  };
}

function todayDMY() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = String(now.getFullYear());
  return `${d}/${m}/${y}`;
}

function parseDMY(date: string | null | undefined): Date | null {
  if (!date || typeof date !== "string") return null;
  const parts = date.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const parsed = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isTodayDate(date: string | null | undefined): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const now = new Date();
  return parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate();
}

function isWithinLastDays(date: string | null | undefined, days: number): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const diff = Math.floor((Date.now() - parsed.getTime()) / 86400000);
  return diff >= 0 && diff < days;
}

function filterByPeriod(orders: TodayOrder[], period: string): TodayOrder[] {
  if (period === "all") return orders;
  if (period === "yearly") return orders.filter(o => isWithinLastDays(o.dateOrdered, 365));
  if (period === "monthly") return orders.filter(o => isWithinLastDays(o.dateOrdered, 30));
  if (period === "weekly") return orders.filter(o => isWithinLastDays(o.dateOrdered, 7));
  return orders.filter(o => isTodayDate(o.dateOrdered));
}

const inputClass = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground";

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-xl p-3 border border-white/20 bg-black/80 backdrop-blur-sm text-xs shadow-xl">
      <p className="font-semibold text-foreground mb-1">{item.name}</p>
      <p className="text-emerald-400">
        Income: ${Number(item.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className="text-muted-foreground">{item.payload.percentage?.toFixed(1)}% of total</p>
    </div>
  );
}

const CHART_PERIOD_LABELS: Record<ChartPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  all: "All Time",
};

function LeadingProductTypeChart({
  allOrders,
  accountTypeMap,
}: {
  allOrders: TodayOrder[];
  accountTypeMap: Record<number, string | null>;
}) {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("all");
  const [fullscreen, setFullscreen] = useState(false);

  const chartOrders = useMemo(
    () => filterByPeriod(allOrders, chartPeriod),
    [allOrders, chartPeriod],
  );

  const { chartData, totalIncome, productTypesCount, leadingType } = useMemo(() => {
    const grouped: Record<string, number> = {};
    let total = 0;
    for (const order of chartOrders) {
      const pt = accountTypeMap[order.accountId] ?? "other";
      const income = Number(order.price || 0) * Number(order.volume || 0);
      grouped[pt] = (grouped[pt] ?? 0) + income;
      total += income;
    }
    const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    const data = entries.map(([key, value]) => ({
      name: PRODUCT_TYPE_LABELS[key] ?? key,
      value,
      key,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }));
    const leading = entries[0]
      ? (PRODUCT_TYPE_LABELS[entries[0][0]] ?? entries[0][0])
      : "—";
    return { chartData: data, totalIncome: total, productTypesCount: entries.length, leadingType: leading };
  }, [chartOrders, accountTypeMap]);

  const inner = (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Analytics</p>
          <h2 className="text-base font-bold text-foreground mt-0.5">Leading Product Type</h2>
        </div>
        <button
          onClick={() => setFullscreen(f => !f)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {(["daily", "weekly", "monthly", "yearly", "all"] as ChartPeriod[]).map(p => (
          <button
            key={p}
            onClick={() => setChartPeriod(p)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              chartPeriod === p
                ? "bg-primary text-white"
                : "bg-white/5 text-muted-foreground hover:bg-white/10",
            )}
          >
            {CHART_PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="glass-card rounded-xl p-3 border border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">Total Income</p>
          <p className="mt-1 text-sm font-bold text-foreground truncate">
            ${totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 border border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">Product Types</p>
          <p className="mt-1 text-sm font-bold text-foreground">{productTypesCount}</p>
        </div>
        <div className="glass-card rounded-xl p-3 border border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">Leading Type</p>
          <p className="mt-1 text-sm font-bold text-foreground truncate" title={leadingType}>{leadingType}</p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No data for this period
        </div>
      ) : (
        <div className="flex-1 min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius="45%"
                outerRadius="70%"
                dataKey="value"
                paddingAngle={3}
              >
                {chartData.map((entry, idx) => (
                  <Cell key={entry.key} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <>
        <div className="glass-card rounded-2xl p-6 border border-white/5 flex items-center justify-center text-sm text-muted-foreground">
          Chart open in fullscreen
        </div>
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={e => { if (e.target === e.currentTarget) setFullscreen(false); }}
        >
          <div className="glass-card rounded-2xl p-6 border border-white/10 w-full max-w-2xl flex flex-col"
            style={{ height: "80vh" }}>
            {inner}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col h-[540px]">
      {inner}
    </div>
  );
}

export default function NewProductionOrdersPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    accountId: "",
    price: "",
    volume: "",
    expectedDeliveryDate: "",
    dateDelivered: "",
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json();
    },
  });

  const { data: allOrders = [], isLoading, error } = useQuery<TodayOrder[]>({
    queryKey: ["/api/production-orders/all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/production-orders?period=all`, { headers: authHeaders() });
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${BASE}api/production-orders/today`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || "Failed to create production order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
      setForm({ accountId: "", price: "", volume: "", expectedDeliveryDate: "", dateDelivered: "" });
      setShowForm(false);
    },
  });

  const creating = createMutation.status === "pending";

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/production-orders/today/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || "Failed to delete production order");
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
    },
  });

  const accountTypeMap = useMemo(() => {
    const map: Record<number, string | null> = {};
    accounts.forEach(a => { map[a.id] = a.productType; });
    return map;
  }, [accounts]);

  const tableOrders = useMemo(
    () => filterByPeriod(allOrders, viewMode),
    [allOrders, viewMode],
  );

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tableOrders;
    return tableOrders.filter(order =>
      order.accountCompany?.toLowerCase().includes(term) ||
      order.productName?.toLowerCase().includes(term) ||
      order.dateOrdered?.toLowerCase().includes(term) ||
      order.expectedDeliveryDate?.toLowerCase().includes(term),
    );
  }, [tableOrders, search]);

  const totalIncome = useMemo(
    () => filteredOrders.reduce((sum, order) => sum + Number(order.price || 0) * Number(order.volume || 0), 0),
    [filteredOrders],
  );

  const viewModeLabel = viewMode === "daily" ? "Daily" : viewMode === "weekly" ? "Weekly" : "Monthly";
  const exportFileName = `production_orders_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const periodDescription = viewMode === "daily"
    ? "Track new production orders placed today across accounts."
    : viewMode === "weekly"
      ? "Track new production orders placed during the last 7 days across accounts."
      : "Track new production orders placed during the last 30 days across accounts.";

  const addOrder = async () => {
    if (!form.accountId || !form.price || !form.volume) return;
    createMutation.mutate({
      accountId: Number(form.accountId),
      price: form.price,
      volume: form.volume,
      dateOrdered: todayDMY(),
      expectedDeliveryDate: form.expectedDeliveryDate || null,
      dateDelivered: form.dateDelivered || null,
    });
  };

  const exportTable = () => {
    const data = filteredOrders.map(order => ({
      "Account": order.accountCompany,
      "Product": order.productName,
      "Price ($/kg)": order.price,
      "Volume (kg)": order.volume,
      "Date Ordered": order.dateOrdered,
      "Expected Delivery": order.expectedDeliveryDate || "",
      "Date Delivered": order.dateDelivered || "",
      "Income ($)": (Number(order.price || 0) * Number(order.volume || 0)).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${viewModeLabel} Production Orders`);
    XLSX.writeFile(wb, exportFileName);
  };

  const accountOptions = accounts.map(account => (
    <option key={account.id} value={account.id}>{account.company} — {account.productName}</option>
  ));

  return (
    <div className="space-y-6">
      {/* Top row: header + chart */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sales Force</p>
              <h1 className="text-2xl font-display font-bold text-foreground mt-2">New Production Orders</h1>
              <p className="mt-2 text-sm text-muted-foreground">{periodDescription}</p>
            </div>
            <button
              onClick={() => setShowForm(f => !f)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0",
                showForm
                  ? "bg-white/10 text-foreground border border-white/10"
                  : "bg-primary text-white",
              )}
            >
              {showForm ? "Cancel" : "+ Add new order"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {(["daily", "weekly", "monthly"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition duration-150",
                  viewMode === mode
                    ? "bg-primary text-white"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10",
                )}
              >
                {mode === "daily" ? "Daily" : mode === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>

          {showForm && (
            <div className="space-y-4 mb-4 border border-white/10 rounded-xl p-4 bg-white/5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Account</label>
                  <select
                    value={form.accountId}
                    onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                    className={cn(inputClass, accountsLoading ? "opacity-50 cursor-not-allowed" : "")}
                    disabled={accountsLoading}
                  >
                    <option value="">Select account</option>
                    {accountOptions}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Price ($/kg)</label>
                  <input
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    type="number" step="0.01" min="0"
                    className={inputClass} placeholder="e.g. 58.50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Volume (kg)</label>
                  <input
                    value={form.volume}
                    onChange={e => setForm(f => ({ ...f, volume: e.target.value }))}
                    type="number" step="0.01" min="0"
                    className={inputClass} placeholder="e.g. 1200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Expected Delivery</label>
                  <input
                    value={form.expectedDeliveryDate}
                    onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
                    type="text" className={inputClass} placeholder="dd/mm/yyyy"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Date Ordered</label>
                  <input value={todayDMY()} disabled className={cn(inputClass, "bg-white/5 cursor-not-allowed")} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Date Delivered</label>
                  <input
                    value={form.dateDelivered}
                    onChange={e => setForm(f => ({ ...f, dateDelivered: e.target.value }))}
                    type="text" className={inputClass} placeholder="dd/mm/yyyy"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <button
                  onClick={addOrder}
                  disabled={creating || !form.accountId || !form.price || !form.volume}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" /> Add Today Order
                </button>
                <p className="text-xs text-muted-foreground">Only orders ordered today are included in this list.</p>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-red-400">{(createMutation.error as Error)?.message || "Failed to add order."}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Orders</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{filteredOrders.length}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total Income</p>
              <p className="mt-2 text-2xl font-bold text-foreground">
                ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Date</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{todayDMY()}</p>
            </div>
          </div>
        </div>

        <LeadingProductTypeChart allOrders={allOrders} accountTypeMap={accountTypeMap} />
      </div>

      {/* Search + export bar above the table */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by account, product, or date"
            className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={exportTable}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          Export {viewModeLabel} Orders
        </button>
      </div>

      {/* Orders table */}
      <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
        <div className="flex items-center justify-between px-5 py-4 bg-white/5 border-b border-white/5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{viewModeLabel} Production Orders</p>
            <p className="text-sm text-muted-foreground mt-1">
              Showing orders from the {viewMode === "daily" ? "current day" : viewMode === "weekly" ? "last 7 days" : "last 30 days"} across accounts.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Updated {filteredOrders.length} orders</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Loading {viewModeLabel.toLowerCase()} orders…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-red-400">Unable to load orders.</div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
            <p className="text-sm">No production orders were found for this period.</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
            >
              Add order for today
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground bg-white/5 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Product Type</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Ordered</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3">Income</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 text-foreground">{order.accountCompany || "Unknown"}</td>
                    <td className="px-4 py-3 text-foreground">{order.productName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {accountTypeMap[order.accountId]
                        ? (PRODUCT_TYPE_LABELS[accountTypeMap[order.accountId]!] ?? accountTypeMap[order.accountId])
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      ${Number(order.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">{Number(order.volume || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">{order.dateOrdered || "—"}</td>
                    <td className="px-4 py-3">{order.expectedDeliveryDate || "—"}</td>
                    <td className="px-4 py-3">{order.dateDelivered || "—"}</td>
                    <td className="px-4 py-3 text-emerald-400">
                      ${(Number(order.price || 0) * Number(order.volume || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteMutation.mutate(order.id)}
                        className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
