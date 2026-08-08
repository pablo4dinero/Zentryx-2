import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Download, Trash2, Maximize2, Minimize2, Edit3, X, Calendar, ChevronDown, Pencil, RefreshCw, History, SlidersHorizontal, Check } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useGetCurrentUser } from "@/api-client";
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

// ─── Column customization ────────────────────────────────────────────────────

type ColumnKey =
  | "account" | "product" | "productType" | "price" | "volume"
  | "timeCreated" | "ordered" | "expected" | "createdBy" | "delivered"
  | "manager" | "income";

type ColPrefs = {
  order: ColumnKey[];
  widths: Record<string, number>;
  visible: Record<string, boolean>;
};

const ALL_COLUMNS: { key: ColumnKey; label: string; defaultWidth: number }[] = [
  { key: "account",     label: "Account",      defaultWidth: 130 },
  { key: "product",     label: "Product",      defaultWidth: 130 },
  { key: "productType", label: "Product Type", defaultWidth: 130 },
  { key: "price",       label: "Price",        defaultWidth: 110 },
  { key: "volume",      label: "Volume",       defaultWidth: 90  },
  { key: "timeCreated", label: "Time Created", defaultWidth: 120 },
  { key: "ordered",     label: "Ordered",      defaultWidth: 110 },
  { key: "expected",    label: "Expected",     defaultWidth: 110 },
  { key: "createdBy",   label: "Created By",   defaultWidth: 130 },
  { key: "delivered",   label: "Delivered",    defaultWidth: 110 },
  { key: "manager",     label: "Manager",      defaultWidth: 130 },
  { key: "income",      label: "Income",       defaultWidth: 150 },
];

const DEFAULT_COL_ORDER  = ALL_COLUMNS.map(c => c.key) as ColumnKey[];
const DEFAULT_COL_WIDTHS = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultWidth])) as Record<string, number>;
const DEFAULT_COL_VIS    = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, true])) as Record<string, boolean>;

function getUserIdFromToken(): string {
  try {
    const token = localStorage.getItem("rd_token");
    if (!token) return "anon";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return String(payload.userId ?? payload.sub ?? "anon");
  } catch { return "anon"; }
}

function loadColPrefs(userId: string): ColPrefs {
  try {
    const raw = localStorage.getItem(`po_col_prefs_${userId}`);
    if (!raw) return { order: DEFAULT_COL_ORDER, widths: { ...DEFAULT_COL_WIDTHS }, visible: { ...DEFAULT_COL_VIS } };
    const s = JSON.parse(raw);
    return {
      order:   Array.isArray(s.order) ? s.order : DEFAULT_COL_ORDER,
      widths:  { ...DEFAULT_COL_WIDTHS, ...(s.widths ?? {}) },
      visible: { ...DEFAULT_COL_VIS,    ...(s.visible ?? {}) },
    };
  } catch { return { order: DEFAULT_COL_ORDER, widths: { ...DEFAULT_COL_WIDTHS }, visible: { ...DEFAULT_COL_VIS } }; }
}

// ─────────────────────────────────────────────────────────────────────────────

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
  createdByName?: string | null;
};

type Account = {
  id: number;
  company: string;
  productName: string;
  productType: string | null;
};

type ViewMode = "daily" | "weekly" | "monthly" | "yearly" | "all";
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
  // DD/MM/YYYY
  const parts = date.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const parsed = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  // ISO YYYY-MM-DD fallback
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const parsed = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
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

function isCurrentWeek(date: string | null | undefined): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const now = new Date();
  const day = now.getDay();
  // ISO Mon=start: if today is Sunday (0), Monday was -6 days ago
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  monday.setHours(0, 0, 0, 0);
  sunday.setHours(23, 59, 59, 999);
  return parsed >= monday && parsed <= sunday;
}

function isCurrentMonth(date: string | null | undefined): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  const now = new Date();
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
}

function isCurrentYear(date: string | null | undefined): boolean {
  const parsed = parseDMY(date);
  if (!parsed) return false;
  return parsed.getFullYear() === new Date().getFullYear();
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
  const [yearPart, weekPart] = weekStr.split("W");
  const year = parseInt(yearPart);
  const week = parseInt(weekPart);

  // ISO 8601: week 1 contains January 4th; Monday is week-start
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = jan4.getDay(); // 0=Sun
  const weekStart = new Date(jan4);
  // Snap jan4 back to its Monday
  weekStart.setDate(jan4.getDate() - (jan4Dow === 0 ? 6 : jan4Dow - 1));
  // Advance to the target week
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return parsed >= weekStart && parsed <= weekEnd;
}

