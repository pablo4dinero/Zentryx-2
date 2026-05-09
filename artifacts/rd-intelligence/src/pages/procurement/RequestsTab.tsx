import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Loader2, X, Check, Clock, AlertCircle, CheckCircle2,
  XCircle, ChevronRight, Filter, FileText, TrendingUp, Users, ArrowRight,
  Trash2, AlertTriangle, RotateCcw, Edit2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetCurrentUser } from "@/api-client";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;
function authH() { return { Authorization: `Bearer ${localStorage.getItem("rd_token")}`, "Content-Type": "application/json" }; }

const CATEGORIES = ["ingredients","packaging","equipment","services","logistics","other"];
const PRIORITIES = [
  { value: "low", label: "Low", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "medium", label: "Medium", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { value: "high", label: "High", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "critical", label: "Critical", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
];
const STATUSES = [
  { value: "draft", label: "Draft", cls: "bg-slate-500/10 text-slate-400" },
  { value: "pending_approval", label: "Pending Approval", cls: "bg-amber-500/10 text-amber-400" },
  { value: "approved", label: "Approved", cls: "bg-emerald-500/10 text-emerald-400" },
  { value: "rejected", label: "Rejected", cls: "bg-red-500/10 text-red-400" },
  { value: "cancelled", label: "Cancelled", cls: "bg-slate-500/10 text-slate-400" },
  { value: "converted_to_po", label: "Converted to PO", cls: "bg-violet-500/10 text-violet-400" },
];
const CURRENCIES = ["ngn","usd","eur","gbp"];

function priorityMeta(p: string) { return PRIORITIES.find(x => x.value === p) ?? PRIORITIES[1]; }
function statusMeta(s: string) { return STATUSES.find(x => x.value === s) ?? STATUSES[0]; }

function ApprovalChain({ approvals }: { approvals: any[] }) {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const existingLevels = [...new Set(approvals.map((a: any) => a.level))].sort();
  const levels = existingLevels.length ? existingLevels : [1];

  return (
    <div className="flex flex-col gap-2">
      {levels.map(level => {
        const levelApprovals = approvals.filter((a: any) => a.level === level);
        const approved = levelApprovals.some(a => a.status === "approved");
        const rejected = levelApprovals.some(a => a.status === "rejected");

        const iconCls = approved ? "text-emerald-400 bg-emerald-500/10" : rejected ? "text-red-400 bg-red-500/10" : "text-amber-400 bg-amber-500/10";
        const Icon = approved ? CheckCircle2 : rejected ? XCircle : Clock;

        return (
          <div key={level} className={cn("flex items-start gap-3 p-3 rounded-xl border",
            isLight ? "border-slate-100 bg-slate-50" : "border-white/5 bg-white/3")}>
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", iconCls)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Level {level}</span>
                {levelApprovals.length === 0 ? (
                  <span className="text-xs text-muted-foreground">(not yet assigned)</span>
                ) : (
                  <span className={cn("text-xs px-1.5 py-0.5 rounded-full", iconCls)}>
                    {approved ? "Approved" : rejected ? "Rejected" : "Pending"}
                  </span>
                )}
              </div>
              {levelApprovals.map((a: any) => (
                <div key={a.id} className="mt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                      {a.approver?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
                    </div>
                    <span>{a.approver?.name || "Unknown"}</span>
                    {a.decidedAt && <span className="text-muted-foreground/50">· {format(new Date(a.decidedAt), "MMM d, yyyy")}</span>}
                  </div>
                  {a.comment && <p className="text-xs text-muted-foreground mt-1 pl-6 italic">"{a.comment}"</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RequestDetailPanel({ pr, onClose, isLight, currentUserId, userRole, currentUserDept, onDeleted }: any) {
  const qc = useQueryClient();
  const [rejectComment, setRejectComment] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

const isAdmin = userRole === "admin";
const hasPendingSlot = pr.approvals?.some((a: any) => a.approverId === currentUserId && a.status === "pending");
const canApprove = pr.status === "pending_approval" && (isAdmin || (["manager","ceo"].includes(userRole) && hasPendingSlot));

  const isProcurementDept = (currentUserDept ?? "").toLowerCase().includes("procurement");
  const canDelete = isProcurementDept && !["converted_to_po"].includes(pr.status);

  async function action(endpoint: string, body: any = {}) {
    setActing(true);
    try {
      await fetch(`${BASE}api/procurement/requests/${pr.id}/${endpoint}`, {
        method: "POST", headers: authH(), body: JSON.stringify(body),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/requests"] });
      onClose();
    } finally { setActing(false); }
  }

  async function deletePR() {
    setActing(true);
    try {
      await fetch(`${BASE}api/procurement/requests/${pr.id}`, {
        method: "DELETE", headers: authH(),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/requests"] });
      if (onDeleted) onDeleted();
      onClose();
    } finally { setActing(false); }
  }

  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground");

  const sm = statusMeta(pr.status);
  const pm = priorityMeta(pr.priority);

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-end sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full sm:max-w-2xl h-[90vh] sm:h-auto sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border shadow-2xl z-10",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between z-10",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <div>
            <h3 className="font-semibold text-foreground text-sm">{pr.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full", sm.cls)}>{sm.label}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full border", pm.cls)}>{pm.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground mb-0.5">Requested By</p><p className="font-medium">{pr.requestedBy?.name || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground mb-0.5">Department</p><p className="font-medium">{pr.department?.name || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground mb-0.5">Category</p><p className="font-medium capitalize">{pr.category}</p></div>
            <div><p className="text-xs text-muted-foreground mb-0.5">Currency</p><p className="font-medium uppercase">{pr.currency}</p></div>
            <div><p className="text-xs text-muted-foreground mb-0.5">Estimated Amount</p><p className="font-semibold text-primary">{pr.estimatedAmount ? Number(pr.estimatedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground mb-0.5">Required By</p><p className="font-medium">{pr.requiredByDate || "—"}</p></div>
            {pr.requiredQuantityKg && <div><p className="text-xs text-muted-foreground mb-0.5">Required Qty (KG)</p><p className="font-medium">{pr.requiredQuantityKg}</p></div>}
          </div>
          {(pr.vendorDetailsName || pr.vendorDetailsAddress) && (
            <div className={cn("p-3 rounded-xl border", isLight ? "border-slate-100 bg-slate-50" : "border-white/5 bg-white/3")}>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Vendor Details</p>
              {pr.vendorDetailsName && <p className="text-sm font-medium">{pr.vendorDetailsName}</p>}
              {pr.vendorDetailsAddress && <p className="text-xs text-muted-foreground mt-0.5">{pr.vendorDetailsAddress}</p>}
            </div>
          )}
          {pr.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Description</p>
              <p className="text-sm text-foreground">{pr.description}</p>
            </div>
          )}
          {pr.justification && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Justification</p>
              <p className="text-sm text-foreground">{pr.justification}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Approval Chain</p>
            <ApprovalChain approvals={pr.approvals ?? []} />
          </div>
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex flex-wrap gap-2",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          {pr.status === "draft" && (
            <button onClick={() => action("submit")} disabled={acting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} Submit for Approval
            </button>
          )}
          {canApprove && !showReject && (
            <>
              <button onClick={() => action("approve", { comment: "Approved" })} disabled={acting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => setShowReject(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </>
          )}
          {showReject && (
            <div className="w-full space-y-2">
              <textarea rows={2} className={cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none resize-none", isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10 text-foreground")}
                placeholder="Rejection reason (required)…" value={rejectComment} onChange={e => setRejectComment(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => action("reject", { comment: rejectComment })} disabled={!rejectComment || acting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white disabled:opacity-50">
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Confirm Reject
                </button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
              </div>
            </div>
          )}
          {pr.status === "approved" && (
            <button onClick={() => action("convert-to-po")} disabled={acting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Convert to PO
            </button>
          )}
          {canDelete && !showDeleteConfirm && (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
          {showDeleteConfirm && (
            <div className="w-full flex items-center gap-2 p-2 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-xs text-red-400 flex-1">Delete this request? This cannot be undone.</span>
              <button onClick={deletePR} disabled={acting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-white/5">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NewRequestModal({ onClose, isLight, extraDefaults }: { onClose: () => void; isLight: boolean; extraDefaults?: Record<string, any> }) {
  const qc = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const [form, setForm] = useState({
    title: "", description: "", category: "ingredients", priority: "medium",
    estimatedAmount: "", currency: "usd", requiredByDate: "", justification: "",
    requiredQuantityKg: "", vendorDetailsName: "", vendorDetailsAddress: "",
    ...extraDefaults,
  });
  const [items, setItems] = useState<any[]>([{ description: "", quantity: "", unit: "units", unitPrice: "" }]);
  const [saving, setSaving] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [manualRate, setManualRate] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground");

  const { data: vendorsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/procurement/vendors"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/vendors`, { headers: authH() });
      return r.json();
    },
  });
  const vendors = Array.isArray(vendorsRaw) ? vendorsRaw : [];
  const filteredVendors = vendors.filter((v: any) =>
    v.name?.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  useEffect(() => {
    setRateLoading(true);
    fetch("https://api.exchangerate-api.com/v4/latest/USD")
      .then(r => r.json())
      .then(data => { if (data?.rates?.NGN) setExchangeRate(data.rates.NGN); })
      .catch(() => setExchangeRate(null))
      .finally(() => setRateLoading(false));
  }, []);

  const effectiveRate = manualRate ? parseFloat(manualRate) : exchangeRate;
  const ngnEquivalent = form.estimatedAmount && effectiveRate
    ? (parseFloat(form.estimatedAmount) * effectiveRate).toLocaleString("en-NG", { maximumFractionDigits: 2 })
    : null;

  function addItem() { setItems(p => [...p, { description: "", quantity: "", unit: "units", unitPrice: "" }]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }
  function setItem(i: number, k: string, v: any) { setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it)); }
  const totalAmount = items.reduce((s, it) => s + (parseFloat(it.quantity) * parseFloat(it.unitPrice) || 0), 0);

  async function addVendorToList() {
    if (!vendorSearch.trim()) return;
    setAddingVendor(true);
    try {
      await fetch(`${BASE}api/procurement/vendors`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ name: vendorSearch.trim(), currency: "usd" }),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/vendors"] });
      f("vendorDetailsName", vendorSearch.trim());
      setShowVendorDropdown(false);
    } finally { setAddingVendor(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const lineItems = items.filter(it => it.description);
      await fetch(`${BASE}api/procurement/requests`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          ...form,
          currency: "usd",
          lineItems: lineItems.length > 0 ? lineItems : undefined,
          requestedById: (currentUser as any)?.id,
          departmentId: (currentUser as any)?.departmentId ?? null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/requests"] });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-lg rounded-2xl border shadow-2xl z-10 max-h-[90vh] overflow-y-auto",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <h3 className="text-base font-semibold">New Purchase Request</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
            <input className={inputCls} value={form.title} onChange={e => f("title", e.target.value)} placeholder="What do you need?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <select className={cn(inputCls, "appearance-none")} value={form.category} onChange={e => f("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
              <select className={cn(inputCls, "appearance-none")} value={form.priority} onChange={e => f("priority", e.target.value)}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Est Amount with NGN conversion */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Est. Amount (USD $)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <input className={cn(inputCls, "pl-7")} type="number" value={form.estimatedAmount}
                onChange={e => f("estimatedAmount", e.target.value)} placeholder="0.00" />
            </div>
            {form.estimatedAmount && (
              <div className={cn("mt-2 p-2.5 rounded-xl border text-xs space-y-1.5", isLight ? "bg-amber-50 border-amber-200" : "bg-amber-500/10 border-amber-500/20")}>
                {rateLoading ? (
                  <p className="text-amber-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Fetching rate...</p>
                ) : ngnEquivalent ? (
                  <p className="text-amber-500 font-medium">≈ ₦{ngnEquivalent} NGN
                    {!manualRate && exchangeRate && <span className="text-muted-foreground ml-1">(₦{exchangeRate.toLocaleString()}/USD)</span>}
                    {manualRate && <span className="text-muted-foreground ml-1">(Manual: ₦{manualRate}/USD)</span>}
                  </p>
                ) : <p className="text-muted-foreground">Rate unavailable — set manually below</p>}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$1 =</span>
                  <input type="number" value={manualRate} onChange={e => setManualRate(e.target.value)}
                    placeholder="e.g. 1650" className={cn("flex-1 h-6 rounded-lg border px-2 text-xs focus:outline-none",
                      isLight ? "bg-white border-gray-200" : "bg-black/20 border-white/10")} />
                  <span className="text-muted-foreground">NGN</span>
                  {manualRate && <button onClick={() => setManualRate("")} className="text-red-400 text-xs">Clear</button>}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Required By Date</label>
              <input className={inputCls} type="date" value={form.requiredByDate} onChange={e => f("requiredByDate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Required Quantity (KG)</label>
              <input className={inputCls} type="number" value={form.requiredQuantityKg} onChange={e => f("requiredQuantityKg", e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Line Items</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3 h-3" /> Add Item</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className={cn("grid grid-cols-12 gap-2 p-3 rounded-xl border", isLight ? "border-slate-100 bg-slate-50" : "border-white/5 bg-white/3")}>
                  <div className="col-span-4">
                    <input placeholder="Description" className={cn("w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")} value={item.description} onChange={e => setItem(i, "description", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input placeholder="Qty" type="number" className={cn("w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")} value={item.quantity} onChange={e => setItem(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <select className={cn("w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none appearance-none", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")} value={item.unit} onChange={e => setItem(i, "unit", e.target.value)}>
                      {["kg","litres","units","cartons","bags","packs"].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input placeholder="Unit Price" type="number" className={cn("w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")} value={item.unitPrice} onChange={e => setItem(i, "unitPrice", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <button onClick={() => removeItem(i)} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
            {totalAmount > 0 && <p className="text-right text-xs font-semibold text-primary mt-1">Total: ${totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>}
          </div>

          {/* Vendor Search with manual entry */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Vendor Details</p>
            <div className="space-y-3">
              <div className="relative">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search or Type Vendor</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input className={cn(inputCls, "pl-8")} value={vendorSearch}
                    onChange={e => { setVendorSearch(e.target.value); setShowVendorDropdown(true); f("vendorDetailsName", e.target.value); }}
                    onFocus={() => setShowVendorDropdown(true)}
                    placeholder="Search from vendor list or type new..." />
                </div>
                {showVendorDropdown && (
                  <div className={cn("absolute z-10 w-full mt-1 rounded-xl border shadow-xl max-h-48 overflow-y-auto",
                    isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}>
                    {filteredVendors.map((v: any) => (
                      <button key={v.id} type="button"
                        onClick={() => { f("vendorDetailsName", v.name); f("vendorDetailsAddress", v.address ?? ""); setVendorSearch(v.name); setShowVendorDropdown(false); }}
                        className={cn("w-full text-left px-3 py-2 text-sm transition-colors",
                          isLight ? "hover:bg-gray-50 text-gray-900" : "hover:bg-white/5 text-foreground")}>
                        <p className="font-medium">{v.name}</p>
                        {v.address && <p className="text-xs text-muted-foreground">{v.address}</p>}
                      </button>
                    ))}
                    {vendorSearch && !filteredVendors.find((v: any) => v.name.toLowerCase() === vendorSearch.toLowerCase()) && (
                      <button type="button" onClick={addVendorToList} disabled={addingVendor}
                        className={cn("w-full text-left px-3 py-2 text-sm transition-colors border-t flex items-center gap-2",
                          isLight ? "hover:bg-blue-50 text-blue-600 border-gray-100" : "hover:bg-primary/10 text-primary border-white/10")}>
                        <Plus className="w-3.5 h-3.5" />
                        {addingVendor ? "Adding..." : `Add "${vendorSearch}" to vendor list`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor Address</label>
                <input className={inputCls} value={form.vendorDetailsAddress} onChange={e => f("vendorDetailsAddress", e.target.value)} placeholder="Vendor address…" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.description} onChange={e => f("description", e.target.value)} placeholder="Details about what's needed…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Justification</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.justification} onChange={e => f("justification", e.target.value)} placeholder="Business justification…" />
          </div>
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving || !form.title}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Create Request
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRequestModal({ pr, onClose, isLight }: { pr: any; onClose: () => void; isLight: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: pr.title ?? "",
    description: pr.description ?? "",
    category: pr.category ?? "ingredients",
    priority: pr.priority ?? "medium",
    estimatedAmount: pr.estimatedAmount ?? "",
    requiredByDate: pr.requiredByDate ?? "",
    justification: pr.justification ?? "",
    requiredQuantityKg: pr.requiredQuantityKg ?? "",
    vendorDetailsName: pr.vendorDetailsName ?? "",
    vendorDetailsAddress: pr.vendorDetailsAddress ?? "",
  });
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground");

  async function save() {
    setSaving(true);
    try {
      await fetch(`${BASE}api/procurement/requests/${pr.id}`, {
        method: "PUT", headers: authH(), body: JSON.stringify(form),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/requests"] });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-lg rounded-2xl border shadow-2xl z-10 max-h-[90vh] overflow-y-auto",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <h3 className="text-base font-semibold">Edit Purchase Request</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
            <input className={inputCls} value={form.title} onChange={e => f("title", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <select className={cn(inputCls, "appearance-none")} value={form.category} onChange={e => f("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
              <select className={cn(inputCls, "appearance-none")} value={form.priority} onChange={e => f("priority", e.target.value)}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Est. Amount ($)</label>
              <input className={inputCls} type="number" value={form.estimatedAmount} onChange={e => f("estimatedAmount", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Required By Date</label>
              <input className={inputCls} type="date" value={form.requiredByDate} onChange={e => f("requiredByDate", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Required Quantity (KG)</label>
            <input className={inputCls} type="number" value={form.requiredQuantityKg} onChange={e => f("requiredQuantityKg", e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor Name</label>
            <input className={inputCls} value={form.vendorDetailsName} onChange={e => f("vendorDetailsName", e.target.value)} placeholder="Vendor name…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor Address</label>
            <input className={inputCls} value={form.vendorDetailsAddress} onChange={e => f("vendorDetailsAddress", e.target.value)} placeholder="Vendor address…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.description} onChange={e => f("description", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Justification</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.justification} onChange={e => f("justification", e.target.value)} />
          </div>
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving || !form.title}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
export default function RequestsTab() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { data: currentUser } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedPR, setSelectedPR] = useState<any>(null);
  const [showRejectedDrawer, setShowRejectedDrawer] = useState(false);
  const [editPR, setEditPR] = useState<any>(null);

  const currentUserDept = (currentUser as any)?.department ?? "";
  const isProcurementDept = currentUserDept.toLowerCase().includes("procurement");

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/procurement/requests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/requests`, { headers: authH() });
      return r.json();
    },
  });

  const { data: rejectedRaw, refetch: refetchRejected } = useQuery<any[]>({
    queryKey: ["/api/procurement/requests/rejected-deleted"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/requests/rejected-deleted`, { headers: authH() });
      const d = await r.json();
      return Array.isArray(d) ? d : (d?.data ?? []);
    },
    enabled: showRejectedDrawer,
  });
  const rejectedList = Array.isArray(rejectedRaw) ? rejectedRaw : [];

  const filtered = requests.filter(r => {
    const matchSearch = !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.requestedBy?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchPriority = filterPriority === "all" || r.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  // KPI cards
  const total = requests.length;
  const pending = requests.filter(r => r.status === "pending_approval").length;
  const thisMonth = requests.filter(r => r.status === "approved" && new Date(r.createdAt) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length;
  const rejected = requests.filter(r => r.status === "rejected").length;

  const kpiCls = cn("rounded-2xl border p-4 space-y-1", isLight ? "bg-white border-slate-200" : "glass-card border-white/10");

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Requests", value: total, icon: FileText, color: "text-blue-400 bg-blue-500/10" },
          { label: "Pending Approval", value: pending, icon: Clock, color: "text-amber-400 bg-amber-500/10" },
          { label: "Approved This Month", value: thisMonth, icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10" },
          { label: "Rejected This Month", value: rejected, icon: XCircle, color: "text-red-400 bg-red-500/10" },
        ].map(k => (
          <div key={k.label} className={kpiCls}>
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", k.color)}>
              <k.icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold font-display">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={cn("rounded-2xl border p-4 flex flex-wrap items-center gap-3", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input placeholder="Search requests…" value={search} onChange={e => setSearch(e.target.value)}
            className={cn("w-full pl-9 pr-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground")} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className={cn("text-xs rounded-xl border px-3 py-2 appearance-none focus:outline-none",
            isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className={cn("text-xs rounded-xl border px-3 py-2 appearance-none focus:outline-none",
            isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
          <option value="all">All Priorities</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90">
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
        <button onClick={() => { setShowRejectedDrawer(true); refetchRejected(); }}
          className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
            isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
          <RotateCcw className="w-3.5 h-3.5" /> Rejected Requests
        </button>
      </div>

      {/* Table */}
      <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn("text-left border-b", isLight ? "border-slate-100 bg-slate-50" : "border-white/8 bg-white/2")}>
                  {["Title","Requester","Category","Priority","Est. Amount ($)","Required By","Status",""].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />No purchase requests found.
                  </td></tr>
                ) : filtered.map(r => {
                  const sm = statusMeta(r.status);
                  const pm = priorityMeta(r.priority);
                  return (
                    <tr key={r.id} onClick={() => setSelectedPR(r)}
                      className={cn("border-b last:border-0 transition-colors cursor-pointer group", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/3")}>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[200px]">
                        <div className="truncate">{r.title}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.requestedBy?.name || "—"}</td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", isLight ? "bg-slate-100 text-slate-600" : "bg-white/5 text-muted-foreground")}>{r.category}</span></td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", pm.cls)}>{pm.label}</span></td>
                      <td className="px-4 py-3 text-sm font-mono">{r.estimatedAmount ? Number(r.estimatedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.requiredByDate || "—"}</td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-0.5 rounded-full", sm.cls)}>{sm.label}</span></td>
                      <td className="px-4 py-3">
          <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); setEditPR(r); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={async e => {
              e.stopPropagation();
              if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
              await fetch(`${BASE}api/procurement/requests/${r.id}`, { method: "DELETE", headers: authH() });
              queryClient.invalidateQueries({ queryKey: ["/api/procurement/requests"] });
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
         </div>
</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <NewRequestModal onClose={() => setShowModal(false)} isLight={isLight} />}
      {editPR && (
        <EditRequestModal
          pr={editPR}
          onClose={() => setEditPR(null)}
          isLight={isLight}
       />
      )}
      {selectedPR && (
        <RequestDetailPanel
          pr={selectedPR}
          onClose={() => setSelectedPR(null)}
          isLight={isLight}
          currentUserId={(currentUser as any)?.id}
          userRole={(currentUser as any)?.role}
          currentUserDept={currentUserDept}
        />
      )}

      {/* Rejected Requests Drawer */}
      {showRejectedDrawer && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-end p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRejectedDrawer(false)} />
          <div className={cn("relative w-full sm:max-w-lg h-[80vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border shadow-2xl z-10",
            isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
            <div className={cn("sticky top-0 px-5 py-4 border-b flex items-center justify-between",
              isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" /> Rejected Requests
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Rejected and deleted purchase requests</p>
              </div>
              <button onClick={() => setShowRejectedDrawer(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              {rejectedList.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No rejected or deleted requests found.
                </div>
              ) : rejectedList.map((r: any) => {
                const sm = statusMeta(r.isDeleted ? "cancelled" : r.status);
                return (
                  <div key={r.id} className={cn("p-3 rounded-xl border", isLight ? "border-slate-100 bg-slate-50" : "border-white/5 bg-white/3")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", r.isDeleted ? "bg-slate-500/10 text-slate-400" : sm.cls)}>
                            {r.isDeleted ? "Deleted" : sm.label}
                          </span>
                          {r.vendorName && <span className="text-xs text-muted-foreground">{r.vendorName}</span>}
                          {r.requester && <span className="text-xs text-muted-foreground">by {r.requester.name}</span>}
                        </div>
                        {r.updatedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {r.isDeleted ? "Deleted" : "Rejected"} {format(new Date(r.isDeleted ? r.deletedAt : r.updatedAt), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
