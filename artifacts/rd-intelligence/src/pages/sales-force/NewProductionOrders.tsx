import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Download, Trash2, Maximize2, Minimize2, Edit3, X, Calendar, ChevronDown, Pencil, RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useExchangeRate } from "@/hooks/useExchangeRate";
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

// Convert between the existing dd/mm/yyyy storage format and the ISO
// yyyy-mm-dd shape that <input type="date"> expects, so we can adopt the
// native calendar picker without touching the backend contract.
function dmyToIso(dmy: string | null | undefined): string {
  if (!dmy) return "";
  const parts = dmy.split("/");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function isoToDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
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

function isInMonth(date: string | null | undefined, monthStr: string): boolean {
  const parsed = parseDMY(date);
  if (!parsed || !monthStr) return false;
  const [year, month] = monthStr.split("-").map(Number);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1;
}

function isInWeek(date: string | null | undefined, weekStr: string): boolean {
  const parsed = parseDMY(date);
  if (!parsed || !weekStr) return false;
  const [yearWeekStr] = weekStr.split("W");
  const [year, week] = [parseInt(yearWeekStr), parseInt(weekStr.split("W")[1])];

  const jan4 = new Date(year, 0, 4);
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - jan4.getDay() + 1);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return parsed >= weekStart && parsed <= weekEnd;
}

function filterByPeriod(orders: TodayOrder[], period: string, selectedMonth?: string, selectedWeek?: string): TodayOrder[] {
  if (period === "all") return orders;
  if (period === "yearly") return orders.filter(o => isWithinLastDays(o.dateOrdered, 365));
  if (period === "monthly") {
    if (selectedMonth) return orders.filter(o => isInMonth(o.dateOrdered, selectedMonth));
    return orders.filter(o => isWithinLastDays(o.dateOrdered, 30));
  }
  if (period === "weekly") {
    if (selectedWeek) return orders.filter(o => isInWeek(o.dateOrdered, selectedWeek));
    return orders.filter(o => isWithinLastDays(o.dateOrdered, 7));
  }
  return orders.filter(o => isTodayDate(o.dateOrdered));
}

const inputClass = "sf-field w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground";

