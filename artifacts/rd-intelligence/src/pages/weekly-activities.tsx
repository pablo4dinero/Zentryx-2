import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Bell, Check,
  Loader2, ChevronDown, Users, X, Send, FileSpreadsheet,
  FileText, Search, ArrowUpDown, ArrowUp, ArrowDown, Package, ShoppingBag, Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { NewRequestModal } from "@/pages/procurement/RequestsTab";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL;

const MONTHS_LONG = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const PRODUCT_TYPES = [
  { value: "seasoning", label: "Seasoning" },
  { value: "dairy_premix", label: "Dairy Premix" },
  { value: "dough_and_bread_premix", label: "Dough & Bread Premix" },
  { value: "snack_dusting", label: "Snack Dusting" },
  { value: "functional_blend", label: "Functional Blend" },
  { value: "sweet_flavors", label: "Sweet Flavors" },
  { value: "savoury_flavours", label: "Savoury Flavours" },
];

const STATUS_OPTS = [
  { value: "not_started", label: "Not Started", cls: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  { value: "ongoing", label: "Ongoing", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { value: "completed", label: "Completed", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
];

const PRIORITY_OPTS = [
  { value: "low", label: "Low", cls: "text-blue-400 bg-blue-500/10" },
  { value: "medium", label: "Medium", cls: "text-amber-400 bg-amber-500/10" },
  { value: "high", label: "High", cls: "text-red-400 bg-red-500/10" },
];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("rd_token")}`, "Content-Type": "application/json" };
}

function initials(name: string) {
  return name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function avatarColor(name: string) {
  const c = ["from-violet-500 to-purple-600","from-blue-500 to-cyan-600","from-emerald-500 to-teal-600",
              "from-rose-500 to-pink-600","from-amber-500 to-orange-600","from-indigo-500 to-blue-600"];
  return c[name ? name.charCodeAt(0) % c.length : 0];
}

function MiniAvatar({ name, size = "sm" }: { name?: string; size?: "sm" | "xs" }) {
  const n = name || "?";
  const sz = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <div className={cn("rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0", sz, avatarColor(n))}>
      {initials(n)}
    </div>
  );
}

// ─── Date helpers (dd/mm/yyyy ↔ yyyy-mm-dd) ───────────────────────────────────
function isoToDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return "";
  // stored as yyyy-mm-dd
  const parts = iso.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function ddmmyyyyToISO(val: string): string {
  if (!val) return "";
  const parts = val.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return val;
}

// ─── NotifyModal ──────────────────────────────────────────────────────────────
function NotifyModal({ onClose, users }: { onClose: () => void; users: any[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const send = async () => {
    if (!selected.length) return;
    setSending(true);
    try {
      await fetch(`${BASE}api/weekly-activities/notify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          userIds: selected,
          title: "Weekly Activity Update",
          message: message || "You have a new weekly activity notification.",
        }),
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } finally { setSending(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Notify Account Manager
            </h3>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative mb-3">
            <input type="text" placeholder="Search staff…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>

          <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar mb-4">
            {filtered.map(u => (
              <button key={u.id} onClick={() => toggle(u.id)}
                className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all",
                  selected.includes(u.id) ? "bg-primary/15 border border-primary/30" : "hover:bg-white/5 border border-transparent"
                )}>
                <MiniAvatar name={u.name} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{u.role?.replace(/_/g, " ")}</p>
                </div>
                {selected.includes(u.id) && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>

          <textarea
            placeholder="Optional message…"
            rows={2}
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none mb-4"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={send} disabled={!selected.length || sending || sent}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50">
                {sent ? <><Check className="w-3.5 h-3.5" /> Sent!</>
                  : sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                  : <><Send className="w-3.5 h-3.5" /> Send Notification</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface ActivityRow {
  id: number;
  weeklyReportId: number;
  assignedUserId: number | null;
  assignedUser: { id: number; name: string; email: string; avatar?: string } | null;
  projectTitle: string;
  productType: string | null;
  status: string;
  priority: string;
  remarks: string;
  createdAt: string;
}

interface Week {
  id: number;
  month: number;
  year: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  label: string;
  samplesSent: string;
}

// ─── Dispatch Records ─────────────────────────────────────────────────────────
interface DispatchRecord {
  id: number;
  sampleCode: string;
  productDescription: string;
  customer: string;
  quantity: string | null;
  sentByUserId: number | null;
  sentByUser: { id: number; name: string } | null;
  dispatchMethod: string;
  productType: "sweet" | "savory" | null;
  dateSent: string | null;
  recipientName: string;
  recipientPhone: string;
  recipientMail: string;
  followUpMailSent: boolean;
  createdAt: string;
}

const DISPATCH_PRODUCT_OPTS = [
  { value: "sweet", label: "Sweet" },
  { value: "savory", label: "Savory" },
];

const DISPATCH_COLS: { key: keyof DispatchRecord | "sentByName"; label: string }[] = [
  { key: "sampleCode", label: "Sample Code" },
  { key: "productDescription", label: "Product Description" },
  { key: "customer", label: "Customer" },
  { key: "quantity", label: "Quantity (g)" },
  { key: "sentByName", label: "Sent by" },
  { key: "dispatchMethod", label: "Dispatch Method" },
  { key: "productType", label: "Product Type" },
  { key: "dateSent", label: "Date Sent" },
  { key: "recipientName", label: "Recipient Name" },
  { key: "recipientPhone", label: "Recipient Phone" },
  { key: "recipientMail", label: "Recipient Mail" },
  { key: "followUpMailSent", label: "Follow-up Mail Sent" },
];

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  sampleCode: "",
  productDescription: "",
  customer: "",
  quantity: "",
  sentByUserId: "",
  dispatchMethod: "",
  productType: "" as "" | "sweet" | "savory",
  dateSent: "",
  recipientName: "",
  recipientPhone: "",
  recipientMail: "",
  followUpMailSent: false,
};

function DispatchRecords({ users, isLight }: { users: any[]; isLight: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userDropOpen, setUserDropOpen] = useState(false);
  const userDropRef = useRef<HTMLDivElement>(null);

  const { data: records = [], isLoading } = useQuery<DispatchRecord[]>({
    queryKey: ["/api/weekly-activities/dispatch"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/weekly-activities/dispatch`, { headers: authHeaders() });
      return r.json();
    },
  });

  const createRecord = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`${BASE}api/weekly-activities/dispatch`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/weekly-activities/dispatch"] });
      setShowModal(false);
      setForm({ ...EMPTY_FORM });
    },
  });

  const toggleFollowUp = useMutation({
    mutationFn: async ({ id, val }: { id: number; val: boolean }) => {
      const r = await fetch(`${BASE}api/weekly-activities/dispatch/${id}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ followUpMailSent: val }),
      });
      return r.json();
    },
    onMutate: async ({ id, val }) => {
      await qc.cancelQueries({ queryKey: ["/api/weekly-activities/dispatch"] });
      qc.setQueryData(["/api/weekly-activities/dispatch"], (old: DispatchRecord[] = []) =>
        old.map(r => r.id === id ? { ...r, followUpMailSent: val } : r)
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/weekly-activities/dispatch"] }),
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}api/weekly-activities/dispatch/${id}`, { method: "DELETE", headers: authHeaders() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/weekly-activities/dispatch"] }),
  });

  // Close user dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userDropRef.current && !userDropRef.current.contains(e.target as Node)) setUserDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()));
  const selectedUserName = users.find(u => String(u.id) === form.sentByUserId)?.name ?? "";

  // Search & sort
  const searchLower = search.toLowerCase();
  const searched = useMemo(() => {
    if (!searchLower) return records;
    return records.filter(r => {
      const sentBy = r.sentByUser?.name ?? "";
      return [
        r.sampleCode, r.productDescription, r.customer, r.quantity ?? "",
        sentBy, r.dispatchMethod, r.productType ?? "", isoToDDMMYYYY(r.dateSent),
        r.recipientName, r.recipientPhone, r.recipientMail,
      ].some(v => String(v).toLowerCase().includes(searchLower));
    });
  }, [records, searchLower]);

  const sorted = useMemo(() => {
    return [...searched].sort((a: any, b: any) => {
      let av = sortKey === "sentByName" ? (a.sentByUser?.name ?? "") : (a[sortKey] ?? "");
      let bv = sortKey === "sentByName" ? (b.sentByUser?.name ?? "") : (b[sortKey] ?? "");
      if (typeof av === "boolean") av = av ? 1 : 0;
      if (typeof bv === "boolean") bv = bv ? 1 : 0;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [searched, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  }

  // ── Validation ──
  function validate() {
    const e: Record<string, string> = {};
    if (!form.sampleCode.trim()) e.sampleCode = "Required";
    if (!form.productDescription.trim()) e.productDescription = "Required";
    if (!form.customer.trim()) e.customer = "Required";
    if (form.quantity && isNaN(Number(form.quantity))) e.quantity = "Must be a number";
    if (!form.recipientName.trim()) e.recipientName = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await createRecord.mutateAsync({
        sampleCode: form.sampleCode,
        productDescription: form.productDescription,
        customer: form.customer,
        quantity: form.quantity ? Number(form.quantity) : null,
        sentByUserId: form.sentByUserId ? parseInt(form.sentByUserId) : null,
        dispatchMethod: form.dispatchMethod,
        productType: form.productType || null,
        dateSent: form.dateSent || null,
        recipientName: form.recipientName,
        recipientPhone: form.recipientPhone,
        recipientMail: form.recipientMail,
        followUpMailSent: form.followUpMailSent,
      });
    } finally { setSaving(false); }
  }

  // ── Exports ──
  function exportCSV() {
    const headers = DISPATCH_COLS.map(c => c.label);
    const rows = sorted.map(r => [
      r.sampleCode, r.productDescription, r.customer, r.quantity ?? "",
      r.sentByUser?.name ?? "", r.dispatchMethod,
      r.productType ? (r.productType === "sweet" ? "Sweet" : "Savory") : "",
      isoToDDMMYYYY(r.dateSent),
      r.recipientName, r.recipientPhone, r.recipientMail,
      r.followUpMailSent ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map(row =>
      row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "dispatch_records.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function exportXLSX() {
    const headers = DISPATCH_COLS.map(c => c.label);
    const rows = sorted.map(r => [
      r.sampleCode, r.productDescription, r.customer, r.quantity ? Number(r.quantity) : "",
      r.sentByUser?.name ?? "", r.dispatchMethod,
      r.productType ? (r.productType === "sweet" ? "Sweet" : "Savory") : "",
      isoToDDMMYYYY(r.dateSent),
      r.recipientName, r.recipientPhone, r.recipientMail,
      r.followUpMailSent ? "Yes" : "No",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dispatch Records");
    XLSX.writeFile(wb, "dispatch_records.xlsx");
  }

  const inputCls = cn(
    "w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground",
    isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10"
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className={cn("rounded-2xl border p-4 flex flex-wrap items-center gap-3",
        isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search all fields…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={cn("w-full pl-9 pr-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground")}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportXLSX}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors",
              isLight ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20")}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
          <button onClick={exportCSV}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors",
              isLight ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" : "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20")}>
            <FileText className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={() => { setForm({ ...EMPTY_FORM }); setErrors({}); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add New Dispatch Record
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr className={cn("text-left border-b", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-[#0f0f1a]")}>
                {DISPATCH_COLS.map(col => (
                  <th key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none">
                    <span className="flex items-center">
                      {col.label}
                      <SortIcon col={col.key} />
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3 text-xs font-semibold text-muted-foreground w-12 text-center">Del</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading records…
                </td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isLight ? "bg-slate-100" : "bg-white/5")}>
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                    {search ? "No records match your search." : "No dispatch records yet. Click \"Add New Dispatch Record\" to get started."}
                  </div>
                </td></tr>
              ) : paginated.map(r => (
                <tr key={r.id}
                  className={cn("border-b last:border-0 transition-colors",
                    isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/3")}>
                  <td className="px-3 py-2.5 text-xs font-mono text-foreground whitespace-nowrap">{r.sampleCode || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground max-w-[160px]">
                    <span className="line-clamp-2">{r.productDescription || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{r.customer || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap text-right pr-5">
                    {r.quantity ? Number(r.quantity).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">
                    {r.sentByUser ? (
                      <div className="flex items-center gap-1.5">
                        <MiniAvatar name={r.sentByUser.name} size="xs" />
                        <span>{r.sentByUser.name}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-foreground">{r.dispatchMethod || "—"}</td>
                  <td className="px-3 py-2.5">
                    {r.productType ? (
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                        r.productType === "sweet" ? "bg-pink-500/10 text-pink-400" : "bg-amber-500/10 text-amber-400")}>
                        {r.productType === "sweet" ? "Sweet" : "Savory"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{isoToDDMMYYYY(r.dateSent) || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{r.recipientName || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground whitespace-nowrap">{r.recipientPhone || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground">{r.recipientMail || "—"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => toggleFollowUp.mutate({ id: r.id, val: !r.followUpMailSent })}
                      className={cn("w-8 h-5 rounded-full transition-all relative shrink-0",
                        r.followUpMailSent ? "bg-emerald-500" : isLight ? "bg-slate-200" : "bg-white/10")}
                    >
                      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                        r.followUpMailSent ? "left-3.5" : "left-0.5")} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => { if (confirm("Delete this record?")) deleteRecord.mutate(r.id); }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className={cn("px-4 py-3 flex items-center justify-between border-t text-xs",
          isLight ? "border-slate-100 bg-slate-50/50" : "border-white/5 bg-white/2")}>
          <span className="text-muted-foreground">
            {sorted.length === 0 ? "No records" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, sorted.length)} of ${sorted.length}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc: (number | "...")[], p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => p === "..." ? (
                <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
              ) : (
                <button key={p}
                  onClick={() => setPage(p as number)}
                  className={cn("min-w-[26px] h-[26px] rounded-lg text-xs font-medium transition-colors",
                    page === p ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
                  {p}
                </button>
              ))}
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Dispatch Record Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className={cn("relative w-full max-w-2xl rounded-2xl border shadow-2xl z-10 max-h-[90vh] overflow-y-auto",
            isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
            <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between z-10",
              isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> Add Dispatch Record
              </h3>
              <button onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Sample Code */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sample Code <span className="text-destructive">*</span></label>
                <input className={cn(inputCls, errors.sampleCode && "border-destructive")}
                  value={form.sampleCode} onChange={e => setForm(f => ({ ...f, sampleCode: e.target.value }))}
                  placeholder="e.g. SC-2024-001" />
                {errors.sampleCode && <p className="text-xs text-destructive mt-1">{errors.sampleCode}</p>}
              </div>
              {/* Product Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Product Description <span className="text-destructive">*</span></label>
                <input className={cn(inputCls, errors.productDescription && "border-destructive")}
                  value={form.productDescription} onChange={e => setForm(f => ({ ...f, productDescription: e.target.value }))}
                  placeholder="Product description…" />
                {errors.productDescription && <p className="text-xs text-destructive mt-1">{errors.productDescription}</p>}
              </div>
              {/* Customer */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Customer <span className="text-destructive">*</span></label>
                <input className={cn(inputCls, errors.customer && "border-destructive")}
                  value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                  placeholder="Customer name…" />
                {errors.customer && <p className="text-xs text-destructive mt-1">{errors.customer}</p>}
              </div>
              {/* Quantity */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quantity (g)</label>
                <input className={cn(inputCls, errors.quantity && "border-destructive")}
                  type="number" min="0" step="0.001"
                  value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="0.000" />
                {errors.quantity && <p className="text-xs text-destructive mt-1">{errors.quantity}</p>}
              </div>
              {/* Sent By — searchable dropdown */}
              <div ref={userDropRef} className="relative">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sent by</label>
                <div className={cn("w-full px-3 py-2 rounded-xl text-sm border flex items-center gap-2 cursor-pointer",
                  isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10")}
                  onClick={() => setUserDropOpen(o => !o)}>
                  {selectedUserName ? (
                    <><MiniAvatar name={selectedUserName} size="xs" /><span className="text-foreground flex-1">{selectedUserName}</span></>
                  ) : <span className="text-muted-foreground flex-1">Select assignee…</span>}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
                {userDropOpen && (
                  <div className={cn("absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border shadow-lg overflow-hidden",
                    isLight ? "bg-white border-slate-200" : "bg-[#1a1a2e] border-white/10")}>
                    <div className="p-2 border-b border-white/5">
                      <input autoFocus className={cn("w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-primary/40",
                        isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10 text-foreground")}
                        placeholder="Search…" value={userSearch}
                        onChange={e => setUserSearch(e.target.value)} />
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      <button className="w-full px-3 py-1.5 text-xs text-left text-muted-foreground hover:bg-white/5"
                        onClick={() => { setForm(f => ({ ...f, sentByUserId: "" })); setUserDropOpen(false); setUserSearch(""); }}>
                        — None —
                      </button>
                      {filteredUsers.map(u => (
                        <button key={u.id}
                          onClick={() => { setForm(f => ({ ...f, sentByUserId: String(u.id) })); setUserDropOpen(false); setUserSearch(""); }}
                          className={cn("w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 transition-colors",
                            form.sentByUserId === String(u.id) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/5")}>
                          <MiniAvatar name={u.name} size="xs" />{u.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Dispatch Method */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Dispatch Method</label>
                <input className={inputCls}
                  value={form.dispatchMethod} onChange={e => setForm(f => ({ ...f, dispatchMethod: e.target.value }))}
                  placeholder="e.g. Courier, Hand delivery…" />
              </div>
              {/* Product Type */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Product Type</label>
                <select className={cn(inputCls, "appearance-none cursor-pointer")}
                  value={form.productType}
                  onChange={e => setForm(f => ({ ...f, productType: e.target.value as "" | "sweet" | "savory" }))}>
                  <option value="">— Select —</option>
                  {DISPATCH_PRODUCT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {/* Date Sent */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date Sent</label>
                <input type="date" className={inputCls}
                  value={form.dateSent}
                  onChange={e => setForm(f => ({ ...f, dateSent: e.target.value }))} />
              </div>
              {/* Recipient Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Recipient Name <span className="text-destructive">*</span></label>
                <input className={cn(inputCls, errors.recipientName && "border-destructive")}
                  value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
                  placeholder="Recipient name…" />
                {errors.recipientName && <p className="text-xs text-destructive mt-1">{errors.recipientName}</p>}
              </div>
              {/* Recipient Phone */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Recipient Phone</label>
                <input className={inputCls} type="tel"
                  value={form.recipientPhone} onChange={e => setForm(f => ({ ...f, recipientPhone: e.target.value }))}
                  placeholder="+234 000 000 0000" />
              </div>
              {/* Recipient Mail */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Recipient Mail</label>
                <input className={inputCls} type="email"
                  value={form.recipientMail} onChange={e => setForm(f => ({ ...f, recipientMail: e.target.value }))}
                  placeholder="recipient@email.com" />
              </div>
              {/* Follow-up mail sent */}
              <div className="flex items-center gap-3 pt-5">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, followUpMailSent: !f.followUpMailSent }))}
                  className={cn("w-10 h-6 rounded-full transition-all relative shrink-0",
                    form.followUpMailSent ? "bg-emerald-500" : isLight ? "bg-slate-200" : "bg-white/10")}>
                  <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
                    form.followUpMailSent ? "left-5" : "left-1")} />
                </button>
                <label className="text-sm text-foreground cursor-pointer"
                  onClick={() => setForm(f => ({ ...f, followUpMailSent: !f.followUpMailSent }))}>
                  Follow-up mail sent
                </label>
              </div>
            </div>

            <div className={cn("sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3",
              isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
              <button onClick={() => setShowModal(false)}
                className="px-5 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Check className="w-3.5 h-3.5" /> Save Record</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function WeeklyActivities() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<"tracker" | "dispatch" | "purchase_requests">("tracker");
  const [showPRModal, setShowPRModal] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [showNotify, setShowNotify] = useState(false);
  const [draftSamples, setDraftSamples] = useState("");
  const [sampleSaved, setSampleSaved] = useState(false);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [addingRow, setAddingRow] = useState(false);
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const { theme } = useTheme();
  const isLight = theme === "light";
  const qc = useQueryClient();

  const { data: usersData } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/users`, { headers: authHeaders() });
      return r.json();
    },
  });

  const { data: meData } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/auth/me`, { headers: authHeaders() });
      return r.json();
    },
  });

  const users: any[] = usersData ?? [];
  const me = meData;

  const { data: weeks = [], isLoading: weeksLoading } = useQuery<Week[]>({
    queryKey: ["/api/weekly-activities/weeks", month, year],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/weekly-activities/weeks?month=${month}&year=${year}`, { headers: authHeaders() });
      return r.json();
    },
  });

  useEffect(() => {
    if (!weeks.length) return;
    if (selectedWeekId && weeks.find(w => w.id === selectedWeekId)) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const current = weeks.find(w => w.startDate <= todayStr && w.endDate >= todayStr);
    setSelectedWeekId((current ?? weeks[0]).id);
  }, [weeks]);

  const selectedWeek = weeks.find(w => w.id === selectedWeekId) ?? null;

  useEffect(() => {
    if (selectedWeek) setDraftSamples(selectedWeek.samplesSent ?? "");
  }, [selectedWeekId, selectedWeek?.id]);

  const { data: activitiesData, isLoading: actLoading } = useQuery<ActivityRow[]>({
    queryKey: ["/api/weekly-activities/activities", selectedWeekId],
    queryFn: async () => {
      if (!selectedWeekId) return [];
      const r = await fetch(`${BASE}api/weekly-activities/weeks/${selectedWeekId}/activities`, { headers: authHeaders() });
      return r.json();
    },
    enabled: !!selectedWeekId,
  });

  useEffect(() => {
    if (activitiesData) setRows(activitiesData);
  }, [activitiesData]);

  const updateActivity = useCallback(async (id: number, patch: Partial<ActivityRow>) => {
    const r = await fetch(`${BASE}api/weekly-activities/activities/${id}`, {
      method: "PUT", headers: authHeaders(), body: JSON.stringify(patch),
    });
    return r.json();
  }, []);

  const deleteActivity = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}api/weekly-activities/activities/${id}`, { method: "DELETE", headers: authHeaders() });
    },
    onMutate: (id) => setRows(prev => prev.filter(r => r.id !== id)),
  });

  const addActivity = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/weekly-activities/weeks/${selectedWeekId}/activities`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ assignedUserId: null, projectTitle: "", productType: null, status: "not_started", priority: "medium", remarks: "" }),
      });
      return r.json();
    },
    onSuccess: (newRow) => setRows(prev => [...prev, newRow]),
    onSettled: () => setAddingRow(false),
  });

  const addActivityForUser = useMutation({
    mutationFn: async (assignedUserId: number | null) => {
      const r = await fetch(`${BASE}api/weekly-activities/weeks/${selectedWeekId}/activities`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ assignedUserId, projectTitle: "", productType: null, status: "not_started", priority: "medium", remarks: "" }),
      });
      return r.json();
    },
    onSuccess: (newRow) => setRows(prev => [...prev, newRow]),
  });

  const saveSamples = async () => {
    if (!selectedWeekId) return;
    await fetch(`${BASE}api/weekly-activities/weeks/${selectedWeekId}`, {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ samplesSent: draftSamples }),
    });
    setSampleSaved(true);
    setTimeout(() => setSampleSaved(false), 2000);
    qc.invalidateQueries({ queryKey: ["/api/weekly-activities/weeks", month, year] });
  };

  const handleFieldChange = useCallback((id: number, field: keyof ActivityRow, value: any) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    if (field === "assignedUserId") {
      const uid = value ? parseInt(value) : null;
      const user = users.find(u => u.id === uid) ?? null;
      setRows(prev => prev.map(r => r.id === id ? { ...r, assignedUserId: uid, assignedUser: user } : r));
      updateActivity(id, { assignedUserId: uid });
      return;
    }
    const isText = field === "projectTitle" || field === "remarks";
    if (isText) {
      if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
      saveTimers.current[id] = setTimeout(() => updateActivity(id, { [field]: value }), 600);
    } else {
      updateActivity(id, { [field]: value });
    }
  }, [users, updateActivity]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedWeekId(null);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedWeekId(null);
  };

  const filteredRows = useMemo(() => {
    let r = [...rows];
    if (filterUser !== "all") r = r.filter(a => String(a.assignedUserId) === filterUser);
    if (filterProduct !== "all") r = r.filter(a => a.productType === filterProduct);
    r.sort((a, b) => (a.assignedUserId ?? 0) - (b.assignedUserId ?? 0));
    return r;
  }, [rows, filterUser, filterProduct]);

  const groupedRows = useMemo(() => {
    const out: (ActivityRow & { isGroupStart: boolean })[] = [];
    let lastUserId: number | null | undefined = undefined;
    for (const r of filteredRows) {
      out.push({ ...r, isGroupStart: r.assignedUserId !== lastUserId });
      lastUserId = r.assignedUserId;
    }
    return out;
  }, [filteredRows]);

  const cellBase = cn(
    "px-0.5 py-1 text-xs border-0 bg-transparent text-foreground w-full focus:outline-none focus:ring-1 focus:ring-primary/40 rounded placeholder:text-muted-foreground/40"
  );

  const tabCls = (tab: string) => cn(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
    activeTab === tab
      ? "bg-primary text-white shadow-md shadow-primary/20"
      : isLight ? "text-slate-600 hover:bg-slate-100" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Activities</h1>
          <p className="text-sm text-muted-foreground mt-1">Track team activities, samples, and dispatch records</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className={cn("flex gap-2 p-1 rounded-2xl border w-fit flex-wrap",
        isLight ? "bg-slate-50 border-slate-200" : "bg-white/3 border-white/8")}>
        <button className={tabCls("tracker")} onClick={() => setActiveTab("tracker")}>
          Weekly Activities Tracker
        </button>
        <button className={tabCls("dispatch")} onClick={() => setActiveTab("dispatch")}>
          Dispatch Records
        </button>
        <button className={tabCls("purchase_requests")} onClick={() => setActiveTab("purchase_requests")}>
          <ShoppingBag className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />Purchase Requests
        </button>
      </div>

      {/* ── Tab: Weekly Activities Tracker ── */}
      {activeTab === "tracker" && (
        <div className="space-y-6">
          {/* Week Selector Card */}
          <div className={cn("rounded-2xl border p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4",
            isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={prevMonth}
                className={cn("p-2 rounded-xl transition-colors", isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-foreground min-w-[110px] text-center">
                {MONTHS_LONG[month - 1]} {year}
              </span>
              <button onClick={nextMonth}
                className={cn("p-2 rounded-xl transition-colors", isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-muted-foreground hover:text-foreground")}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className={cn("w-px h-6 shrink-0", isLight ? "bg-slate-200" : "bg-white/10")} />

            <div className="flex-1 min-w-0">
              {weeksLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading weeks…</div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedWeekId ?? ""}
                    onChange={e => setSelectedWeekId(parseInt(e.target.value))}
                    className={cn(
                      "w-full text-sm font-medium text-foreground pl-3 pr-8 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none",
                      isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10"
                    )}
                  >
                    {weeks.map(w => (
                      <option key={w.id} value={w.id}>{w.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>

            {selectedWeek && (
              <div className={cn("text-xs shrink-0 px-3 py-1.5 rounded-xl font-medium", isLight ? "bg-primary/10 text-primary" : "bg-primary/10 text-primary")}>
                {selectedWeek.startDate} → {selectedWeek.endDate}
              </div>
            )}
          </div>

          {/* Activities Table */}
          <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
            <div className={cn("px-4 py-3 flex items-center justify-between gap-3 border-b flex-wrap",
              isLight ? "border-slate-100 bg-slate-50/50" : "border-white/5 bg-white/2")}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">Weekly Activities</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                  isLight ? "bg-slate-100 text-slate-600" : "bg-white/5 text-muted-foreground")}>
                  {filteredRows.length} row{filteredRows.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                    className={cn("text-xs rounded-lg border pl-2.5 pr-7 py-1.5 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40",
                      isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground")}>
                    <option value="all">All Staff</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <Users className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
                    className={cn("text-xs rounded-lg border pl-2.5 pr-7 py-1.5 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40",
                      isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground")}>
                    <option value="all">All Products</option>
                    {PRODUCT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <button
                  onClick={() => { setAddingRow(true); addActivity.mutate(); }}
                  disabled={!selectedWeekId || addingRow || addActivity.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {addingRow || addActivity.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Plus className="w-3.5 h-3.5" />}
                  Add Activity
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("text-left border-b", isLight ? "border-slate-100 bg-slate-50/30" : "border-white/5 bg-white/2")}>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap w-40">Assigned User</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Project Title</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap w-40">Product Type</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap w-32">Status</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap w-28">Priority</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Remarks</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground w-12 text-center">Del</th>
                  </tr>
                </thead>
                <tbody>
                  {actLoading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading activities…
                    </td></tr>
                  ) : groupedRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isLight ? "bg-slate-100" : "bg-white/5")}>
                          <Plus className="w-5 h-5 text-muted-foreground" />
                        </div>
                        No activities yet. Click "Add Activity" to get started.
                      </div>
                    </td></tr>
                  ) : groupedRows.map(row => (
                    <tr key={row.id}
                      className={cn(
                        "transition-colors border-b last:border-0",
                        row.isGroupStart
                          ? isLight ? "border-slate-200 bg-slate-50/20" : "border-white/8 bg-white/1"
                          : isLight ? "border-slate-100" : "border-white/3",
                        isLight ? "hover:bg-slate-50/60" : "hover:bg-white/3"
                      )}>
                      <td className="px-3 py-2">
                        {row.isGroupStart ? (
                          <div className="flex items-center gap-1.5">
                            <MiniAvatar name={row.assignedUser?.name} size="sm" />
                            <select
                              value={row.assignedUserId ?? ""}
                              onChange={e => handleFieldChange(row.id, "assignedUserId", e.target.value || null)}
                              className={cn("flex-1 min-w-0 text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded-lg px-1 py-0.5 appearance-none text-foreground", isLight ? "" : "text-foreground")}
                            >
                              <option value="">Unassigned</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                            <button
                              title={`Add row for ${row.assignedUser?.name ?? "this user"}`}
                              disabled={!selectedWeekId || addActivityForUser.isPending}
                              onClick={() => addActivityForUser.mutate(row.assignedUserId)}
                              className={cn(
                                "shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                                isLight
                                  ? "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                                  : "bg-primary/20 text-primary hover:bg-primary hover:text-white"
                              )}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pl-1 opacity-40">
                            <div className="w-1 h-4 rounded-full bg-primary/30" />
                            <span className="text-xs text-muted-foreground">{row.assignedUser?.name ?? "—"}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.projectTitle}
                          onChange={e => handleFieldChange(row.id, "projectTitle", e.target.value)}
                          placeholder="Project title…"
                          className={cn(cellBase, "min-w-[140px]")}
                        />
                      </td>

                      <td className="px-2 py-2">
                        <select
                          value={row.productType ?? ""}
                          onChange={e => handleFieldChange(row.id, "productType", e.target.value || null)}
                          className={cn("text-xs rounded-lg border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 w-full appearance-none",
                            isLight ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground")}
                        >
                          <option value="">— Select —</option>
                          {PRODUCT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </td>

                      <td className="px-2 py-2">
                        <select
                          value={row.status}
                          onChange={e => handleFieldChange(row.id, "status", e.target.value)}
                          className={cn("text-xs rounded-lg border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 w-full appearance-none",
                            STATUS_OPTS.find(s => s.value === row.status)?.cls ?? "",
                            "border-current/20 bg-current/5"
                          )}
                          style={{ colorScheme: "dark" }}
                        >
                          {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>

                      <td className="px-2 py-2">
                        <select
                          value={row.priority}
                          onChange={e => handleFieldChange(row.id, "priority", e.target.value)}
                          className={cn("text-xs rounded-lg border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 w-full appearance-none",
                            isLight ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground")}
                        >
                          {PRIORITY_OPTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </td>

                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.remarks ?? ""}
                          onChange={e => handleFieldChange(row.id, "remarks", e.target.value)}
                          placeholder="Remarks…"
                          className={cn(cellBase, "min-w-[120px]")}
                        />
                      </td>

                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => deleteActivity.mutate(row.id)}
                          className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Samples Sent Section */}
          <div className={cn("rounded-2xl border", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
            <div className={cn("px-4 py-3 flex items-center justify-between gap-3 border-b flex-wrap",
              isLight ? "border-slate-100 bg-slate-50/30" : "border-white/5")}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Samples Sent</h3>
                {sampleSaved && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowNotify(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
              >
                <Bell className="w-3.5 h-3.5" /> Notify Account Manager
              </button>
            </div>
            <div className="p-4">
              <textarea
                rows={10}
                maxLength={5000}
                placeholder="Enter samples sent details for this week… (e.g. Sample A – 200g to Client X on Mon, Sample B – 500g to Client Y on Wed)"
                value={draftSamples}
                onChange={e => setDraftSamples(e.target.value)}
                onBlur={saveSamples}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all",
                  isLight ? "bg-slate-50 border border-slate-200" : "bg-black/20 border border-white/10"
                )}
              />
              <p className="text-xs text-muted-foreground mt-1.5">Auto-saves on focus away · Max 20 lines</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Dispatch Records ── */}
      {activeTab === "dispatch" && (
        <DispatchRecords users={users} isLight={isLight} />
      )}

      {/* ── Tab: Purchase Requests ── */}
      {activeTab === "purchase_requests" && (
        <PurchaseRequestsSection isLight={isLight} onOpenModal={() => setShowPRModal(true)} />
      )}

      {showNotify && <NotifyModal onClose={() => setShowNotify(false)} users={users} />}
      {showPRModal && <NewRequestModal onClose={() => setShowPRModal(false)} isLight={isLight} />}
    </div>
  );
}

function PurchaseRequestsSection({ isLight, onOpenModal }: { isLight: boolean; onOpenModal: () => void }) {
  const [search, setSearch] = useState("");
  const { data: prs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/procurement/requests", "npd"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/requests`, { headers: authHeaders(), cache: "no-store" });
      if (!r.ok) throw new Error("Failed to fetch purchase requests");
      const data = await r.json();
      return (data || []).filter((pr: any) =>
        (pr.department?.name ?? "").toLowerCase().includes("npd") ||
        (pr.requester?.department ?? "").toLowerCase().includes("npd") ||
        (pr.department ?? "").toLowerCase().includes("npd")
      );
    },
  });

  const filtered = useMemo(() => {
    if (!search) return prs;
    const s = search.toLowerCase();
    return prs.filter((pr: any) =>
      (pr.title ?? "").toLowerCase().includes(s) ||
      (pr.vendorDetailsName ?? pr.vendorName ?? "").toLowerCase().includes(s) ||
      (pr.requestedBy?.name ?? pr.requester?.name ?? "").toLowerCase().includes(s)
    );
  }, [prs, search]);

  function exportCSV() {
    const headers = ["Vendor", "Title", "User Requesting", "Est. Amount ($)", "Required Qty (KG)"];
    const rows = filtered.map((pr: any) => [
      pr.vendorDetailsName || pr.vendorName || "—",
      pr.title || "—",
      pr.requestedBy?.name || pr.requester?.name || "—",
      pr.estimatedAmount ? Number(pr.estimatedAmount).toLocaleString() : "—",
      pr.requiredQuantityKg || "—",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npd-purchase-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXLSX() {
    const rows = filtered.map((pr: any) => ({
      "Vendor": pr.vendorDetailsName || pr.vendorName || "—",
      "Title": pr.title || "—",
      "User Requesting": pr.requestedBy?.name || pr.requester?.name || "—",
      "Est. Amount ($)": pr.estimatedAmount ? Number(pr.estimatedAmount) : 0,
      "Required Qty (KG)": pr.requiredQuantityKg ? Number(pr.requiredQuantityKg) : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NPD Purchase Requests");
    XLSX.writeFile(wb, `npd-purchase-requests-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm flex-1 min-w-[180px] max-w-xs",
          isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            className="bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50 w-full text-sm"
            placeholder="Search purchase requests…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={onOpenModal}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90">
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
        <button onClick={exportCSV}
          className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
            isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button onClick={exportXLSX}
          className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
            isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
          <Download className="w-3.5 h-3.5" /> XLSX
        </button>
      </div>

      {/* Table */}
      <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{search ? "No requests match your search." : "No NPD purchase requests yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className={cn("border-b text-xs", isLight ? "bg-slate-50 border-slate-100 text-slate-500" : "bg-white/3 border-white/5 text-muted-foreground")}>
                  <th className="px-4 py-3 text-left font-medium">Vendor</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">User Requesting</th>
                  <th className="px-4 py-3 text-left font-medium">Est. Amount ($)</th>
                  <th className="px-4 py-3 text-left font-medium">Required Qty (KG)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pr: any) => (
                  <tr key={pr.id} className={cn("border-b last:border-0 transition-colors",
                    isLight ? "border-slate-50 hover:bg-slate-50" : "border-white/5 hover:bg-white/3")}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {pr.vendorDetailsName || pr.vendorName || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {pr.title}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {pr.requestedBy?.name || pr.requester?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {pr.estimatedAmount ? `$${Number(pr.estimatedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {pr.requiredQuantityKg ? `${Number(pr.requiredQuantityKg).toLocaleString()} kg` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <div className={cn("px-4 py-2.5 border-t text-xs text-muted-foreground flex items-center justify-between",
            isLight ? "border-slate-100 bg-slate-50" : "border-white/5")}>
            <span>{filtered.length} request{filtered.length !== 1 ? "s" : ""}</span>
            <span>NPD Department Purchase Requests</span>
          </div>
        )}
      </div>
    </div>
  );
}
