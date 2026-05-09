import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Loader2, X, Check, Download, Package, AlertTriangle,
  DollarSign, ChevronRight, Edit2, MessageSquare, Send, Truck, FileText, Star, Minus, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetCurrentUser, useListUsers } from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL;
function authH() { return { Authorization: `Bearer ${localStorage.getItem("rd_token")}`, "Content-Type": "application/json" }; }

const PO_STATUSES = [
  { value: "draft", label: "Draft", cls: "bg-slate-500/10 text-slate-400" },
  { value: "sent_to_vendor", label: "Sent to Vendor", cls: "bg-blue-500/10 text-blue-400" },
  { value: "acknowledged", label: "Acknowledged", cls: "bg-cyan-500/10 text-cyan-400" },
  { value: "in_transit", label: "In Transit", cls: "bg-amber-500/10 text-amber-400" },
  { value: "partially_received", label: "Partially Received", cls: "bg-orange-500/10 text-orange-400" },
  { value: "received", label: "Received", cls: "bg-emerald-500/10 text-emerald-400" },
  { value: "closed", label: "Closed", cls: "bg-slate-500/10 text-slate-400" },
  { value: "cancelled", label: "Cancelled", cls: "bg-red-500/10 text-red-400" },
];
const PAYMENT_STATUSES = [
  { value: "unpaid", label: "Unpaid", cls: "bg-red-500/10 text-red-400" },
  { value: "partially_paid", label: "Partial", cls: "bg-amber-500/10 text-amber-400" },
  { value: "paid", label: "Paid", cls: "bg-emerald-500/10 text-emerald-400" },
];
const UNITS = ["kg","litres","units","cartons","bags","packs"];
const CURRENCIES = ["ngn","usd","eur","gbp"];
const PRODUCT_TYPES = ["seasoning","snacks_dusting","dairy_premix","bakery_dough_premix","sweet_flavours","savoury_flavour"];

const STAGE_STEPS = ["draft","sent_to_vendor","acknowledged","in_transit","received"];

function statusMeta(s: string) { return PO_STATUSES.find(x => x.value === s) ?? PO_STATUSES[0]; }
function payMeta(s: string) { return PAYMENT_STATUSES.find(x => x.value === s) ?? PAYMENT_STATUSES[0]; }

function ProgressStepper({ status }: { status: string }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const idx = STAGE_STEPS.indexOf(status);
  const labels = ["Draft","Sent","Acknowledged","In Transit","Received"];
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {STAGE_STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-shrink-0">
          <div className={cn("flex flex-col items-center gap-1")}>
            <div className={cn("w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border-2 transition-all",
              i <= idx ? "border-primary bg-primary text-white" : isLight ? "border-slate-200 bg-white text-slate-400" : "border-white/10 bg-white/5 text-muted-foreground")}>
              {i < idx ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={cn("text-[10px] whitespace-nowrap", i <= idx ? "text-primary font-medium" : "text-muted-foreground")}>{labels[i]}</span>
          </div>
          {i < STAGE_STEPS.length - 1 && (
            <div className={cn("w-8 h-0.5 mb-3 rounded-full", i < idx ? "bg-primary" : isLight ? "bg-slate-200" : "bg-white/10")} />
          )}
        </div>
      ))}
    </div>
  );
}

