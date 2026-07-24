import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetCurrentUser } from "@/api-client";
import {
  Phone, Video, Mail, Building2, UserPlus, Send, ChevronUp, ChevronDown,
  CalendarDays, X, MessageSquare, Clock, AlertCircle,
  Search, Star, Check, SlidersHorizontal, Filter,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

// ── Local API helper ───────────────────────────────────────────────────────────

function useApiCall() {
  const token = localStorage.getItem("rd_token");
  return useCallback(
    (url: string, options?: RequestInit) =>
      fetch(`${BASE}${url}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options?.headers || {}),
        },
      }),
    [token],
  );
}

// ── Constants & helpers (copied from [id].tsx) ─────────────────────────────────

const CALL_TYPES = [
  { value: "visit",  label: "Site Visit",   icon: Building2, color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  { value: "phone",  label: "Phone Call",   icon: Phone,     color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { value: "video",  label: "Video Call",   icon: Video,     color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  { value: "email",  label: "Email",        icon: Mail,      color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { value: "invite", label: "Invite",       icon: UserPlus,  color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
];

const OUTCOME_PRESETS = [
  { value: "positive",         label: "Positive",         color: "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" },
  { value: "neutral",          label: "Neutral",          color: "text-slate-400 border-slate-400/20 bg-slate-400/10" },
  { value: "follow_up_needed", label: "Follow Up Needed", color: "text-amber-500 border-amber-500/20 bg-amber-500/10" },
  { value: "stalled",          label: "Stalled",          color: "text-red-500 border-red-500/20 bg-red-500/10" },
];

const BLANK_FORM = () => ({
  callType: "phone",
  outcome: "",
  summary: "",
  nextSteps: "",
  calledAt: new Date().toISOString().slice(0, 16),
});

function outcomeStyle(value: string) {
  const p = OUTCOME_PRESETS.find(o => o.value === value);
  return p?.color ?? "text-primary border-primary/20 bg-primary/10";
}
function outcomeLabel(value: string) {
  return OUTCOME_PRESETS.find(o => o.value === value)?.label ?? value;
}

const CAL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CAL_DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toLocalISOString(d: Date) {
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + "T" +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

function DateTimePicker({
  value,
  onChange,
  isLight,
}: {
  value: string;
  onChange: (v: string) => void;
  isLight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value) : null;
  const refDate  = selected ?? new Date();

  const [viewYear,  setViewYear]  = useState(refDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(refDate.getMonth());

  const h24  = refDate.getHours();
  const min  = refDate.getMinutes();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12  = h24 % 12 || 12;

  const emit = (year: number, month: number, day: number, hour24: number, minute: number) => {
    onChange(toLocalISOString(new Date(year, month, day, hour24, minute)));
  };

  const changeHour = (delta: number) => {
    const newH12 = ((h12 - 1 + delta + 12) % 12) + 1;
    const newH24 = ampm === "AM" ? (newH12 === 12 ? 0 : newH12) : (newH12 === 12 ? 12 : newH12 + 12);
    emit(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), newH24, min);
  };

  const changeMinute = (delta: number) => {
    emit(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), h24, (min + delta + 60) % 60);
  };

  const toggleAmPm = () => {
    const newH24 = ampm === "AM"
      ? (h12 === 12 ? 12 : h12 + 12)
      : (h12 === 12 ? 0  : h12);
    emit(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), newH24, min);
  };

  const selectDay = (year: number, month: number, day: number) => {
    emit(year, month, day, h24, min);
  };

  const goToToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    emit(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes());
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev  = new Date(viewYear, viewMonth, 0).getDate();

  type Cell = { year: number; month: number; day: number; cur: boolean };
  const cells: Cell[] = [];
  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ year: viewMonth === 0 ? viewYear - 1 : viewYear, month: (viewMonth - 1 + 12) % 12, day: daysInPrev - i, cur: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ year: viewYear, month: viewMonth, day: d, cur: true });
  let overflow = 1;
  while (cells.length % 7 !== 0)
    cells.push({ year: viewMonth === 11 ? viewYear + 1 : viewYear, month: (viewMonth + 1) % 12, day: overflow++, cur: false });

  const today = new Date();
  const isSel   = (y: number, m: number, d: number) => selected && selected.getFullYear() === y && selected.getMonth() === m && selected.getDate() === d;
  const isToday = (y: number, m: number, d: number) => today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;

  const popBg    = isLight ? "bg-white border-slate-200 shadow-xl"    : "bg-[#16162a] border-white/10 shadow-2xl";
  const headTxt  = isLight ? "text-slate-900"  : "text-foreground";
  const mutedTxt = isLight ? "text-slate-400"  : "text-muted-foreground";
  const cellBase = isLight ? "text-slate-700"  : "text-foreground/80";
  const cellOther= isLight ? "text-slate-300"  : "text-foreground/20";
  const cellHov  = isLight ? "hover:bg-slate-100" : "hover:bg-white/10";
  const spinBtn  = isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-white/5 hover:bg-white/10 text-foreground";
  const divider  = isLight ? "border-slate-100" : "border-white/5";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open && value) {
            const d = new Date(value);
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
          }
          setOpen(o => !o);
        }}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors text-left",
          isLight
            ? "bg-white border-slate-200 text-slate-900 hover:border-slate-300 focus:outline-none focus:border-primary/50"
            : "bg-white/5 border-white/10 text-foreground hover:border-white/20 focus:outline-none focus:border-primary/50",
        )}
      >
        <span className={selected ? "" : mutedTxt}>
          {selected ? format(selected, "MM/dd/yyyy hh:mm aa") : "Select date & time"}
        </span>
        <CalendarDays className="w-4 h-4 shrink-0 opacity-40 ml-2" />
      </button>

      {open && (
        <div className={cn("absolute z-50 mt-1 rounded-2xl border p-4 w-[280px]", popBg)} style={{ right: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className={cn("p-1.5 rounded-lg transition-colors", spinBtn)}>
              <ChevronUp className="w-3.5 h-3.5 -rotate-90" />
            </button>
            <span className={cn("text-sm font-semibold select-none", headTxt)}>
              {CAL_MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className={cn("p-1.5 rounded-lg transition-colors", spinBtn)}>
              <ChevronUp className="w-3.5 h-3.5 rotate-90" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {CAL_DAYS.map(d => (
              <div key={d} className={cn("text-center text-[10px] font-semibold py-0.5 select-none", mutedTxt)}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((cell, i) => {
              const sel  = isSel(cell.year, cell.month, cell.day);
              const tod  = isToday(cell.year, cell.month, cell.day);
              return (
                <button
                  key={i}
                  onClick={() => selectDay(cell.year, cell.month, cell.day)}
                  className={cn(
                    "h-8 w-full text-xs rounded-lg flex items-center justify-center transition-colors font-medium select-none",
                    sel  ? "bg-primary text-white"
                    : tod ? "text-primary font-bold ring-1 ring-primary/30"
                    : cell.cur ? cellBase : cellOther,
                    !sel && cellHov,
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className={cn("border-t my-3", divider)} />

          <div className="flex items-center justify-center gap-2">
            <div className="flex flex-col items-center gap-0.5">
              <button onClick={() => changeHour(1)}  className={cn("p-1.5 rounded-lg transition-colors", spinBtn)}><ChevronUp   className="w-3.5 h-3.5" /></button>
              <div className={cn("w-10 text-center text-lg font-mono font-bold tabular-nums", headTxt)}>{String(h12).padStart(2, "0")}</div>
              <button onClick={() => changeHour(-1)} className={cn("p-1.5 rounded-lg transition-colors", spinBtn)}><ChevronDown className="w-3.5 h-3.5" /></button>
            </div>
            <span className={cn("text-xl font-bold select-none pb-0.5", headTxt)}>:</span>
            <div className="flex flex-col items-center gap-0.5">
              <button onClick={() => changeMinute(1)}  className={cn("p-1.5 rounded-lg transition-colors", spinBtn)}><ChevronUp   className="w-3.5 h-3.5" /></button>
              <div className={cn("w-10 text-center text-lg font-mono font-bold tabular-nums", headTxt)}>{String(min).padStart(2, "0")}</div>
              <button onClick={() => changeMinute(-1)} className={cn("p-1.5 rounded-lg transition-colors", spinBtn)}><ChevronDown className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-col gap-1 ml-1">
              {(["AM", "PM"] as const).map(period => (
                <button
                  key={period}
                  onClick={toggleAmPm}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                    ampm === period
                      ? "bg-primary/10 border-primary/20 text-primary"
                      : isLight ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
                  )}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          <div className={cn("flex justify-between mt-3 pt-2.5 border-t", divider)}>
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn("text-xs font-medium transition-colors", mutedTxt, isLight ? "hover:text-slate-700" : "hover:text-foreground")}
            >
              Clear
            </button>
            <button onClick={goToToday} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter dropdown sub-component ─────────────────────────────────────────────

type DateRange = "today" | "week" | "month" | "all";

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

function FilterDropdown({
  label,
  options,
  value,
  onChange,
  isLight,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  isLight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isActive = value !== "all";
  const activeLabel = options.find(o => o.value === value)?.label ?? value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : isLight
              ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
        )}
      >
        {label}
        {isActive && <span className="font-semibold">: {activeLabel}</span>}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 left-0 z-50 rounded-xl border shadow-xl min-w-[160px] max-h-60 overflow-y-auto custom-scrollbar",
            isLight ? "bg-white border-slate-200" : "bg-[#16162a] border-white/10",
          )}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
                value === opt.value
                  ? "text-primary font-semibold"
                  : isLight ? "text-slate-600 hover:bg-slate-50" : "text-muted-foreground hover:bg-white/5",
              )}
            >
              <span className="w-3 shrink-0">{value === opt.value && <Check className="w-3 h-3" />}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SalesForceCallReports() {
  const [, navigate] = useLocation();
  const queryClient  = useQueryClient();
  const api          = useApiCall();
  const { theme }    = useTheme();
  const isLight      = theme === "light";
  const { data: currentUser } = useGetCurrentUser();

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: reportsRaw = [], isLoading, isError } = useQuery({
    queryKey: ["all-call-reports"],
    queryFn: async () => {
      const r = await api("api/accounts/call-reports/all");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const r = await api("api/accounts");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [dateFilter,    setDateFilter]    = useState<DateRange>("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [assigneeFilter,setAssigneeFilter]= useState("all");
  const [sortByRecent,  setSortByRecent]  = useState(false);
  const [pinnedFilter,  setPinnedFilter]  = useState<Record<string, string> | null>(null);

  // Load pinned filter from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cr_default_filter");
      if (saved) {
        const pin = JSON.parse(saved) as Record<string, string>;
        setPinnedFilter(pin);
        if (pin.date)          setDateFilter(pin.date as DateRange);
        if (pin.account)       setAccountFilter(pin.account);
        if (pin.manager)       setManagerFilter(pin.manager);
        if (pin.assignee)      setAssigneeFilter(pin.assignee);
        if (pin.sortByRecent)  setSortByRecent(pin.sortByRecent === "true");
      }
    } catch {/* ignore */}
  }, []);

  const pinCurrentFilter = () => {
    const pin = {
      date: dateFilter,
      account: accountFilter,
      manager: managerFilter,
      assignee: assigneeFilter,
      sortByRecent: String(sortByRecent),
    };
    localStorage.setItem("cr_default_filter", JSON.stringify(pin));
    setPinnedFilter(pin);
  };

  // ── Form panel resize ───────────────────────────────────────────────────────
  const [formWidth, setFormWidth] = useState(400);
  const isDragging      = useRef(false);
  const dragStartX      = useRef(0);
  const dragStartWidth  = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      setFormWidth(Math.max(280, Math.min(900, dragStartWidth.current + delta)));
    };
    const onUp = () => { isDragging.current = false; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onDragHandleMouseDown = (e: React.MouseEvent) => {
    isDragging.current   = true;
    dragStartX.current   = e.clientX;
    dragStartWidth.current = formWidth;
    e.preventDefault();
  };

  // ── Account combobox state ───────────────────────────────────────────────────
  const [accountSearch,  setAccountSearch]  = useState("");
  const [accountDropOpen, setAccountDropOpen] = useState(false);
  const accountDropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountDropOpen) return;
    const h = (e: MouseEvent) => {
      if (accountDropRef.current && !accountDropRef.current.contains(e.target as Node)) setAccountDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [accountDropOpen]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [form,         setForm]         = useState(BLANK_FORM());
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState("");

  // Derived after selectedAccountId is declared
  const filteredAccountOptions = (accounts as any[]).filter((a: any) => {
    if (!accountSearch.trim()) return true;
    const q = accountSearch.toLowerCase();
    return (a.company ?? "").toLowerCase().includes(q) || (a.productName ?? "").toLowerCase().includes(q);
  });
  const selectedAccount = (accounts as any[]).find((a: any) => a.id === selectedAccountId);

  const resetForm = () => {
    setForm(BLANK_FORM());
    setSelectedAccountId(null);
    setAccountSearch("");
    setFormError("");
  };

  const handleSubmit = async () => {
    if (!selectedAccountId) { setFormError("Please select an account."); return; }
    if (!form.summary.trim()) { setFormError("Summary is required."); return; }
    if (!form.outcome.trim()) { setFormError("Outcome is required."); return; }
    if (!form.calledAt) { setFormError("Date & Time is required."); return; }

    setFormError("");
    setSubmitting(true);
    try {
      const res = await api(`api/accounts/${selectedAccountId}/call-reports`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          calledAt: new Date(form.calledAt).toISOString(),
          createdByName: (currentUser as any)?.name ?? "Unknown",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["all-call-reports"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${selectedAccountId}/call-reports`] });
      setForm(BLANK_FORM());
      setSelectedAccountId(null);
    } catch (err) {
      setFormError("Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived filter option lists ─────────────────────────────────────────────
  const allAccountNames = [...new Set(
    (reportsRaw as any[]).map((r: any) => r.accountName).filter(Boolean),
  )].sort() as string[];

  const allManagerNames = [...new Set(
    (accounts as any[]).flatMap((a: any) => a.accountManagerNames || []),
  )].sort() as string[];

  const allAssigneeNames = [...new Set(
    (reportsRaw as any[]).map((r: any) => r.createdByName).filter(Boolean),
  )].sort() as string[];

  // ── Filtering & sorting ─────────────────────────────────────────────────────
  const now = new Date();
  const reports = (reportsRaw as any[])
    .filter((r: any) => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const haystack = [r.summary, r.outcome, r.accountName, r.callType, r.createdByName]
          .filter(Boolean).map((s: string) => s.toLowerCase()).join(" ");
        if (!haystack.includes(q)) return false;
      }

      // Date range
      if (dateFilter !== "all") {
        const calledAt = new Date(r.calledAt);
        if (dateFilter === "today") {
          if (calledAt.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
          if (calledAt < weekAgo) return false;
        } else if (dateFilter === "month") {
          const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (calledAt < monthAgo) return false;
        }
      }

      // Account
      if (accountFilter !== "all" && r.accountName !== accountFilter) return false;

      // Account manager
      if (managerFilter !== "all") {
        const acct = (accounts as any[]).find((a: any) => a.id === r.accountId);
        if (!acct || !(acct.accountManagerNames || []).includes(managerFilter)) return false;
      }

      // Assignee (logged by)
      if (assigneeFilter !== "all" && r.createdByName !== assigneeFilter) return false;

      return true;
    })
    .sort((a: any, b: any) => {
      if (sortByRecent) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime();
    });

  // ── Active filter chips ─────────────────────────────────────────────────────
  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (dateFilter !== "all")    activeFilters.push({ key: "date",     label: `Date: ${DATE_RANGE_LABELS[dateFilter]}`,  clear: () => setDateFilter("all") });
  if (accountFilter !== "all") activeFilters.push({ key: "account",  label: `Account: ${accountFilter}`,              clear: () => setAccountFilter("all") });
  if (managerFilter !== "all") activeFilters.push({ key: "manager",  label: `Manager: ${managerFilter}`,              clear: () => setManagerFilter("all") });
  if (assigneeFilter !== "all")activeFilters.push({ key: "assignee", label: `Logged by: ${assigneeFilter}`,           clear: () => setAssigneeFilter("all") });
  if (sortByRecent)            activeFilters.push({ key: "recent",   label: "Recently Added",                          clear: () => setSortByRecent(false) });

  const hasActiveFilters = activeFilters.length > 0;

  // ── Input class helpers ─────────────────────────────────────────────────────
  const iCls = cn(
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground",
    isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10",
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-5 items-start min-h-0">

      {/* ── LEFT COLUMN: Search + Filters + Timeline ──────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reports by summary, outcome, account, type, or creator…"
            className={cn(
              "w-full h-10 pl-10 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground",
              isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10",
            )}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />

          {/* Date filter */}
          <FilterDropdown
            label="Date"
            options={[
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
            ]}
            value={dateFilter}
            onChange={v => setDateFilter(v as DateRange)}
            isLight={isLight}
          />

          {/* Account filter */}
          <FilterDropdown
            label="Account"
            options={[
              { value: "all", label: "All Accounts" },
              ...allAccountNames.map(n => ({ value: n, label: n })),
            ]}
            value={accountFilter}
            onChange={setAccountFilter}
            isLight={isLight}
          />

          {/* Account Manager filter */}
          <FilterDropdown
            label="Account Manager"
            options={[
              { value: "all", label: "All Managers" },
              ...allManagerNames.map(n => ({ value: n, label: n })),
            ]}
            value={managerFilter}
            onChange={setManagerFilter}
            isLight={isLight}
          />

          {/* Assignee filter */}
          <FilterDropdown
            label="Assignee"
            options={[
              { value: "all", label: "All" },
              ...allAssigneeNames.map(n => ({ value: n, label: n })),
            ]}
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            isLight={isLight}
          />

          {/* Recently Added toggle */}
          <button
            onClick={() => setSortByRecent(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap",
              sortByRecent
                ? "border-primary/30 bg-primary/10 text-primary"
                : isLight
                  ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
            )}
          >
            <Clock className="w-3 h-3" />
            Recently Added
          </button>

          {/* Pin defaults star */}
          {hasActiveFilters && (
            <button
              onClick={pinCurrentFilter}
              title="Pin current filters as default"
              className={cn(
                "p-1.5 rounded-lg border transition-colors",
                pinnedFilter
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : isLight ? "border-slate-200 text-slate-400 hover:text-amber-400 hover:border-amber-300" : "border-white/10 text-muted-foreground hover:text-amber-400 hover:border-amber-500/30",
              )}
            >
              <Star className={cn("w-3.5 h-3.5", pinnedFilter ? "fill-amber-400" : "")} />
            </button>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => {
                setDateFilter("all");
                setAccountFilter("all");
                setManagerFilter("all");
                setAssigneeFilter("all");
                setSortByRecent(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map(f => (
              <span
                key={f.key}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border",
                  isLight ? "border-primary/20 bg-primary/5 text-primary" : "border-primary/20 bg-primary/10 text-primary",
                )}
              >
                {f.label}
                <button onClick={f.clear} className="hover:text-primary/60 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Report count */}
        <div className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${reports.length} report${reports.length !== 1 ? "s" : ""}${hasActiveFilters || search ? " (filtered)" : ""}`}
        </div>

        {/* Timeline */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Clock className="w-10 h-10 opacity-20 animate-pulse" />
            <p className="text-sm">Loading call reports…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <AlertCircle className="w-10 h-10 opacity-40 text-red-400" />
            <p className="text-sm">Could not load call reports.</p>
          </div>
        )}

        {!isLoading && !isError && reports.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Phone className="w-12 h-12 opacity-20" />
            <p className="text-sm">{hasActiveFilters || search ? "No reports match your filters." : "No call reports yet."}</p>
          </div>
        )}

        {!isLoading && !isError && reports.length > 0 && (
          <div className="relative">
            {/* Vertical connector line */}
            {reports.length > 1 && (
              <div className="absolute left-[13px] top-5 bottom-5 w-px bg-primary/20 rounded-full" />
            )}
            <div className="space-y-4">
              {reports.map((r: any, idx: number) => {
                const ct = CALL_TYPES.find(c => c.value === r.callType) ?? CALL_TYPES[1];
                const CtIcon = ct.icon;
                return (
                  <div key={r.id} className="relative pl-8">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        "absolute left-[7px] top-[18px] w-[13px] h-[13px] rounded-full border-2 z-10 ring-[3px] ring-background transition-colors",
                        idx === 0
                          ? "bg-primary border-primary/60 shadow-[0_0_6px_rgba(139,92,246,0.4)]"
                          : "bg-primary/50 border-primary/30",
                      )}
                    />

                    <div className={cn(
                      "glass-card rounded-2xl border overflow-hidden transition-colors",
                      isLight ? "border-slate-200" : "border-white/5",
                    )}>
                      <div className="flex items-start gap-3 p-4">
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 mt-0.5", ct.color)}>
                          <CtIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", ct.color)}>{ct.label}</span>
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", outcomeStyle(r.outcome))}>
                              {outcomeLabel(r.outcome)}
                            </span>
                            {r.accountName && (
                              <button
                                onClick={() => navigate(`/sales-force/${r.accountId}`)}
                                className={cn(
                                  "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors",
                                  isLight
                                    ? "border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                                    : "border-white/10 bg-white/5 text-foreground/60 hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
                                )}
                              >
                                {r.accountName}
                                {(() => {
                                  const acct = (accounts as any[]).find((a: any) => a.id === r.accountId);
                                  return acct?.productName
                                    ? <span className="opacity-60 font-normal">— {acct.productName}</span>
                                    : null;
                                })()}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/70">{r.createdByName ?? "Unknown"}</span>
                            <span className="opacity-40">·</span>
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {r.calledAt ? format(new Date(r.calledAt), "MMM d, yyyy 'at' h:mm a") : "—"}
                            </span>
                            <span className="opacity-40">·</span>
                            <span>{r.calledAt ? formatDistanceToNow(new Date(r.calledAt), { addSuffix: true }) : ""}</span>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 pb-3">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{r.summary}</p>
                        {r.nextSteps && (
                          <div className={cn("mt-3 p-3 rounded-lg border", isLight ? "bg-slate-50 border-slate-100" : "bg-white/[0.03] border-white/5")}>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-medium">Next Steps</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{r.nextSteps}</p>
                          </div>
                        )}
                      </div>

                      {/* Comment count footer */}
                      <div className={cn("border-t px-4 py-2.5", isLight ? "border-slate-100" : "border-white/5")}>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {(r.comments?.length ?? 0) > 0
                            ? `${r.comments.length} comment${r.comments.length > 1 ? "s" : ""}`
                            : "No comments"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="w-3 self-stretch cursor-col-resize shrink-0 flex items-start justify-center pt-1 group"
        style={{ userSelect: "none" }}
      >
        <div className={cn("w-0.5 min-h-[200px] h-full rounded-full transition-colors group-hover:bg-primary/40", isLight ? "bg-slate-200" : "bg-white/10")} />
      </div>

      {/* ── RIGHT COLUMN: Log a Call form ─────────────────────────────── */}
      <div className="shrink-0 sticky top-4" style={{ width: formWidth }}>
        <div className={cn(
          "rounded-2xl border p-5 space-y-4",
          isLight ? "bg-white border-slate-200 shadow-sm" : "glass-card border-white/10",
        )}>
          <h4 className="font-semibold text-sm text-foreground">Log a Call</h4>

          {/* Account selector — searchable combobox */}
          <div ref={accountDropRef} className="relative">
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Account <span className="text-red-400">*</span>
            </label>
            <button
              type="button"
              onClick={() => { setAccountDropOpen(o => !o); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm text-left transition-colors",
                isLight ? "bg-white border-slate-200 hover:border-slate-300" : "bg-white/5 border-white/10 hover:border-white/20",
                !selectedAccount && (isLight ? "text-slate-400" : "text-muted-foreground"),
              )}
            >
              <span className="truncate">
                {selectedAccount
                  ? `${selectedAccount.company}${selectedAccount.productName ? ` — ${selectedAccount.productName}` : ""}`
                  : "Select account…"}
              </span>
              <ChevronDown className={cn("w-4 h-4 shrink-0 ml-2 opacity-50 transition-transform", accountDropOpen && "rotate-180")} />
            </button>

            {accountDropOpen && (
              <div className={cn(
                "absolute z-50 mt-1 w-full rounded-xl border shadow-xl overflow-hidden",
                isLight ? "bg-white border-slate-200" : "bg-[#16162a] border-white/10",
              )}>
                {/* Search input inside dropdown */}
                <div className={cn("p-2 border-b", isLight ? "border-slate-100" : "border-white/5")}>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      value={accountSearch}
                      onChange={e => setAccountSearch(e.target.value)}
                      placeholder="Search accounts…"
                      className={cn(
                        "w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40",
                        isLight ? "bg-slate-50 border-slate-200 text-slate-900" : "bg-white/5 border-white/10 text-foreground",
                      )}
                    />
                  </div>
                </div>
                {/* Options list */}
                <div className="max-h-52 overflow-y-auto">
                  {filteredAccountOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No accounts found</p>
                  ) : filteredAccountOptions.map((a: any) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { setSelectedAccountId(a.id); setAccountSearch(""); setAccountDropOpen(false); }}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-2.5 text-left text-xs transition-colors",
                        selectedAccountId === a.id
                          ? "text-primary font-semibold bg-primary/5"
                          : isLight ? "text-slate-700 hover:bg-slate-50" : "text-foreground/80 hover:bg-white/5",
                      )}
                    >
                      <span className="w-3.5 shrink-0 mt-0.5">{selectedAccountId === a.id && <Check className="w-3 h-3" />}</span>
                      <span className="min-w-0">
                        <span className="font-medium">{a.company}</span>
                        {a.productName && <span className={cn("ml-1.5", isLight ? "text-slate-400" : "text-muted-foreground")}>— {a.productName}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Call Type */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Call Type</label>
            <div className="flex flex-wrap gap-1.5">
              {CALL_TYPES.map(ct => {
                const Icon = ct.icon;
                return (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, callType: ct.value }))}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      form.callType === ct.value ? ct.color : isLight ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
                    )}
                  >
                    <Icon className="w-3 h-3" /> {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Time */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Date &amp; Time <span className="text-red-400">*</span>
            </label>
            <DateTimePicker
              value={form.calledAt}
              onChange={v => setForm(f => ({ ...f, calledAt: v }))}
              isLight={isLight}
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Outcome <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {OUTCOME_PRESETS.map(op => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, outcome: op.value }))}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                    form.outcome === op.value ? op.color : isLight ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
                  )}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <input
              value={form.outcome}
              onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
              placeholder="Or type a custom outcome…"
              className={iCls}
            />
          </div>

          {/* Summary */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Summary <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="What happened during this call / visit?"
              className={cn(iCls, "resize-none")}
            />
          </div>

          {/* Next Steps */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Next Steps <span className="opacity-50">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.nextSteps}
              onChange={e => setForm(f => ({ ...f, nextSteps: e.target.value }))}
              placeholder="What needs to happen next?"
              className={cn(iCls, "resize-none")}
            />
          </div>

          {/* Error */}
          {formError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {formError}
            </p>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedAccountId || !form.summary.trim() || !form.outcome.trim() || !form.calledAt}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Saving…" : "Log Call"}
          </button>

          {/* Reset link */}
          {(form.summary || form.outcome || form.nextSteps || selectedAccountId) && (
            <button
              type="button"
              onClick={resetForm}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Clear form
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