// Searchable account dropdown. Uses the same input styling as the rest of the
// form, plus a panel that filters accounts by company OR product name.
// Click-outside dismisses; Enter on the first match selects it.
function AccountSearchSelect({
  value, onChange, accounts, isLoading, isLight,
}: {
  value: string;
  onChange: (v: string) => void;
  accounts: Account[];
  isLoading: boolean;
  isLight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedAccount = accounts.find(a => String(a.id) === String(value));
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter(a =>
      a.company.toLowerCase().includes(term)
      || (a.productName ?? "").toLowerCase().includes(term),
    );
  }, [accounts, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={isLoading}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-xl border px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
          isLight
            ? "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
            : "border-white/10 bg-black/20 text-foreground hover:border-white/20",
          isLoading && "opacity-50 cursor-not-allowed",
        )}
      >
        <span className={cn(
          "truncate text-left",
          !selectedAccount && (isLight ? "text-slate-400" : "text-muted-foreground"),
        )}>
          {selectedAccount
            ? `${selectedAccount.company} — ${selectedAccount.productName}`
            : "Select account"}
        </span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 ml-2 transition-transform", open && "rotate-180", isLight ? "text-slate-500" : "opacity-60")} />
      </button>

      {open && (
        <div className={cn(
          "absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-xl border shadow-xl overflow-hidden",
          isLight ? "bg-white border-slate-200" : "bg-card border-white/10",
        )}>
          <div className={cn("p-2 border-b", isLight ? "border-slate-100" : "border-white/10")}>
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-2 py-1.5",
              isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5",
            )}>
              <Search className={cn("w-3.5 h-3.5", isLight ? "text-slate-500" : "text-muted-foreground")} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search account or product…"
                className={cn(
                  "flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground",
                  isLight ? "text-slate-900" : "text-foreground",
                )}
                onKeyDown={e => {
                  if (e.key === "Enter" && filtered[0]) {
                    onChange(String(filtered[0].id));
                    setOpen(false);
                    setQuery("");
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className={cn("px-3 py-4 text-center text-xs italic", isLight ? "text-slate-500" : "text-muted-foreground")}>
                No accounts match
              </p>
            ) : filtered.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(String(a.id)); setOpen(false); setQuery(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs transition-colors",
                  String(a.id) === value
                    ? (isLight ? "bg-primary/10 text-primary font-semibold" : "bg-primary/15 text-primary font-semibold")
                    : (isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-foreground"),
                )}
              >
                <span className="font-medium">{a.company}</span>
                {a.productName && <span className={cn("ml-1.5", isLight ? "text-slate-500" : "text-muted-foreground")}>· {a.productName}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { theme: _chartTheme } = useTheme();
  const isChartLight = _chartTheme === "light";

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
        <div className={cn("glass-card rounded-2xl p-6 border flex items-center justify-center text-sm text-muted-foreground", isChartLight ? "border-slate-200" : "border-white/5")}>
          Chart open in fullscreen
        </div>
        <div
          className={cn(
            "fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-6",
            isChartLight ? "bg-slate-900/40" : "bg-black/80",
          )}
          onClick={e => { if (e.target === e.currentTarget) setFullscreen(false); }}
        >
          <div
            className={cn(
              "rounded-2xl p-6 border w-full max-w-2xl flex flex-col shadow-2xl",
              isChartLight ? "border-slate-200" : "glass-card border-white/10",
            )}
            style={{
              height: "80vh",
              background: isChartLight ? "#ffffff" : undefined,
            }}
          >
            {inner}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6 border border-white/5 flex flex-col h-[480px] sm:h-[540px]">
      {inner}
    </div>
  );
}

export default function NewProductionOrdersPage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const exchange = useExchangeRate();
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(""); // For month filtering
  const [selectedWeek, setSelectedWeek] = useState<string>(""); // For week filtering
  // Form is visible by default — clicking Cancel hides it, Add Today Order or
  // Cancel both reset/close.
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState({
    accountId: "",
    price: "",
    volume: "",
    expectedDeliveryDate: "",
  });
  const [ngnRateOpen, setNgnRateOpen] = useState(false);
  const [ngnRateDraft, setNgnRateDraft] = useState("");
  const [converterAmount, setConverterAmount] = useState<string>("");
  const [converterFrom, setConverterFrom] = useState<"NGN" | "USD">("NGN");

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
      setForm({ accountId: "", price: "", volume: "", expectedDeliveryDate: "" });
    },
  });

  const creating = createMutation.status === "pending";

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      // Delete by account_production_orders.id — the GET returns this as
      // order.id, so the previous /today/:id endpoint always 404'd here.
      const res = await fetch(`${BASE}api/production-orders/${id}`, {
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

  const [editingOrder, setEditingOrder] = useState<TodayOrder | null>(null);
  const [editForm, setEditForm] = useState({
    accountId: "",
    price: "",
    volume: "",
    expectedDeliveryDate: "",
    dateDelivered: "",
  });

  const openEdit = (order: TodayOrder) => {
    setEditingOrder(order);
    setEditForm({
      accountId: String(order.accountId ?? ""),
      price: order.price ?? "",
      volume: order.volume ?? "",
      expectedDeliveryDate: order.expectedDeliveryDate ?? "",
      dateDelivered: order.dateDelivered ?? "",
    });
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}api/production-orders/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || "Failed to update production order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
      setEditingOrder(null);
    },
  });

  const updating = updateMutation.status === "pending";

  const saveEdit = () => {
    if (!editingOrder) return;
    const body: Record<string, unknown> = {
      price: editForm.price,
      volume: editForm.volume,
      expectedDeliveryDate: editForm.expectedDeliveryDate || null,
      dateDelivered: editForm.dateDelivered || null,
    };
    if (editForm.accountId && Number(editForm.accountId) !== editingOrder.accountId) {
      body.accountId = Number(editForm.accountId);
    }
    updateMutation.mutate({ id: editingOrder.id, body });
  };

  const accountTypeMap = useMemo(() => {
    const map: Record<number, string | null> = {};
    accounts.forEach(a => { map[a.id] = a.productType; });
    return map;
  }, [accounts]);

  const tableOrders = useMemo(
    () => filterByPeriod(allOrders, viewMode, selectedMonth, selectedWeek),
    [allOrders, viewMode, selectedMonth, selectedWeek],
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
            <div className={cn(
              "space-y-4 mb-4 border rounded-xl p-4",
              isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5",
            )}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Account</label>
                  <AccountSearchSelect
                    value={form.accountId}
                    onChange={v => setForm(f => ({ ...f, accountId: v }))}
                    accounts={accounts}
                    isLoading={accountsLoading}
                    isLight={isLight}
                  />
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
                  <div className="relative">
                    <input
                      type="date"
                      value={dmyToIso(form.expectedDeliveryDate)}
                      onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: isoToDmy(e.target.value) }))}
                      className={cn(inputClass, "pr-10 [color-scheme:light] dark:[color-scheme:dark]")}
                    />
                    <Calendar className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4", isLight ? "text-slate-400" : "text-muted-foreground")} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Date Ordered</label>
                  <input value={todayDMY()} disabled className={cn(inputClass, "bg-white/5 cursor-not-allowed")} />
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
            <div className="glass-card rounded-2xl p-4 border border-white/5 relative">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total Income</p>
                <button
                  type="button"
                  onClick={() => { setNgnRateDraft(exchange.ngnRate != null ? String(exchange.ngnRate) : ""); setNgnRateOpen(o => !o); }}
                  title="Set Naira rate"
                  className={cn(
                    "p-1 rounded-md transition-colors",
                    isLight ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100" : "text-muted-foreground hover:text-foreground hover:bg-white/10",
                  )}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={cn(
                "mt-1 text-xs",
                exchange.ngnRate ? (isLight ? "text-emerald-600" : "text-emerald-400") : "text-muted-foreground italic",
              )}>
                {exchange.ngnRate
                  ? `≈ ${exchange.fmtNGN(totalIncome)}`
                  : "Set Naira rate to convert"}
              </p>
              {exchange.ngnRate && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  ₦{exchange.ngnRate.toLocaleString("en-NG", { maximumFractionDigits: 2 })}/USD
                  {exchange.fetchedAt && ` · ${exchange.getLastUpdated()}`}
                </p>
              )}

              {ngnRateOpen && (
                <div className={cn(
                  "absolute top-full right-0 mt-2 z-50 w-72 rounded-xl border p-3 shadow-xl",
                  isLight ? "bg-white border-slate-200" : "bg-card border-white/10",
                )}>
                  <p className={cn("text-xs font-semibold mb-2", isLight ? "text-slate-900" : "text-foreground")}>
                    Naira exchange rate
                  </p>
                  <p className={cn("text-[10px] mb-3", isLight ? "text-slate-500" : "text-muted-foreground")}>
                    Override the auto-fetched rate. Leave blank to use the live rate.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">₦</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ngnRateDraft}
                      onChange={e => setNgnRateDraft(e.target.value)}
                      placeholder="e.g. 1650.50"
                      className={cn(
                        "flex-1 h-8 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                        isLight ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-black/20 text-foreground",
                      )}
                    />
                    <span className="text-xs text-muted-foreground">/ USD</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => { exchange.setManualNGN(null); setNgnRateOpen(false); }}
                      className={cn(
                        "text-[10px] underline",
                        isLight ? "text-slate-500 hover:text-slate-700" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Reset to live rate
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNgnRateOpen(false)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs border",
                          isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
                        )}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const v = Number(ngnRateDraft);
                          if (Number.isFinite(v) && v > 0) {
                            exchange.setManualNGN(v);
                            setNgnRateOpen(false);
                          }
                        }}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Date</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{todayDMY()}</p>
            </div>
          </div>
        </div>

        {/* Right side: Currency Converter + Leading Product Type Chart - fit within form height */}
        <div className="flex flex-col gap-4 h-[480px] sm:h-[540px]">
          {/* Currency Converter */}
          <div className={cn(
            "rounded-2xl border p-4 flex flex-col gap-3",
            isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5",
          )}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">CURRENCY CONVERTER</p>
              <span className={cn("text-xs font-medium px-2 py-1 rounded-full", isLight ? "bg-emerald-100 text-emerald-700" : "bg-emerald-500/20 text-emerald-400")}>
                ₦ 1 USD = ₦{exchange.ngnRate?.toLocaleString("en-NG", { maximumFractionDigits: 2 }) || "—"}
              </span>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Amount</label>
              <input
                type="number"
                value={converterAmount}
                onChange={e => setConverterAmount(e.target.value)}
                placeholder="Enter amount"
                className={cn("w-full h-9 rounded-lg border px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/20")}
              />
            </div>

            {/* From/To selectors */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">From</label>
                <select
                  value={converterFrom}
                  onChange={e => setConverterFrom(e.target.value as "NGN" | "USD")}
                  className={cn("w-full h-9 rounded-lg border px-2 text-xs font-medium", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/20")}
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="flex items-center justify-center">
                <span className="text-xs text-muted-foreground">→</span>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">To</label>
                <select disabled className={cn("w-full h-9 rounded-lg border px-2 text-xs font-medium", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/20")}>
                  <option>{converterFrom === "NGN" ? "USD" : "NGN"}</option>
                </select>
              </div>
            </div>

            {/* Result */}
            {converterAmount && exchange.ngnRate && (
              <div className={cn("rounded-lg p-3 text-center", isLight ? "bg-emerald-50 border border-emerald-200" : "bg-emerald-500/10 border border-emerald-500/20")}>
                <p className={cn("text-sm font-bold", isLight ? "text-emerald-900" : "text-emerald-400")}>
                  {converterFrom === "NGN"
                    ? `${Number(converterAmount).toLocaleString()} NGN = $${(Number(converterAmount) / exchange.ngnRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `$${Number(converterAmount).toLocaleString()} = ₦${(Number(converterAmount) * exchange.ngnRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  }
                </p>
              </div>
            )}

            <p className={cn("text-[10px]", isLight ? "text-slate-500" : "text-muted-foreground")}>
              {exchange.getLastUpdated ? `Updated ${exchange.getLastUpdated()}` : "—"}
            </p>
          </div>

          {/* Leading Product Type Chart - flex-1 to fill remaining space */}
          <div className="flex-1 min-h-0">
            <LeadingProductTypeChart allOrders={allOrders} accountTypeMap={accountTypeMap} />
          </div>
        </div>
      </div>

      {/* Search + export bar above the table */}
      <div className="flex flex-col gap-3">
        {/* Month/Week selector for specific filtering */}
        {(viewMode === "monthly" || viewMode === "weekly") && (
          <div className="flex items-center gap-3">
            {viewMode === "monthly" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Select Month:</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                    isLight ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-black/20 text-foreground",
                  )}
                />
                {selectedMonth && (
                  <button
                    onClick={() => setSelectedMonth("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {viewMode === "weekly" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Select Week:</label>
                <input
                  type="week"
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(e.target.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                    isLight ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-black/20 text-foreground",
                  )}
                />
                {selectedWeek && (
                  <button
                    onClick={() => setSelectedWeek("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="sf-field flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
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
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(order)}
                          title="Edit order"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete order for ${order.accountCompany || "this account"}? This removes related production-planning data too.`)) {
                              deleteMutation.mutate(order.id);
                            }
                          }}
                          title="Delete order"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget && !updating) setEditingOrder(null); }}
        >
          <div className="glass-card rounded-2xl border border-white/10 w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sales Force</p>
                <h2 className="text-lg font-bold text-foreground">Edit Production Order</h2>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                disabled={updating}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Account</label>
                <select
                  value={editForm.accountId}
                  onChange={e => setEditForm(f => ({ ...f, accountId: e.target.value }))}
                  className={inputClass}
                  disabled={accountsLoading}
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.company} — {a.productName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Price ($/kg)</label>
                  <input
                    value={editForm.price}
                    onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                    type="number" step="0.01" min="0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Volume (kg)</label>
                  <input
                    value={editForm.volume}
                    onChange={e => setEditForm(f => ({ ...f, volume: e.target.value }))}
                    type="number" step="0.01" min="0"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Expected Delivery</label>
                  <input
                    value={editForm.expectedDeliveryDate}
                    onChange={e => setEditForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
                    type="text" placeholder="dd/mm/yyyy"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Date Delivered</label>
                  <input
                    value={editForm.dateDelivered}
                    onChange={e => setEditForm(f => ({ ...f, dateDelivered: e.target.value }))}
                    type="text" placeholder="dd/mm/yyyy"
                    className={inputClass}
                  />
                </div>
              </div>
              {updateMutation.isError && (
                <p className="text-sm text-red-400">{(updateMutation.error as Error)?.message || "Failed to save."}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingOrder(null)}
                disabled={updating}
                className="px-4 py-2 rounded-xl border border-white/10 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={updating || !editForm.price || !editForm.volume}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {updating ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