function ReceiveModal({ po, onClose, isLight }: { po: any; onClose: () => void; isLight: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ quantityReceived: "", condition: "good", notes: "" });
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground");

  async function save() {
    setSaving(true);
    try {
      await fetch(`${BASE}api/procurement/orders/${po.id}/receive`, {
        method: "POST", headers: authH(), body: JSON.stringify(form),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-md rounded-2xl border shadow-2xl z-10",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("px-6 py-4 border-b flex items-center justify-between", isLight ? "border-slate-100" : "border-white/10")}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Receive Goods — {po.poNumber}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quantity Received</label>
            <input className={inputCls} type="number" value={form.quantityReceived} onChange={e => f("quantityReceived", e.target.value)} placeholder="Total units received…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Condition</label>
            <select className={cn(inputCls, "appearance-none")} value={form.condition} onChange={e => f("condition", e.target.value)}>
              <option value="good">Good</option>
              <option value="partial">Partial</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Any remarks…" />
          </div>
        </div>
        <div className={cn("px-6 py-4 border-t flex justify-end gap-3", isLight ? "border-slate-100" : "border-white/10")}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Mark Received
          </button>
        </div>
      </div>
    </div>
  );
}

function RateVendorModal({ po, onClose, isLight }: { po: any; onClose: () => void; isLight: boolean }) {
  const qc = useQueryClient();
  const [scores, setScores] = useState({ deliveryScore: 3, qualityScore: 3, communicationScore: 3, notes: "" });
  const [saving, setSaving] = useState(false);
  const s = (k: string, v: any) => setScores(p => ({ ...p, [k]: v }));

  function ScorePicker({ label, field }: { label: string; field: string }) {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
        <div className="flex gap-2">
          {[1,2,3,4,5].map(i => (
            <button key={i} type="button" onClick={() => s(field, i)}
              className={cn("w-9 h-9 rounded-xl text-sm font-bold border transition-colors",
                (scores as any)[field] >= i ? "bg-amber-400/20 text-amber-400 border-amber-400/40" : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white/5 text-muted-foreground border-white/10")}>
              {i}
            </button>
          ))}
        </div>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`${BASE}api/procurement/orders/${po.id}/rate-vendor`, {
        method: "POST", headers: authH(), body: JSON.stringify(scores),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/procurement/vendors"] });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-md rounded-2xl border shadow-2xl z-10",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("px-6 py-4 border-b flex items-center justify-between", isLight ? "border-slate-100" : "border-white/10")}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" /> Rate Vendor — {po.vendor?.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <ScorePicker label="Delivery Score" field="deliveryScore" />
          <ScorePicker label="Quality Score" field="qualityScore" />
          <ScorePicker label="Communication Score" field="communicationScore" />
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea rows={2} value={scores.notes} onChange={e => s("notes", e.target.value)}
              className={cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none resize-none",
                isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground")}
              placeholder="Performance notes…" />
          </div>
        </div>
        <div className={cn("px-6 py-4 border-t flex justify-end gap-3", isLight ? "border-slate-100" : "border-white/10")}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />} Submit Rating
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifyMessageModal({ po, onClose, isLight }: { po: any; onClose: () => void; isLight: boolean }) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [message, setMessage] = useState(`Update on PO ${po.poNumber}: Status is now "${po.status}". Vendor: ${po.vendor?.name}.`);
  const [sending, setSending] = useState(false);
  const { data: currentUser } = useGetCurrentUser();
  const { data: users = [] } = useListUsers();
  const { toast } = useToast();

  const filteredUsers = (users as any[]).filter((u: any) =>
    u.name?.toLowerCase().includes(search.toLowerCase()) && u.id !== (currentUser as any)?.id
  );

  async function sendMessage() {
    if (!selectedUser || !message.trim()) return;
    setSending(true);
    try {
      const token = localStorage.getItem("rd_token");
      // Find or create DM room
      const roomRes = await fetch(`${BASE}api/chat/rooms/direct/${selectedUser.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (roomRes.ok) {
        const room = await roomRes.json();
        await fetch(`${BASE}api/chat/rooms/${room.id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: message, messageType: "text" }),
        });
        toast({ title: `Message sent to ${selectedUser.name}` });
        onClose();
      } else {
        toast({ title: "Failed to send message", variant: "destructive" });
      }
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-md rounded-2xl border shadow-2xl z-10",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("px-6 py-4 border-b flex items-center justify-between",
          isLight ? "border-slate-100" : "border-white/10")}>
          <h3 className="font-semibold text-sm">Notify via Message</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search User</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className={cn("w-full pl-8 pr-3 py-2 rounded-xl text-sm border focus:outline-none",
                isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10 text-foreground")}
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members..." />
            </div>
            <div className={cn("mt-2 rounded-xl border max-h-36 overflow-y-auto",
              isLight ? "border-slate-200" : "border-white/10")}>
              {filteredUsers.map((u: any) => (
                <button key={u.id} onClick={() => setSelectedUser(u)}
                  className={cn("w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                    selectedUser?.id === u.id
                      ? isLight ? "bg-primary/10 text-primary" : "bg-primary/20 text-primary"
                      : isLight ? "hover:bg-slate-50 text-gray-900" : "hover:bg-white/5 text-foreground")}>
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {u.name?.[0]}
                  </div>
                  <div>
                    <p className="font-medium text-xs">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{u.role}</p>
                  </div>
                  {selectedUser?.id === u.id && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)}
              className={cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none resize-none",
                isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground")} />
          </div>
        </div>
        <div className={cn("px-5 py-4 border-t flex justify-end gap-3",
          isLight ? "border-slate-100" : "border-white/10")}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={sendMessage} disabled={sending || !selectedUser || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
          </button>
        </div>
      </div>
    </div>
  );
}

function PODetailPanel({ po, onClose, isLight }: { po: any; onClose: () => void; isLight: boolean }) {
  const [showReceive, setShowReceive] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const qc = useQueryClient();

  const sm = statusMeta(po.status);
  const pm = payMeta(po.paymentStatus);
  const total = po.items?.reduce((s: number, i: any) => s + (parseFloat(i.totalPrice) || 0), 0) ?? parseFloat(po.totalAmount ?? "0");
  const [showNotifyMsg, setShowNotifyMsg] = useState(false);

async function sendPO() {
  // Open Microsoft Outlook with pre-filled email
  const vendorEmail = po.vendor?.email || "";
  const subject = encodeURIComponent(`Purchase Order ${po.poNumber}`);
  const body = encodeURIComponent(
    `Dear ${po.vendor?.name || "Vendor"},\n\nPlease find attached Purchase Order ${po.poNumber}.\n\nTotal Amount: ${po.totalAmount} ${po.currency?.toUpperCase()}\nDelivery Due: ${po.deliveryDue || "TBD"}\nDelivery Address: ${po.deliveryAddress || "TBD"}\n\nKind regards,\n${po.raisedBy?.name || "Procurement Team"}`
  );
  window.location.href = `mailto:${vendorEmail}?subject=${subject}&body=${body}`;

  // Also update status to sent_to_vendor
  await fetch(`${BASE}api/procurement/orders/${po.id}/send`, { method: "POST", headers: authH() });
  qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
}

async function updateStatus(newStatus: string) {
  await fetch(`${BASE}api/procurement/orders/${po.id}`, {
    method: "PUT", headers: authH(),
    body: JSON.stringify({ ...po, status: newStatus, vendorId: po.vendorId }),
  });
  qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
}

async function updatePayment(newPayment: string) {
  await fetch(`${BASE}api/procurement/orders/${po.id}`, {
    method: "PUT", headers: authH(),
    body: JSON.stringify({ ...po, paymentStatus: newPayment, vendorId: po.vendorId }),
  });
  qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
}

async function updateDeliveryDue(date: string) {
  await fetch(`${BASE}api/procurement/orders/${po.id}`, {
    method: "PUT", headers: authH(),
    body: JSON.stringify({ ...po, deliveryDue: date, vendorId: po.vendorId }),
  });
  qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
}

function openEmailNotify() {
  const subject = encodeURIComponent(`Update on Purchase Order ${po.poNumber}`);
  const body = encodeURIComponent(`Dear Team,\n\nThis is an update on Purchase Order ${po.poNumber}.\n\nVendor: ${po.vendor?.name}\nStatus: ${po.status}\nDelivery Due: ${po.deliveryDue || "TBD"}\n\nBest regards`);
  window.open(`mailto:?subject=${subject}&body=${body}`);
}
  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-end sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full sm:max-w-2xl h-[90vh] sm:h-auto sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border shadow-2xl z-10",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <div>
            <p className="text-xs text-muted-foreground">{po.vendor?.name}</p>
            <h3 className="font-bold text-lg text-foreground font-display">{po.poNumber}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs px-2 py-0.5 rounded-full", sm.cls)}>{sm.label}</span>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {/* Header KPIs */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className={cn("rounded-xl p-3", isLight ? "bg-slate-50" : "bg-white/3")}>
              <p className="text-xs text-muted-foreground">Total Amount</p>
              <p className="text-lg font-bold text-primary">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              <p className="text-xs uppercase text-muted-foreground">{po.currency}</p>
            </div>
            <div className={cn("rounded-xl p-3", isLight ? "bg-slate-50" : "bg-white/3")}>
              <p className="text-xs text-muted-foreground">Payment</p>
              <span className={cn("text-sm font-semibold px-2 py-0.5 rounded-full", pm.cls)}>{pm.label}</span>
            </div>
            <div className={cn("rounded-xl p-3", isLight ? "bg-slate-50" : "bg-white/3")}>
              <p className="text-xs text-muted-foreground">Items</p>
              <p className="text-lg font-bold">{po.items?.length ?? 0}</p>
            </div>
          </div>

          {/* Delivery Stepper */}
          <div>
  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Delivery Progress — Click to update</p>
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {STAGE_STEPS.map((s, i) => {
          const idx = STAGE_STEPS.indexOf(po.status);
          const labels = ["Draft","Sent","Acknowledged","In Transit","Received"];
          const isActive = i <= idx;
          return (
            <div key={s} className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => updateStatus(s)}
                className={cn("flex flex-col items-center gap-1 group")}
              >
                <div className={cn("w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center border-2 transition-all hover:scale-110",
                  isActive ? "border-primary bg-primary text-white" : isLight ? "border-slate-200 bg-white text-slate-400 hover:border-primary/50" : "border-white/10 bg-white/5 text-muted-foreground hover:border-primary/50")}>
                  {i + 1}
                </div>
                <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>{labels[i]}</span>
              </button>
              {i < STAGE_STEPS.length - 1 && (
                <div className={cn("w-6 h-0.5 mb-4 rounded-full", i < idx ? "bg-primary" : isLight ? "bg-slate-200" : "bg-white/10")} />
              )}
            </div>
      );
    })}
  </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground mb-0.5">Raised By</p><p className="font-medium">{po.raisedBy?.name || "—"}</p></div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Delivery Due</p>
                <input type="date" defaultValue={po.deliveryDue || ""} onChange={e => updateDeliveryDue(e.target.value)}
                  className={cn("w-full px-2 py-1 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-primary/40",
                    isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10 text-foreground")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Payment Status</p>
                <select defaultValue={po.paymentStatus} onChange={e => updatePayment(e.target.value)}
                  className={cn("w-full px-2 py-1 rounded-lg border text-sm focus:outline-none",
                    isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
                  {PAYMENT_STATUSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div><p className="text-xs text-muted-foreground mb-0.5">Delivery Address</p><p className="font-medium truncate">{po.deliveryAddress || "—"}</p></div>
            </div>

          {/* Line Items */}
          {po.items?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Line Items</p>
              <div className={cn("rounded-xl border overflow-hidden", isLight ? "border-slate-200" : "border-white/10")}>
                <table className="w-full text-xs">
                  <thead className={cn("border-b", isLight ? "bg-slate-50 border-slate-100" : "bg-white/3 border-white/8")}>
                    <tr>{["Description","Qty","Unit","Unit Price","Total"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-muted-foreground font-medium">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {po.items.map((item: any) => (
                      <tr key={item.id} className={cn("border-b last:border-0", isLight ? "border-slate-100" : "border-white/5")}>
                        <td className="px-3 py-2 font-medium">{item.description}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2 uppercase">{item.unit}</td>
                        <td className="px-3 py-2 font-mono">{Number(item.unitPrice).toLocaleString()}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{Number(item.totalPrice).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className={cn("border-t", isLight ? "border-slate-100 bg-slate-50" : "border-white/8 bg-white/3")}>
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-semibold text-xs text-muted-foreground">Total</td>
                      <td className="px-3 py-2 font-bold font-mono text-primary">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* GRN receipts */}
          {po.receipts?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Goods Received Notes</p>
              {po.receipts.map((r: any) => (
                <div key={r.id} className={cn("p-3 rounded-xl border text-xs mb-2", isLight ? "border-slate-100 bg-slate-50" : "border-white/5 bg-white/3")}>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">Received At: <span className="text-foreground font-medium">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "—"}</span></span>
                    <span className="text-muted-foreground">Qty: <span className="text-foreground font-medium">{r.quantityReceived ?? "—"}</span></span>
                    <span className="text-muted-foreground capitalize">Condition: <span className="text-foreground font-medium">{r.condition}</span></span>
                  </div>
                  {r.notes && <p className="mt-1 text-muted-foreground italic">{r.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {po.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Notes</p>
              <p className="text-sm">{po.notes}</p>
            </div>
          )}
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex flex-wrap gap-2",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <div className={cn("sticky bottom-0 px-6 py-4 border-t flex flex-wrap gap-2",
  isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
  {po.status === "draft" && (
    <button onClick={sendPO}
      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
      <Send className="w-3.5 h-3.5" /> Send to Vendor
    </button>
  )}
  {["sent_to_vendor","in_transit","acknowledged","partially_received"].includes(po.status) && (
    <button onClick={() => setShowReceive(true)}
      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">
      <Truck className="w-3.5 h-3.5" /> Receive Goods
    </button>
  )}
  {po.status === "received" && !po.performance && (
    <button onClick={() => setShowRate(true)}
      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600">
      <Star className="w-3.5 h-3.5" /> Rate Vendor
    </button>
  )}
  <button onClick={openEmailNotify}
    className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ml-auto",
      isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
    <Send className="w-3.5 h-3.5" /> Notify via Email
  </button>
  <button onClick={() => setShowNotifyMsg(true)}
    className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors",
      isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
    <MessageSquare className="w-3.5 h-3.5" /> Notify via Message
  </button>
</div>
          {["sent_to_vendor","in_transit","acknowledged","partially_received"].includes(po.status) && (
            <button onClick={() => setShowReceive(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">
              <Truck className="w-3.5 h-3.5" /> Receive Goods
            </button>
          )}
          {po.status === "received" && !po.performance && (
            <button onClick={() => setShowRate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600">
              <Star className="w-3.5 h-3.5" /> Rate Vendor
            </button>
          )}
        </div>
      </div>
      {showReceive && <ReceiveModal po={po} onClose={() => setShowReceive(false)} isLight={isLight} />}
      {showRate && <RateVendorModal po={po} onClose={() => setShowRate(false)} isLight={isLight} />}
      {showNotifyMsg && <NotifyMessageModal po={po} onClose={() => setShowNotifyMsg(false)} isLight={isLight} />}
    </div>
  );
}

function NewPOModal({ onClose, isLight, vendors }: { onClose: () => void; isLight: boolean; vendors: any[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ poNumber: "", vendorId: "", vendorName: "", currency: "ngn", deliveryAddress: "", deliveryDue: "", paymentDue: "", notes: "", category: "ingredients" });
const [vendorSearch, setVendorSearch] = useState("");
const [showVendorDrop, setShowVendorDrop] = useState(false);
const [addingVendor, setAddingVendor] = useState(false);

const filteredVendors = vendors.filter((v: any) =>
  v.name?.toLowerCase().includes(vendorSearch.toLowerCase())
);

async function addVendorToList() {
  if (!vendorSearch.trim()) return;
  setAddingVendor(true);
  try {
    const res = await fetch(`${BASE}api/procurement/vendors`, {
      method: "POST", headers: authH(),
      body: JSON.stringify({ name: vendorSearch.trim(), currency: "usd" }),
    });
    const newVendor = await res.json();
    qc.invalidateQueries({ queryKey: ["/api/procurement/vendors"] });
    f("vendorId", String(newVendor.id));
    f("vendorName", vendorSearch.trim());
    setShowVendorDrop(false);
  } finally { setAddingVendor(false); }
}
  const [items, setItems] = useState<any[]>([{ description: "", quantity: "", unit: "units", unitPrice: "" }]);
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground");

  function addItem() { setItems(p => [...p, { description: "", quantity: "", unit: "units", unitPrice: "" }]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }
  function setItem(i: number, k: string, v: any) { setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it)); }

  const totalAmount = items.reduce((s, it) => s + (parseFloat(it.quantity) * parseFloat(it.unitPrice) || 0), 0);

  async function save() {
    if (!form.vendorId || !form.poNumber) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        vendorId: parseInt(form.vendorId),
        totalAmount,
        items: items.filter(it => it.description && it.quantity && it.unitPrice).map(it => ({
          ...it, totalPrice: (parseFloat(it.quantity) * parseFloat(it.unitPrice)).toFixed(2),
        })),
      };
      const res = await fetch(`${BASE}api/procurement/orders`, { method: "POST", headers: authH(), body: JSON.stringify(payload) });
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
        onClose();
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-2xl rounded-2xl border shadow-2xl z-10 max-h-[90vh] overflow-y-auto",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Create Purchase Order</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">PO Number *</label>
              <input className={inputCls} value={form.poNumber} onChange={e => f("poNumber", e.target.value)} placeholder="Enter PO number manually (e.g. PO-2024-001)…" />
            </div>
            <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor *</label>
            <div className="relative">
    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    <input className={cn(inputCls, "pl-8")} value={vendorSearch || form.vendorName}
      onChange={e => { setVendorSearch(e.target.value); f("vendorName", e.target.value); setShowVendorDrop(true); }}
      onFocus={() => setShowVendorDrop(true)}
      placeholder="Search or type vendor name..." />
    {showVendorDrop && (
      <div className={cn("absolute z-10 w-full mt-1 rounded-xl border shadow-xl max-h-48 overflow-y-auto",
        isLight ? "bg-white border-gray-200" : "bg-[#1a1a2e] border-white/10")}>
        {filteredVendors.map((v: any) => (
          <button key={v.id} type="button"
            onClick={() => { f("vendorId", String(v.id)); f("vendorName", v.name); setVendorSearch(v.name); setShowVendorDrop(false); }}
            className={cn("w-full text-left px-3 py-2 text-sm", isLight ? "hover:bg-gray-50 text-gray-900" : "hover:bg-white/5 text-foreground")}>
            {v.name}
          </button>
        ))}
        {vendorSearch && !filteredVendors.find((v: any) => v.name.toLowerCase() === vendorSearch.toLowerCase()) && (
          <button type="button" onClick={addVendorToList} disabled={addingVendor}
            className={cn("w-full text-left px-3 py-2 text-sm border-t flex items-center gap-2",
              isLight ? "hover:bg-blue-50 text-blue-600 border-gray-100" : "hover:bg-primary/10 text-primary border-white/10")}>
            <Plus className="w-3.5 h-3.5" />
            {addingVendor ? "Adding..." : `Add "${vendorSearch}" to vendors`}
          </button>
        )}
      </div>
    )}
            </div>
            </div>
<div className="col-span-2">
  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
  <select className={cn(inputCls, "appearance-none")} value={form.category} onChange={e => f("category", e.target.value)}>
    {["ingredients","packaging","equipment","services","logistics","other"].map(c => (
      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
    ))}
  </select>
</div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
              <select className={cn(inputCls, "appearance-none")} value={form.currency} onChange={e => f("currency", e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delivery Due</label>
              <input className={inputCls} type="date" value={form.deliveryDue} onChange={e => f("deliveryDue", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment Due</label>
              <input className={inputCls} type="date" value={form.paymentDue} onChange={e => f("paymentDue", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delivery Address</label>
              <input className={inputCls} value={form.deliveryAddress} onChange={e => f("deliveryAddress", e.target.value)} placeholder="Delivery address…" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Line Items</p>
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
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input placeholder="Unit Price" type="number" className={cn("w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")} value={item.unitPrice} onChange={e => setItem(i, "unitPrice", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <button onClick={() => removeItem(i)} className="p-1 text-muted-foreground hover:text-destructive"><Minus className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
            {totalAmount > 0 && (
              <div className="text-right text-xs font-semibold text-primary mt-2">
                Total: {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.currency.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Internal notes…" />
          </div>
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving || !form.vendorId || !form.poNumber}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Create PO
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPOModal({ po, onClose, isLight, vendors }: { po: any; onClose: () => void; isLight: boolean; vendors: any[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    poNumber: po.poNumber || "",
    vendorId: po.vendorId || "",
    currency: po.currency || "ngn",
    deliveryAddress: po.deliveryAddress || "",
    deliveryDue: po.deliveryDue || "",
    paymentDue: po.paymentDue || "",
    paymentStatus: po.paymentStatus || "unpaid",
    notes: po.notes || "",
    totalAmount: po.totalAmount || "",
  });
  const [saving, setSaving] = useState(false);
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground");

  async function save() {
    setSaving(true);
    try {
      await fetch(`${BASE}api/procurement/orders/${po.id}`, {
        method: "PUT", headers: authH(), body: JSON.stringify(form),
      });
      qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
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
          <h3 className="text-base font-semibold">Edit Purchase Order — {po.poNumber}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor</label>
            <select className={cn(inputCls, "appearance-none")} value={form.vendorId} onChange={e => f("vendorId", e.target.value)}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
              <select className={cn(inputCls, "appearance-none")} value={form.currency} onChange={e => f("currency", e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Total Amount</label>
              <input className={inputCls} type="number" value={form.totalAmount} onChange={e => f("totalAmount", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment Status</label>
              <select className={cn(inputCls, "appearance-none")} value={form.paymentStatus} onChange={e => f("paymentStatus", e.target.value)}>
                {PAYMENT_STATUSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delivery Due</label>
              <input className={inputCls} type="date" value={form.deliveryDue} onChange={e => f("deliveryDue", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment Due</label>
              <input className={inputCls} type="date" value={form.paymentDue} onChange={e => f("paymentDue", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delivery Address</label>
              <input className={inputCls} value={form.deliveryAddress} onChange={e => f("deliveryAddress", e.target.value)} placeholder="Delivery address…" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea rows={2} className={cn(inputCls, "resize-none")} value={form.notes} onChange={e => f("notes", e.target.value)} />
          </div>
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}


export default function OrdersTab() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { data: currentUser } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [editPO, setEditPO] = useState<any>(null);
  const qc = useQueryClient();

  const isProcurementDept = ((currentUser as any)?.department ?? "").toLowerCase().includes("procurement") ||
    ["admin","manager","ceo"].includes((currentUser as any)?.role ?? "");

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/procurement/orders"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/orders`, { headers: authH() });
      return r.json();
    },
  });

  const { data: vendors = [] } = useQuery<any[]>({
    queryKey: ["/api/procurement/vendors"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/vendors`, { headers: authH() });
      return r.json();
    },
  });

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalSpend = orders.reduce((s, po) => s + (parseFloat(po.totalAmount ?? "0") || 0), 0);
  const openPOs = orders.filter(po => !["received","closed","cancelled"].includes(po.status)).length;
  const overdue = orders.filter(po => po.deliveryDue && po.deliveryDue < todayStr && !["received","closed","cancelled"].includes(po.status)).length;
  const monthSpend = orders.filter(po => new Date(po.createdAt) >= startOfMonth).reduce((s, po) => s + (parseFloat(po.totalAmount ?? "0") || 0), 0);

  async function handleDeletePO(id: number, poNumber: string) {
  if (!confirm(`Delete ${poNumber}? This cannot be undone.`)) return;
  await fetch(`${BASE}api/procurement/orders/${id}`, { method: "DELETE", headers: authH() });
  qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] });
}
  const filtered = orders.filter(po => {
    const matchSearch = !search || po.poNumber?.includes(search) || po.vendor?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || po.status === filterStatus;
    const matchPay = filterPayment === "all" || po.paymentStatus === filterPayment;
    return matchSearch && matchStatus && matchPay;
  });

  function exportData() {
    const rows = filtered.map(po => ({
      "PO Number": po.poNumber, "Vendor": po.vendor?.name, "Raised By": po.raisedBy?.name,
      "Items": po.items?.length ?? 0, "Total Amount": po.totalAmount, "Currency": po.currency,
      "Payment Status": po.paymentStatus, "Delivery Due": po.deliveryDue, "Status": po.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Orders");
    XLSX.writeFile(wb, `purchase_orders_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const kpiCls = cn("rounded-2xl border p-4 space-y-1", isLight ? "bg-white border-slate-200" : "glass-card border-white/10");

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Spend", value: totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 }), icon: DollarSign, color: "text-blue-400 bg-blue-500/10" },
          { label: "Open POs", value: openPOs, icon: Package, color: "text-violet-400 bg-violet-500/10" },
          { label: "Overdue Deliveries", value: overdue, icon: AlertTriangle, color: overdue > 0 ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10" },
          { label: "Spend This Month", value: monthSpend.toLocaleString(undefined, { maximumFractionDigits: 0 }), icon: FileText, color: "text-emerald-400 bg-emerald-500/10" },
        ].map(k => (
          <div key={k.label} className={kpiCls}>
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", k.color)}>
              <k.icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold font-display">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={cn("rounded-2xl border p-4 flex flex-wrap items-center gap-3", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input placeholder="Search PO number or vendor…" value={search} onChange={e => setSearch(e.target.value)}
            className={cn("w-full pl-9 pr-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground")} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className={cn("text-xs rounded-xl border px-3 py-2 appearance-none focus:outline-none",
            isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
          <option value="all">All Statuses</option>
          {PO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
          className={cn("text-xs rounded-xl border px-3 py-2 appearance-none focus:outline-none",
            isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
          <option value="all">All Payment Statuses</option>
          {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={exportData}
          className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors",
            isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
          <Download className="w-3.5 h-3.5" /> Export
        </button>
        {isProcurementDept && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> New PO
          </button>
        )}
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
                  {["PO Number","Title","Vendor","Raised By","Items","Total Amount","Payment","Delivery Due","Status",""].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />No purchase orders found.
                  </td></tr>
                ) : filtered.map(po => {
                  const sm = statusMeta(po.status);
                  const pm = payMeta(po.paymentStatus);
                  const isOverdue = po.deliveryDue && po.deliveryDue < todayStr && !["received","closed","cancelled"].includes(po.status);
                  return (
                    <tr key={po.id}
                      className={cn("border-b last:border-0 transition-colors cursor-pointer group", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/3")}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary" onClick={() => setSelectedPO(po)}>{po.poNumber}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate" onClick={() => setSelectedPO(po)}>{po.purchaseRequest?.title || po.notes || "—"}</td>
                      <td className="px-4 py-3 font-medium text-foreground" onClick={() => setSelectedPO(po)}>{po.vendor?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground" onClick={() => setSelectedPO(po)}>{po.raisedBy?.name || "—"}</td>
                      <td className="px-4 py-3 text-center" onClick={() => setSelectedPO(po)}>{po.items?.length ?? 0}</td>
                      <td className="px-4 py-3 font-mono text-sm" onClick={() => setSelectedPO(po)}>{po.totalAmount ? Number(po.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</td>
                      <td className="px-4 py-3" onClick={() => setSelectedPO(po)}><span className={cn("text-xs px-2 py-0.5 rounded-full", pm.cls)}>{pm.label}</span></td>
                      <td className={cn("px-4 py-3 text-xs", isOverdue ? "text-red-400 font-medium" : "text-muted-foreground")} onClick={() => setSelectedPO(po)}>{po.deliveryDue || "—"}{isOverdue && " ⚠"}</td>
                      <td className="px-4 py-3" onClick={() => setSelectedPO(po)}><span className={cn("text-xs px-2 py-0.5 rounded-full", sm.cls)}>{sm.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); setEditPO(po); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDeletePO(po.id, po.poNumber); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" onClick={() => setSelectedPO(po)} />
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

{showNew && <NewPOModal onClose={() => setShowNew(false)} isLight={isLight} vendors={vendors} />}
{editPO && <EditPOModal po={editPO} onClose={() => setEditPO(null)} isLight={isLight} vendors={vendors} />}
{selectedPO && <PODetailPanel po={selectedPO} onClose={() => { setSelectedPO(null); qc.invalidateQueries({ queryKey: ["/api/procurement/orders"] }); }} isLight={isLight} />}
    </div>
  );
}