function filterByPeriod(orders: TodayOrder[], period: string, selectedMonth?: string, selectedWeek?: string, selectedYear?: number): TodayOrder[] {
  if (period === "all") return orders;
  if (period === "yearly") {
    if (selectedYear) {
      return orders.filter(o => {
        const parsed = parseDMY(o.dateOrdered);
        return parsed ? parsed.getFullYear() === selectedYear : false;
      });
    }
    return orders.filter(o => isCurrentYear(o.dateOrdered));
  }
  if (period === "monthly") {
    if (selectedMonth) return orders.filter(o => isInMonth(o.dateOrdered, selectedMonth));
    return orders.filter(o => isCurrentMonth(o.dateOrdered));
  }
  if (period === "weekly") {
    if (selectedWeek) return orders.filter(o => isInWeek(o.dateOrdered, selectedWeek));
    return orders.filter(o => isCurrentWeek(o.dateOrdered));
  }
  return orders.filter(o => isTodayDate(o.dateOrdered)); // "daily"
}

const inputClass = "sf-field w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground";

// ─── Analytics panel size (persisted to localStorage) ────────────────────────
const ANALYTICS_LS_KEY = "sf_analytics_size";
const ANALYTICS_H_MIN = 360; const ANALYTICS_H_MAX = 900; const ANALYTICS_H_STEP = 60;
const ANALYTICS_W_MIN = 320; const ANALYTICS_W_MAX = 700; const ANALYTICS_W_STEP = 40;
const ANALYTICS_H_DEFAULT = 540; const ANALYTICS_W_DEFAULT = 430;

function loadAnalyticsSize(): { h: number; w: number } {
  try {
    const raw = localStorage.getItem(ANALYTICS_LS_KEY);
    if (!raw) return { h: ANALYTICS_H_DEFAULT, w: ANALYTICS_W_DEFAULT };
    const s = JSON.parse(raw);
    return {
      h: typeof s.h === "number" ? Math.max(ANALYTICS_H_MIN, Math.min(ANALYTICS_H_MAX, s.h)) : ANALYTICS_H_DEFAULT,
      w: typeof s.w === "number" ? Math.max(ANALYTICS_W_MIN, Math.min(ANALYTICS_W_MAX, s.w)) : ANALYTICS_W_DEFAULT,
    };
  } catch { return { h: ANALYTICS_H_DEFAULT, w: ANALYTICS_W_DEFAULT }; }
}
// ─────────────────────────────────────────────────────────────────────────────

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

function ChartTooltip({ active, payload, isLight, canViewIncome }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className={cn(
      "rounded-xl p-3 border text-xs shadow-xl backdrop-blur-sm",
      isLight
        ? "bg-white border-slate-200 text-gray-900"
        : "bg-black/80 border-white/20 text-slate-200",
    )}>
      <p className="font-semibold mb-1">{item.name}</p>
      {canViewIncome && (
        <p className="text-emerald-400">
          Income: ₦{Number(item.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
      <p className={isLight ? "text-gray-500" : "text-slate-400"}>{item.payload.percentage?.toFixed(1)}% of total</p>
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
  canViewIncome = false,
}: {
  allOrders: TodayOrder[];
  accountTypeMap: Record<number, string | null>;
  canViewIncome?: boolean;
}) {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("all");
  const [selectedChartYear, setSelectedChartYear] = useState<number>(new Date().getFullYear());
  const [fullscreen, setFullscreen] = useState(false);
  const { theme: _chartTheme } = useTheme();
  const isChartLight = _chartTheme === "light";

  const chartOrders = useMemo(
    () => filterByPeriod(allOrders, chartPeriod, undefined, undefined, selectedChartYear),
    [allOrders, chartPeriod, selectedChartYear],
  );

  const { chartData, totalIncome, totalVolume, productTypesCount, leadingType } = useMemo(() => {
    const grouped: Record<string, number> = {};
    let total = 0;
    let vol = 0;
    for (const order of chartOrders) {
      const pt = accountTypeMap[order.accountId] ?? "other";
      const income = Number(order.price || 0) * Number(order.volume || 0);
      grouped[pt] = (grouped[pt] ?? 0) + income;
      total += income;
      vol += Number(order.volume || 0);
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
    return { chartData: data, totalIncome: total, totalVolume: vol, productTypesCount: entries.length, leadingType: leading };
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

      <div className="flex flex-wrap gap-1 mb-2">
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

      {chartPeriod === "yearly" && (
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Year:</label>
          <select
            value={selectedChartYear}
            onChange={e => setSelectedChartYear(Number(e.target.value))}
            className={cn(
              "h-7 rounded-lg border px-2 text-xs focus:outline-none cursor-pointer",
              isChartLight ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-black/20 text-foreground",
            )}
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y} className="bg-card">{y}</option>
            ))}
          </select>
        </div>
      )}

      <div className={cn("grid gap-2 mb-4", canViewIncome ? "grid-cols-4" : "grid-cols-3")}>
        {canViewIncome && (
          <div className="glass-card rounded-xl p-3 border border-white/5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">Total Income</p>
            <p className="mt-1 text-sm font-bold text-foreground truncate">
              ₦{totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}
        <div className="glass-card rounded-xl p-3 border border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">Total Volume</p>
          <p className="mt-1 text-sm font-bold text-foreground truncate">{totalVolume.toLocaleString()} KG</p>
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
              <Tooltip content={(props) => <ChartTooltip {...props} isLight={isChartLight} canViewIncome={canViewIncome} />} />
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
    <div className="glass-card rounded-2xl p-4 sm:p-6 border border-white/5 flex flex-col h-full">
      {inner}
    </div>
  );
}

export default function NewProductionOrdersPage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const exchange = useExchangeRate();
  const { data: currentUser } = useGetCurrentUser();
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
  const [convAmount, setConvAmount] = useState<string>("");
  const [convFrom, setConvFrom] = useState<string>("NGN");
  const [convTo, setConvTo] = useState<string>("USD");
  const [allRates, setAllRates] = useState<Record<string, number> | null>(null);
  const [manualRateCurrency, setManualRateCurrency] = useState<string>("NGN");
  const [manualConvRate, setManualConvRate] = useState<string>("");
  const [showManualConv, setShowManualConv] = useState(false);
  const [ratesRefreshing, setRatesRefreshing] = useState(false);

  // Analytics panel sizing (persisted)
  const [analyticsSize, setAnalyticsSize] = useState<{ h: number; w: number }>(loadAnalyticsSize);
  const [isDraggingW, setIsDraggingW] = useState(false);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isXL, setIsXL] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const handler = (e: MediaQueryListEvent) => setIsXL(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const startWidthDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = analyticsSize.w;
    setIsDraggingW(true);
    let lastW = startW;
    const onMove = (ev: MouseEvent) => {
      // dragging left → panel grows wider
      lastW = Math.max(ANALYTICS_W_MIN, Math.min(ANALYTICS_W_MAX, startW + (startX - ev.clientX)));
      setAnalyticsSize(prev => ({ ...prev, w: lastW }));
    };
    const onUp = () => {
      setIsDraggingW(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setAnalyticsSize(prev => {
        const next = { ...prev, w: lastW };
        localStorage.setItem(ANALYTICS_LS_KEY, JSON.stringify(next));
        return next;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [analyticsSize.w]);

  const startHeightDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = analyticsSize.h;
    setIsDraggingH(true);
    let lastH = startH;
    const onMove = (ev: MouseEvent) => {
      // dragging down → panel grows taller
      lastH = Math.max(ANALYTICS_H_MIN, Math.min(ANALYTICS_H_MAX, startH + (ev.clientY - startY)));
      setAnalyticsSize(prev => ({ ...prev, h: lastH }));
    };
    const onUp = () => {
      setIsDraggingH(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setAnalyticsSize(prev => {
        const next = { ...prev, h: lastH };
        localStorage.setItem(ANALYTICS_LS_KEY, JSON.stringify(next));
        return next;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [analyticsSize.h]);

  // Currency converter constants and helpers
  const SUPPORTED_CURRENCIES = ["NGN", "USD", "EUR", "GBP", "ZAR", "CNY", "KES", "GHS", "ZMW"] as const;

  const fetchRates = useCallback(() => {
    setRatesRefreshing(true);
    const token = localStorage.getItem("rd_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${BASE}api/exchange-rate`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { if (d?.rates) setAllRates(d.rates); })
      .catch(() => { /* keep prior rates */ })
      .finally(() => setRatesRefreshing(false));
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  const isUsdNgnPair = (a: string, b: string) =>
    (a === "USD" && b === "NGN") || (a === "NGN" && b === "USD");

  const manualRateNum = manualConvRate ? parseFloat(manualConvRate) : NaN;
  const manualRateValid = !isNaN(manualRateNum) && manualRateNum > 0;
  const usdRateFor = (currency: string, allowManual: boolean): number | null => {
    if (currency === "USD") return 1;
    if (allowManual && currency === manualRateCurrency && manualRateValid) return manualRateNum;
    const live = allRates?.[currency];
    return typeof live === "number" ? live : null;
  };

  const allowManualForPair = !isUsdNgnPair(convFrom, convTo);
  const liveConvRate = (() => {
    const fromUsd = usdRateFor(convFrom, allowManualForPair);
    const toUsd = usdRateFor(convTo, allowManualForPair);
    if (!fromUsd || !toUsd) return null;
    return toUsd / fromUsd;
  })();
  const effectiveConvRate = liveConvRate;
  const manualOverrideActive = manualRateValid && allowManualForPair
    && (convFrom === manualRateCurrency || convTo === manualRateCurrency);

  const liveUsdNgn = allRates?.NGN ?? null;
  const convertedAmount = (() => {
    const amt = parseFloat(convAmount);
    if (!effectiveConvRate || isNaN(amt)) return null;
    return amt * effectiveConvRate;
  })();

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
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders/all"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders/all"] });
    },
  });

  const [eventsOrderId, setEventsOrderId]   = useState<number | null>(null);
  const [eventsOrder, setEventsOrder]       = useState<TodayOrder | null>(null);
  const [contextMenu, setContextMenu]       = useState<{ x: number; y: number; order: TodayOrder } | null>(null);
  const contextMenuRef                      = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!contextMenu) return;
    const h = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [contextMenu]);


  const { data: orderEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: [`/api/production-orders/${eventsOrderId}/events`],
    queryFn: async () => {
      if (!eventsOrderId) return [];
      const res = await fetch(`${BASE}api/production-orders/${eventsOrderId}/events`, { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: eventsOrderId !== null,
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders/all"] });
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

  const accountManagerMap = useMemo(() => {
    const map: Record<number, string> = {};
    (accounts as any[]).forEach((a: any) => {
      if (Array.isArray(a.accountManagerNames) && a.accountManagerNames.length > 0) {
        map[a.id] = a.accountManagerNames[0];
      }
    });
    return map;
  }, [accounts]);

  // Column customization — state and refs
  const userId       = useRef(getUserIdFromToken()).current;
  const prefsKey     = `po_col_prefs_${userId}`;
  const [colPrefs, setColPrefs] = useState<ColPrefs>(() => loadColPrefs(userId));
  const [showColToggle, setShowColToggle] = useState(false);
  const [colTogglePos, setColTogglePos] = useState<{ top: number; right: number } | null>(null);
  const colButtonRef   = useRef<HTMLButtonElement>(null);
  const colToggleRef   = useRef<HTMLDivElement>(null);
  const draggingColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const openColToggle = () => {
    if (colButtonRef.current) {
      const r = colButtonRef.current.getBoundingClientRect();
      setColTogglePos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setShowColToggle(true);
  };

  // Column resize – global mouse listeners
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const newW = Math.max(60, startWidth + (e.clientX - startX));
      setColPrefs(p => ({ ...p, widths: { ...p.widths, [key]: newW } }));
    };
    const onUp = () => { resizingRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  // Persist column prefs per user
  useEffect(() => {
    localStorage.setItem(prefsKey, JSON.stringify(colPrefs));
  }, [colPrefs, prefsKey]);

  // Close column toggle on outside click
  useEffect(() => {
    if (!showColToggle) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (colToggleRef.current?.contains(t) || colButtonRef.current?.contains(t)) return;
      setShowColToggle(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showColToggle]);

  const orderedVisibleCols = useMemo(
    () => colPrefs.order
      .map(key => ALL_COLUMNS.find(c => c.key === key)!)
      .filter(c => c && colPrefs.visible[c.key] !== false),
    [colPrefs.order, colPrefs.visible],
  );

  const renderCell = useCallback((key: ColumnKey, order: TodayOrder): React.ReactNode => {
    switch (key) {
      case "account":     return <span className="text-foreground">{order.accountCompany || "Unknown"}</span>;
      case "product":     return <span className="text-foreground">{order.productName || "—"}</span>;
      case "productType": return (
        <span className="text-xs text-muted-foreground">
          {accountTypeMap[order.accountId]
            ? (PRODUCT_TYPE_LABELS[accountTypeMap[order.accountId]!] ?? accountTypeMap[order.accountId])
            : "—"}
        </span>
      );
      case "price":       return `₦${Number(order.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case "volume":      return Number(order.volume || 0).toLocaleString();
      case "timeCreated": return (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      );
      case "ordered":     return order.dateOrdered || "—";
      case "expected":    return order.expectedDeliveryDate || "—";
      case "createdBy":   return <span className="text-xs text-muted-foreground">{order.createdByName || "—"}</span>;
      case "delivered":   return order.dateDelivered || "—";
      case "manager":     return <span className="text-xs text-muted-foreground">{accountManagerMap[order.accountId] || "—"}</span>;
      case "income":      return (
        <span className="text-emerald-400">
          ₦{(Number(order.price || 0) * Number(order.volume || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
      default: return "—";
    }
  }, [accountTypeMap, accountManagerMap]);

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

  const totalVolumeOrdered = useMemo(
    () => filteredOrders.reduce((sum, order) => sum + Number(order.volume || 0), 0),
    [filteredOrders],
  );

  const canViewIncome = ["admin", "executive", "manager"].includes((currentUser?.role ?? "").toLowerCase());

  const viewModeLabel = viewMode === "daily" ? "Daily"
    : viewMode === "weekly"  ? "Weekly"
    : viewMode === "monthly" ? "Monthly"
    : viewMode === "yearly"  ? "Yearly"
    : "All Time";
  const exportFileName = `production_orders_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const periodDescription = (() => {
    if (viewMode === "daily") return "Showing production orders placed today.";
    if (viewMode === "weekly") return "Showing production orders placed during the current week (Mon – Sun).";
    if (viewMode === "monthly") {
      if (selectedMonth) {
        const [yr, mo] = selectedMonth.split("-").map(Number);
        const label = new Date(yr, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
        return `Showing production orders placed in ${label}.`;
      }
      return "Showing production orders placed during the current calendar month.";
    }
    if (viewMode === "yearly") return `Showing production orders placed in ${new Date().getFullYear()}.`;
    return "Showing all production orders across all time.";
  })();

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
      "Price (₦/kg)": order.price,
      "Volume (kg)": order.volume,
      "Date Ordered": order.dateOrdered,
      "Expected Delivery": order.expectedDeliveryDate || "",
      "Date Delivered": order.dateDelivered || "",
      "Income (₦)": (Number(order.price || 0) * Number(order.volume || 0)).toFixed(2),
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
      <div
        className="grid grid-cols-1 gap-6 items-start"
        style={isXL ? { gridTemplateColumns: `1fr ${analyticsSize.w}px` } : undefined}
      >
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
            {(["daily", "weekly", "monthly", "yearly", "all"] as ViewMode[]).map(mode => (
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
                {mode === "daily" ? "Daily"
                  : mode === "weekly"  ? "Weekly"
                  : mode === "monthly" ? "Monthly"
                  : mode === "yearly"  ? "Yearly"
                  : "All Time"}
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
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Price (₦/kg)</label>
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

          <div className={cn("grid grid-cols-1 gap-4", canViewIncome ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Orders</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{filteredOrders.length}</p>
            </div>
            {canViewIncome && <div className="glass-card rounded-2xl p-4 border border-white/5 relative">
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
              <p className="mt-2 text-xl font-bold text-foreground truncate">
                ₦{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={cn(
                "mt-1 text-xs",
                exchange.ngnRate ? (isLight ? "text-emerald-600" : "text-emerald-400") : "text-muted-foreground italic",
              )}>
                {exchange.ngnRate
                  ? `≈ $${(totalIncome / exchange.ngnRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
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
            </div>}
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total Volume Ordered</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{totalVolumeOrdered.toLocaleString()} KG</p>
            </div>
          </div>
        </div>

        {/* Right side: Currency Converter + Leading Product Type Chart */}
        <div className="relative flex flex-col gap-2" style={{ height: analyticsSize.h }}>
          {/* Drag-to-resize: left edge → width (only on xl where columns are side-by-side) */}
          <div
            className="hidden xl:block absolute -left-3 top-4 bottom-4 w-6 z-20 cursor-col-resize group"
            onMouseDown={startWidthDrag}
            title="Drag to resize width"
          >
            <div className={cn(
              "absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-150",
              isDraggingW ? "h-20 bg-primary" : "h-12 bg-border/50 group-hover:h-20 group-hover:bg-primary/60",
            )} />
          </div>
          {/* Drag-to-resize: bottom edge → height */}
          <div
            className="absolute -bottom-2 left-6 right-6 h-4 z-20 cursor-row-resize flex items-center justify-center group"
            onMouseDown={startHeightDrag}
            title="Drag to resize height"
          >
            <div className={cn(
              "h-[3px] rounded-full transition-all duration-150",
              isDraggingH ? "w-24 bg-primary" : "w-12 bg-border/50 group-hover:w-24 group-hover:bg-primary/60",
            )} />
          </div>
          {/* Full-viewport overlay during drag — keeps cursor + prevents other elements stealing events */}
          {(isDraggingW || isDraggingH) && (
            <div className="fixed inset-0 z-50" style={{ cursor: isDraggingW ? "col-resize" : "row-resize" }} />
          )}
          {/* Currency Converter */}
          <div className={cn(
            "rounded-2xl border p-4 flex flex-col gap-3 overflow-hidden",
            isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5",
          )}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">CURRENCY CONVERTER</p>
                {liveUsdNgn && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    1 USD = ₦{liveUsdNgn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {liveConvRate !== null && !manualOverrideActive && (
                  <span className="text-[10px] text-emerald-400">Live</span>
                )}
                {manualOverrideActive && (
                  <span className="text-[10px] text-amber-400">Manual</span>
                )}
                <button onClick={fetchRates} disabled={ratesRefreshing}
                  className="text-[11px] text-primary hover:underline disabled:opacity-40">
                  {ratesRefreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">From</label>
                <div className="flex gap-1">
                  <input type="number" inputMode="decimal" value={convAmount}
                    onChange={e => setConvAmount(e.target.value)}
                    placeholder="Amount"
                    className="flex-1 min-w-0 h-9 rounded-lg border border-white/10 bg-black/20 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
                  <select value={convFrom} onChange={e => setConvFrom(e.target.value)}
                    className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground cursor-pointer">
                    {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c} className="bg-card">{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">To</label>
                <div className="flex gap-1">
                  <input type="text" readOnly
                    value={convertedAmount !== null ? convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 4 }) : ""}
                    placeholder={effectiveConvRate ? `Rate: ${effectiveConvRate.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "Loading rate…"}
                    className="flex-1 min-w-0 h-9 rounded-lg border border-white/10 bg-emerald-500/10 px-2 text-sm text-emerald-400 placeholder:text-muted-foreground/70" />
                  <select value={convTo} onChange={e => setConvTo(e.target.value)}
                    className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground cursor-pointer">
                    {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c} className="bg-card">{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <button onClick={() => setShowManualConv(s => !s)}
                className="text-[11px] text-muted-foreground hover:text-foreground">
                {showManualConv ? "Hide manual rate" : "Set rate manually"}
              </button>
              {effectiveConvRate && (
                <span className="text-[10px] text-muted-foreground">
                  1 {convFrom} = {effectiveConvRate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {convTo}
                </span>
              )}
            </div>
            {showManualConv && (
              <div className="flex flex-col gap-1 pt-2 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">1 USD =</span>
                  <input type="number" inputMode="decimal" value={manualConvRate}
                    onChange={e => setManualConvRate(e.target.value)}
                    placeholder={allRates?.[manualRateCurrency] ? `Live: ${allRates[manualRateCurrency].toLocaleString(undefined, { maximumFractionDigits: 4 })}` : ""}
                    className="flex-1 min-w-0 h-7 rounded-lg border border-white/10 bg-black/20 px-2 text-xs focus:outline-none text-foreground" />
                  <select value={manualRateCurrency} onChange={e => setManualRateCurrency(e.target.value)}
                    className="h-7 rounded-lg border border-white/10 bg-black/30 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground cursor-pointer">
                    {SUPPORTED_CURRENCIES.filter(c => c !== "USD").map(c => <option key={c} value={c} className="bg-card">{c}</option>)}
                  </select>
                  {manualConvRate && <button onClick={() => setManualConvRate("")} className="text-xs text-red-400">Clear</button>}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Override is applied automatically to any conversion involving {manualRateCurrency}.
                  {manualRateCurrency === "NGN" && (
                    <span className="block mt-0.5 text-emerald-400/80">USD ↔ NGN itself always uses the live rate shown in the header.</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Leading Product Type Chart - flex-1 to fill remaining space */}
          <div className="flex-1 min-h-0">
            <LeadingProductTypeChart allOrders={allOrders} accountTypeMap={accountTypeMap} canViewIncome={canViewIncome} />
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

        <div className="flex flex-wrap items-center gap-3">
          <div className="sf-field flex-1 min-w-[180px] flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
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
            className="inline-flex flex-shrink-0 items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors whitespace-nowrap"
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
            <p className="text-sm text-muted-foreground mt-1">{periodDescription}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Column visibility + order toggle */}
            <button
              ref={colButtonRef}
              onClick={() => showColToggle ? setShowColToggle(false) : openColToggle()}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
                showColToggle
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Columns
            </button>
            {showColToggle && colTogglePos && createPortal(
              <div
                ref={colToggleRef}
                style={{ position: "fixed", top: colTogglePos.top, right: colTogglePos.right, zIndex: 9999 }}
                className={cn(
                  "rounded-xl border shadow-2xl p-3 w-60",
                  isLight ? "bg-white border-slate-200" : "bg-[#16162a] border-white/10",
                )}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <p className={cn("text-xs font-semibold", isLight ? "text-slate-700" : "text-foreground")}>
                    Visible Columns
                  </p>
                  <button
                    onClick={() => setColPrefs({ order: [...DEFAULT_COL_ORDER], widths: { ...DEFAULT_COL_WIDTHS }, visible: { ...DEFAULT_COL_VIS } })}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Reset all
                  </button>
                </div>
                <p className={cn("text-[10px] mb-2.5", isLight ? "text-slate-400" : "text-muted-foreground")}>
                  Drag column headers to reorder. Drag edges to resize.
                </p>
                <div className="space-y-0.5">
                  {ALL_COLUMNS.map(col => {
                    const vis = colPrefs.visible[col.key] !== false;
                    return (
                      <button
                        key={col.key}
                        onClick={() => setColPrefs(p => ({ ...p, visible: { ...p.visible, [col.key]: !vis } }))}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left",
                          isLight ? "hover:bg-slate-50" : "hover:bg-white/5",
                        )}
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0",
                          vis ? "bg-primary border-primary" : isLight ? "border-slate-300" : "border-white/20",
                        )}>
                          {vis && <Check className="w-2 h-2 text-white" />}
                        </div>
                        <span className={cn(vis ? (isLight ? "text-slate-800" : "text-foreground") : (isLight ? "text-slate-400" : "text-muted-foreground"))}>
                          {col.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body
            )}
            <p className="text-xs text-muted-foreground">Updated {filteredOrders.length} orders</p>
          </div>
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
          <div className="table-scroll custom-scrollbar">
            <table className="text-sm" style={{ tableLayout: "fixed", width: orderedVisibleCols.reduce((s, c) => s + colPrefs.widths[c.key], 88) }}>
              <colgroup>
                {orderedVisibleCols.map(col => (
                  <col key={col.key} style={{ width: colPrefs.widths[col.key] }} />
                ))}
                <col style={{ width: 88 }} />
              </colgroup>
              <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground bg-white/5 border-b border-white/5">
                <tr>
                  {orderedVisibleCols.map(col => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-4 py-3 relative select-none cursor-grab active:cursor-grabbing whitespace-nowrap overflow-hidden",
                        dragOverCol === col.key && "border-l-2 border-primary",
                      )}
                      draggable
                      onDragStart={e => {
                        if (resizingRef.current) { e.preventDefault(); return; }
                        draggingColRef.current = col.key;
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => { draggingColRef.current = null; setDragOverCol(null); }}
                      onDragOver={e => {
                        e.preventDefault();
                        if (draggingColRef.current && draggingColRef.current !== col.key) setDragOverCol(col.key);
                      }}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={e => {
                        e.preventDefault();
                        const from = draggingColRef.current;
                        const to = col.key;
                        draggingColRef.current = null;
                        setDragOverCol(null);
                        if (!from || from === to) return;
                        setColPrefs(p => {
                          const next = [...p.order];
                          const fi = next.indexOf(from as ColumnKey);
                          const ti = next.indexOf(to as ColumnKey);
                          if (fi === -1 || ti === -1) return p;
                          next.splice(fi, 1);
                          next.splice(ti, 0, from as ColumnKey);
                          return { ...p, order: next };
                        });
                      }}
                    >
                      {col.label}
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-1/4 h-1/2 w-1 rounded-full cursor-col-resize opacity-0 hover:opacity-100 bg-primary/50 transition-opacity"
                        draggable={false}
                        onMouseDown={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          resizingRef.current = { key: col.key, startX: e.clientX, startWidth: colPrefs.widths[col.key] };
                        }}
                      />
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    className="hover:bg-white/5 cursor-context-menu"
                    onContextMenu={e => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, order });
                    }}
                  >
                    {orderedVisibleCols.map(col => (
                      <td key={col.key} className="px-4 py-3 overflow-hidden">
                        <div className="truncate">{renderCell(col.key, order)}</div>
                      </td>
                    ))}
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
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Price (₦/kg)</label>
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

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={cn(
            "fixed z-[100] rounded-xl border shadow-xl py-1 min-w-[160px]",
            isLight ? "bg-white border-slate-200" : "bg-[#16162a] border-white/10",
          )}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setEventsOrderId(contextMenu.order.id);
              setEventsOrder(contextMenu.order);
              setContextMenu(null);
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
              isLight ? "text-slate-700 hover:bg-slate-50" : "text-foreground hover:bg-white/5",
            )}
          >
            <History className="w-4 h-4 text-primary" />
            Events
          </button>
        </div>
      )}

      {/* Events slide-in panel */}
      {eventsOrderId !== null && (
        <div className="fixed inset-0 z-[90] flex" onClick={() => { setEventsOrderId(null); setEventsOrder(null); }}>
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" />
          {/* Panel */}
          <div
            className={cn(
              "w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col",
              isLight ? "bg-white" : "bg-[#16162a]",
            )}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={cn("flex items-center justify-between p-5 border-b", isLight ? "border-slate-100" : "border-white/5")}>
              <div>
                <h3 className={cn("font-bold text-base", isLight ? "text-slate-900" : "text-foreground")}>Order Events</h3>
                <p className={cn("text-xs mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>
                  {eventsOrder?.accountCompany || "Account"} — {eventsOrder?.productName || "Product"}
                </p>
              </div>
              <button
                onClick={() => { setEventsOrderId(null); setEventsOrder(null); }}
                className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-white/10 text-muted-foreground")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event list */}
            <div className="flex-1 p-5">
              {eventsLoading && (
                <div className="flex items-center justify-center h-40">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground opacity-40" />
                </div>
              )}
              {!eventsLoading && (orderEvents as any[]).length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <History className="w-10 h-10 opacity-20" />
                  <p className="text-sm">No events recorded yet.</p>
                </div>
              )}
              {!eventsLoading && (orderEvents as any[]).length > 0 && (
                <div className="relative">
                  {(orderEvents as any[]).length > 1 && (
                    <div className="absolute left-[9px] top-4 bottom-4 w-px bg-primary/20 rounded-full" />
                  )}
                  <div className="space-y-5">
                    {(orderEvents as any[]).map((ev: any, idx: number) => (
                      <div key={ev.id} className="relative pl-7">
                        {/* Timeline dot */}
                        <div className={cn(
                          "absolute left-[3px] top-1 w-[13px] h-[13px] rounded-full border-2 z-10 ring-[3px]",
                          isLight ? "ring-white" : "ring-[#16162a]",
                          idx === 0 ? "bg-primary border-primary/60" : "bg-primary/40 border-primary/20",
                        )} />
                        <div className={cn("rounded-xl border p-3", isLight ? "border-slate-100 bg-slate-50" : "border-white/5 bg-white/[0.02]")}>
                          {/* Event type badge + timestamp */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                              ev.eventType === "created"  ? "bg-emerald-500/10 text-emerald-500" :
                              ev.eventType === "edited"   ? "bg-blue-500/10 text-blue-400" :
                              ev.eventType === "planned"  ? "bg-purple-500/10 text-purple-400" :
                              ev.eventType === "deleted"  ? "bg-red-500/10 text-red-400" :
                              "bg-primary/10 text-primary",
                            )}>
                              {ev.eventType}
                            </span>
                            <span className={cn("text-[10px]", isLight ? "text-slate-400" : "text-muted-foreground")}>
                              {new Date(ev.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {/* Actor */}
                          <p className={cn("text-xs font-semibold", isLight ? "text-slate-800" : "text-foreground")}>
                            {ev.actorName}
                          </p>
                          {/* Module / section */}
                          {(ev.module || ev.section) && (
                            <p className={cn("text-[10px] mt-0.5", isLight ? "text-slate-500" : "text-muted-foreground")}>
                              {[ev.module, ev.section].filter(Boolean).join(" › ")}
                            </p>
                          )}
                          {/* Description */}
                          {ev.description && (
                            <p className={cn("text-xs mt-1.5 leading-relaxed", isLight ? "text-slate-600" : "text-foreground/70")}>
                              {ev.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
