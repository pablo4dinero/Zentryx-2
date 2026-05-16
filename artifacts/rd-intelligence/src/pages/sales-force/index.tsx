import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, Plus, Search, Filter, Download, LayoutGrid, List, Table2,
  ChevronDown, X, Users, Package, Target, AlertCircle, CheckCircle2, Clock,
  BarChart3, PieChart, Building2, Eye, Star, AlertTriangle, Trash2
} from "lucide-react";
import { useListUsers } from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import * as XLSX from "xlsx";

import SalesChartsPage from "./Charts";
import SalesForecastPage from "./Forecast";
import NewProductionOrdersPage from "./NewProductionOrders";
import { useCustomOptions, DEFAULT_PRODUCT_TYPES, displayLabel } from "@/lib/project-options";
import { CustomOptionsSelect } from "@/components/ui/CustomOptionsSelect";

const BASE = import.meta.env.BASE_URL;

const URGENCY = [
  { value: "urgent", label: "Urgent", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", dot: "bg-red-500" },
  { value: "medium", label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-500" },
  { value: "normal", label: "Normal", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", dot: "bg-green-500" },
];

const APPROVAL_STATUS = [
  { value: "approved", label: "Approved", color: "text-green-400", bg: "bg-green-500/10", dot: "bg-green-500" },
  { value: "not_yet_approved", label: "Not Yet Approved", color: "text-yellow-400", bg: "bg-yellow-500/10", dot: "bg-yellow-500" },
  { value: "cancelled", label: "Cancelled", color: "text-red-400", bg: "bg-red-500/10", dot: "bg-red-500" },
];

function calcPriority(account: any): { score: number; breakdown: { label: string; pts: number }[] } {
  const vol = parseFloat(account.volume) || 0;
  let volPts = 1;
  if (vol >= 10000) volPts = 4;
  else if (vol >= 1000) volPts = 3;
  else if (vol >= 500) volPts = 2;

  const urgPts = account.urgencyLevel === "urgent" ? 2 : 1;
  const custPts = account.customerType === "existing" ? 3 : 2;
  const score = Math.min(10, volPts + urgPts + custPts);
  return {
    score,
    breakdown: [
      { label: "Volume", pts: volPts },
      { label: "Urgency", pts: urgPts },
      { label: "Customer Type", pts: custPts },
    ],
  };
}

function PriorityBadge({ account }: { account: any }) {
  const [hover, setHover] = useState(false);
  const { score, breakdown } = calcPriority(account);
  const color = score >= 8 ? "text-red-400 border-red-500/30 bg-red-500/10"
    : score >= 6 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
      : "text-green-400 border-green-500/30 bg-green-500/10";
  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold cursor-default select-none", color)}>
        <Star className="w-3 h-3" /> {score}/10
      </div>
      <AnimatePresence>
        {hover && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute right-0 top-full mt-1 z-50 glass-panel border border-white/10 rounded-xl p-3 w-40 shadow-xl">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Score Breakdown</p>
            {breakdown.map(b => (
              <div key={b.label} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="text-foreground font-medium">+{b.pts}</span>
              </div>
            ))}
            <div className="border-t border-white/10 mt-2 pt-2 flex justify-between text-xs font-bold">
              <span>Total</span><span className="text-primary">{score}/10</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VolumeTag({ volume }: { volume: string | null }) {
  const v = parseFloat(volume || "0");
  if (v >= 10000) return <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Very High</span>;
  if (v >= 1000) return <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">High</span>;
  if (v >= 500) return <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">Medium</span>;
  return <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Low</span>;
}

function UrgencyIndicator({ level }: { level: string }) {
  const u = URGENCY.find(x => x.value === level) || URGENCY[2];
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border", u.bg, u.color)}>
      <span className={cn("w-2 h-2 rounded-full", u.dot)} />{u.label}
    </span>
  );
}

function ExportModal({ accounts, onClose }: { accounts: any[]; onClose: () => void }) {
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const fields = [
    { key: "id", label: "Account ID" }, { key: "company", label: "Company" },
    { key: "productName", label: "Product Name" }, { key: "productType", label: "Product Type" },
    { key: "accountManagerNames", label: "Account Managers" }, { key: "contactPerson", label: "Contact Person" },
    { key: "cpPhone", label: "CP Phone" }, { key: "cpEmail", label: "CP Email" },
    { key: "customerType", label: "Customer Type" }, { key: "targetPrice", label: "Target Price ($/kg)" },
    { key: "sellingPrice", label: "Selling Price ($/kg)" }, { key: "volume", label: "Volume (kg/month)" },
    { key: "urgencyLevel", label: "Urgency" }, { key: "competitorReference", label: "Competitor Reference" },
    { key: "application", label: "Application" }, { key: "margin", label: "Margin (%)" },
    { key: "approvalStatus", label: "Approval Status" }, { key: "priorityScore", label: "Priority Score" },
    { key: "createdAt", label: "Date Added" },
  ];
  const [selected, setSelected] = useState<string[]>(fields.map(f => f.key));
  const toggle = (k: string) => setSelected(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);

  const doExport = () => {
    const data = accounts.map(a => {
      const row: Record<string, any> = {};
      const { score } = calcPriority(a);
      selected.forEach(k => {
        if (k === "accountManagerNames") row["Account Managers"] = (a.accountManagerNames || []).join(", ");
        else if (k === "priorityScore") row["Priority Score"] = `${score}/10`;
        else if (k === "createdAt") row["Date Added"] = new Date(a.createdAt).toLocaleDateString();
        else {
          const f = fields.find(x => x.key === k);
          row[f?.label || k] = a[k] ?? "";
        }
      });
      return row;
    });

    if (format === "csv") {
      const headers = selected.map(k => fields.find(f => f.key === k)?.label || k);
      const rows = data.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "salesforce_accounts.csv"; a.click();
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Accounts");
      XLSX.writeFile(wb, "salesforce_accounts.xlsx");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h3 className="font-bold text-foreground">Export Accounts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{accounts.length} accounts · select fields to export</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="flex gap-2 mb-4">
            {(["xlsx", "csv"] as const).map(f => (
              <button key={f} onClick={() => setFormat(f)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all uppercase", format === f ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                {f}
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Metadata Fields ({selected.length} selected)</p>
          <div className="grid grid-cols-2 gap-2">
            {fields.map(f => (
              <label key={f.key} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-xs transition-all", selected.includes(f.key) ? "border-primary/30 bg-primary/10 text-foreground" : "border-white/5 text-muted-foreground hover:border-white/10")}>
                <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} className="accent-primary w-3 h-3" />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-white/5 flex gap-3">
          <button onClick={doExport} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90">
            <Download className="w-4 h-4" /> Export {format.toUpperCase()}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-white/10 text-muted-foreground rounded-xl text-sm hover:text-foreground">Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

function AddAccountModal({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: users } = useListUsers();
  const { fmtNGN } = useExchangeRate();
  const { toast } = useToast();
  const [manSearch, setManSearch] = useState("");
  const typeOpts = useCustomOptions("productType", DEFAULT_PRODUCT_TYPES);
  const [form, setForm] = useState({
    company: "", productName: "", accountManagers: [] as number[], contactPerson: "",
    cpPhone: "", cpEmail: "", customerType: "new", productType: "",
    application: "", targetPrice: "", volume: "", urgencyLevel: "normal",
    competitorReference: "",
  });
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const { theme: _aaTheme } = useTheme();
  const isLight = _aaTheme === "light";
  const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
  const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";

  const toggleManager = (id: number) => {
    setForm(f => ({
      ...f,
      accountManagers: f.accountManagers.includes(id) ? f.accountManagers.filter(x => x !== id) : [...f.accountManagers, id],
    }));
  };

  const filteredUsers = (users || []).filter((u: any) => u.name.toLowerCase().includes(manSearch.toLowerCase()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company || !form.productName || !form.productType) {
      toast({ title: "Company, Product Name and Product Type are required", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("rd_token");
      const res = await fetch(`${BASE}api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      onSuccess();
      setOpen(false);
      setForm({ company: "", productName: "", accountManagers: [], contactPerson: "", cpPhone: "", cpEmail: "", customerType: "new", productType: "", application: "", targetPrice: "", volume: "", urgencyLevel: "normal", competitorReference: "" });
      toast({ title: "Account created" });
    } catch {
      toast({ title: "Failed to create account", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
        <Plus className="w-4 h-4" /> Add Account
      </button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn("border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Sales Request Form</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a new account record</p>
                </div>
                <button onClick={() => setOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10")}><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={lCls}>Company *</label>
                      <input value={form.company} onChange={e => setF("company", e.target.value)} placeholder="Company name" className={iCls} required />
                    </div>
                    <div>
                      <label className={lCls}>Product Name *</label>
                      <input value={form.productName} onChange={e => setF("productName", e.target.value)} placeholder="Product name" className={iCls} required />
                    </div>
                    <div>
                      <label className={lCls}>Product Type *</label>
                      <CustomOptionsSelect
                        value={form.productType}
                        onChange={v => setF("productType", v)}
                        handle={typeOpts}
                        displayFn={displayLabel}
                        placeholder="Select product type…"
                        isLight={isLight}
                      />
                    </div>
                    <div>
                      <label className={lCls}>Customer Type</label>
                      <select value={form.customerType} onChange={e => setF("customerType", e.target.value)} className={iCls + " cursor-pointer"}>
                        <option value="new" className="bg-white text-black">New Customer</option>
                        <option value="existing" className="bg-white text-black">Existing Customer</option>
                      </select>
                    </div>
                    <div>
                      <label className={lCls}>Contact Person (CP)</label>
                      <input value={form.contactPerson} onChange={e => setF("contactPerson", e.target.value)} placeholder="Full name" className={iCls} />
                    </div>
                    <div>
                      <label className={lCls}>CP's Phone Number</label>
                      <input value={form.cpPhone} onChange={e => setF("cpPhone", e.target.value)} placeholder="+234 xxx xxxx xxxx" className={iCls} />
                    </div>
                    <div>
                      <label className={lCls}>CP's Email</label>
                      <input value={form.cpEmail} onChange={e => setF("cpEmail", e.target.value)} placeholder="email@company.com" type="email" className={iCls} />
                    </div>
                    <div>
                      <label className={lCls}>Application</label>
                      <input value={form.application} onChange={e => setF("application", e.target.value)} placeholder="e.g. Noodles, Chips" className={iCls} />
                    </div>
                    <div>
                      <label className={lCls}>Target Price ($/kg)</label>
                      <input value={form.targetPrice} onChange={e => setF("targetPrice", e.target.value)} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                      {form.targetPrice && <p className="text-xs text-emerald-400 mt-1">{fmtNGN(parseFloat(form.targetPrice))}/kg</p>}
                    </div>
                    <div>
                      <label className={lCls}>Volume (kg/month)</label>
                      <input value={form.volume} onChange={e => setF("volume", e.target.value)} placeholder="0" type="number" min="0" className={iCls} />
                      {form.volume && <div className="mt-1"><VolumeTag volume={form.volume} /></div>}
                    </div>
                    <div>
                      <label className={lCls}>Urgency Level</label>
                      <div className="flex gap-2 flex-wrap">
                        {URGENCY.map(u => (
                          <button key={u.value} type="button" onClick={() => setF("urgencyLevel", u.value)}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all", form.urgencyLevel === u.value ? cn(u.bg, u.color) : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20")}>
                            <span className={cn("w-2 h-2 rounded-full", u.dot)} />{u.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={lCls}>Competitor Reference</label>
                      <input value={form.competitorReference} onChange={e => setF("competitorReference", e.target.value)} placeholder="Competitor names" className={iCls} />
                    </div>
                  </div>

                  <div>
                    <label className={lCls}>Account Manager(s)</label>
                    <input value={manSearch} onChange={e => setManSearch(e.target.value)} placeholder="Search staff…" className={iCls + " mb-2"} />
                    <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                      {filteredUsers.map((u: any) => (
                        <label key={u.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all", form.accountManagers.includes(u.id) ? "border-primary/30 bg-primary/10 text-foreground" : isLight ? "border-gray-100 text-gray-600 hover:bg-gray-50" : "border-white/5 text-muted-foreground hover:border-white/10")}>
                          <input type="checkbox" checked={form.accountManagers.includes(u.id)} onChange={() => toggleManager(u.id)} className="accent-primary" />
                          <span className="flex-1">{u.name}</span>
                          <span className="text-[10px] text-muted-foreground/60">{u.department || u.role?.replace(/_/g, " ")}</span>
                        </label>
                      ))}
                    </div>
                    {form.accountManagers.length > 0 && (
                      <p className="text-xs text-primary mt-1">{form.accountManagers.length} manager{form.accountManagers.length > 1 ? "s" : ""} selected</p>
                    )}
                  </div>
                </div>
              </form>
              <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                <button type="submit" onClick={handleSubmit} disabled={loading}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                  {loading ? "Saving…" : "Save Account"}
                </button>
                <button type="button" onClick={() => setOpen(false)}
                  className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function AccountCard({ account, onClick, onDelete }: { account: any; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const { score } = calcPriority(account);
  const urgency = URGENCY.find(u => u.value === account.urgencyLevel) || URGENCY[2];
  const approval = APPROVAL_STATUS.find(a => a.value === account.approvalStatus) || APPROVAL_STATUS[1];
  const isOnHold = (account.status ?? "active") === "on_hold";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="glass-card rounded-2xl p-5 border border-white/5 hover:border-primary/20 cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/5 group relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground truncate group-hover:text-primary transition-colors">{account.company}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{account.productName}</p>
          {isOnHold && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 mt-1">
              <Clock className="w-2.5 h-2.5" /> On Hold
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <PriorityBadge account={account} />
          <button onClick={onDelete} className="p-1 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Delete account">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Product Type</span>
          <span className="text-foreground font-medium">{account.productType}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Volume</span>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground">{parseFloat(account.volume || 0).toLocaleString()} kg/mo</span>
            <VolumeTag volume={account.volume} />
          </div>
        </div>
        {account.targetPrice && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Target Price</span>
            <span className="text-foreground">${parseFloat(account.targetPrice).toFixed(2)}/kg</span>
          </div>
        )}
        {account.accountManagerNames?.length > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Manager(s)</span>
            <span className="text-foreground truncate max-w-[140px]">{account.accountManagerNames.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <UrgencyIndicator level={account.urgencyLevel} />
        <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border", approval.bg, approval.color)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", approval.dot)} />{approval.label}
        </span>
      </div>
    </motion.div>
  );
}

function AccountRow({ account, onClick, onDelete }: { account: any; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const urgency = URGENCY.find(u => u.value === account.urgencyLevel) || URGENCY[2];
  const isOnHold = (account.status ?? "active") === "on_hold";
  return (
    <tr onClick={onClick} className="hover:bg-white/[0.03] cursor-pointer transition-colors border-b border-white/5 last:border-0 group">
      <td className="px-5 py-3">
        <div>
          <p className="font-medium text-foreground text-sm">{account.company}</p>
          <p className="text-xs text-muted-foreground">{account.productName}</p>
          {isOnHold && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 mt-1">
              <Clock className="w-2.5 h-2.5" /> On Hold
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3 text-xs text-muted-foreground">
        {account.productType ?? "—"}
      </td>
      <td className="px-5 py-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground">{parseFloat(account.volume || 0).toLocaleString()}</span>
          <VolumeTag volume={account.volume} />
        </div>
      </td>
      <td className="px-5 py-3 text-xs text-muted-foreground">
        {account.accountManagerNames?.join(", ") || "—"}
      </td>
      <td className="px-5 py-3"><UrgencyIndicator level={account.urgencyLevel} /></td>
      <td className="px-5 py-3"><PriorityBadge account={account} /></td>
      <td className="px-5 py-3">
        <button onClick={onDelete} className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

function MatrixView({ accounts, onClick }: { accounts: any[]; onClick: (a: any) => void }) {
  const rows = URGENCY.map(u => ({
    urgency: u,
    cols: ["low", "medium", "high", "very_high"].map(vol => ({
      volLabel: vol,
      items: accounts.filter(a => {
        const v = parseFloat(a.volume || 0);
        const urgMatch = a.urgencyLevel === u.value;
        const volMatch = vol === "very_high" ? v >= 10000 : vol === "high" ? v >= 1000 && v < 10000 : vol === "medium" ? v >= 500 && v < 1000 : v < 500;
        return urgMatch && volMatch;
      }),
    })),
  }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="px-3 py-2 text-xs text-muted-foreground text-left">Urgency / Volume</th>
            {["Low", "Medium", "High", "Very High"].map(v => (
              <th key={v} className="px-3 py-2 text-xs text-muted-foreground text-center">{v}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.urgency.value}>
              <td className="px-3 py-2">
                <UrgencyIndicator level={row.urgency.value} />
              </td>
              {row.cols.map((col, i) => (
                <td key={i} className={cn("px-2 py-2 rounded-xl border border-white/5 align-top", col.items.length > 0 ? "bg-primary/5" : "bg-white/[0.01]")}>
                  {col.items.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground/30 py-3">—</div>
                  ) : (
                    <div className="space-y-1">
                      {col.items.map(a => (
                        <button key={a.id} onClick={() => onClick(a)}
                          className="w-full text-left px-2 py-1.5 rounded-lg bg-white/5 hover:bg-primary/10 transition-colors">
                          <p className="text-xs font-medium text-foreground truncate">{a.company}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{a.productName}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "priority", label: "Priority Score" },
  { value: "company", label: "Company (A-Z)" },
  { value: "recently_updated", label: "Recently Updated" },
  { value: "date_desc", label: "Date Added (Newest)" },
  { value: "date_asc", label: "Date Added (Oldest)" },
  { value: "volume_desc", label: "Volume (High-Low)" },
  { value: "manager", label: "Account Manager" },
  { value: "product_type", label: "Product Type" },
];

const STATUS_OPTS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
];

function AccountsPage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "portfolio" | "matrix">("list");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [filterPt, setFilterPt] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showExport, setShowExport] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === "light";
  const typeOpts = useCustomOptions("productType", DEFAULT_PRODUCT_TYPES);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const token = localStorage.getItem("rd_token");
      const res = await fetch(`${BASE}api/accounts`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
  });

  const handleDelete = useCallback(async (e: React.MouseEvent, id: number, company: string) => {
    e.stopPropagation();
    const token = localStorage.getItem("rd_token");
    try {
      await fetch(`${BASE}api/accounts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Account deleted", description: `${company} has been removed.` });
    } catch {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
  }, [queryClient, toast]);

  const filtered = (accounts as any[])
    .filter(a => {
      const searchMatch = a.company.toLowerCase().includes(search.toLowerCase()) ||
        a.productName.toLowerCase().includes(search.toLowerCase());
      const ptMatch = filterPt === "all" || a.productType === filterPt;
      const statusMatch = filterStatus === "all" || (a.status ?? "active") === filterStatus;
      return searchMatch && ptMatch && statusMatch;
    })
    .sort((a: any, b: any) => {
      if (sort === "priority") return calcPriority(b).score - calcPriority(a).score;
      if (sort === "company") return a.company.localeCompare(b.company);
      if (sort === "recently_updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sort === "date_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "date_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "volume_desc") return parseFloat(b.volume || 0) - parseFloat(a.volume || 0);
      if (sort === "manager") return (a.accountManagerNames?.[0] || "").localeCompare(b.accountManagerNames?.[0] || "");
      if (sort === "product_type") return a.productType.localeCompare(b.productType);
      return 0;
    });

  const goToAccount = useCallback((a: any) => navigate(`/sales-force/${a.id}`), [navigate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex-1 flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…"
              className={cn("h-9 pl-9 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64",
                isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground"
              )} />
          </div>

          <select value={filterPt} onChange={e => setFilterPt(e.target.value)}
            className={cn("h-9 px-3 rounded-xl border text-sm focus:outline-none cursor-pointer",
              isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground"
            )}>
            <option value="all">All Products</option>
            {typeOpts.options.map(p => <option key={p} value={p} className="bg-white text-black">{displayLabel(p)}</option>)}
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className={cn("h-9 px-3 rounded-xl border text-sm focus:outline-none cursor-pointer",
              isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground"
            )}>
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value} className="bg-white text-black">{o.label}</option>)}
          </select>

          <select value={sort} onChange={e => setSort(e.target.value)}
            className={cn("h-9 px-3 rounded-xl border text-sm focus:outline-none cursor-pointer",
              isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground"
            )}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-white text-black">{o.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1 p-1 rounded-xl border border-white/10 bg-white/5">
            {([["portfolio", LayoutGrid], ["list", List], ["matrix", Table2]] as [string, any][]).map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v as any)}
                className={cn("p-1.5 rounded-lg transition-all text-xs font-medium", view === v ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 h-9 px-3 border border-white/10 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <Download className="w-4 h-4" /> Export
          </button>
          <AddAccountModal onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/accounts"] })} />
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{filtered.length} account{filtered.length !== 1 ? "s" : ""}</span>
        {(search || filterPt !== "all" || filterStatus !== "all") && (
          <button onClick={() => { setSearch(""); setFilterPt("all"); setFilterStatus("all"); }} className="text-primary hover:underline">Clear filters</button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading accounts…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-3">
          <TrendingUp className="w-12 h-12 opacity-20" />
          <p className="text-sm">No accounts yet</p>
          <p className="text-xs opacity-60">Click "Add Account" to create your first account</p>
        </div>
      ) : view === "portfolio" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a: any) => <AccountCard key={a.id} account={a} onClick={() => goToAccount(a)} onDelete={(e) => handleDelete(e, a.id, a.company)} />)}
        </div>
      ) : view === "list" ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-white/5 border-b border-white/5">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Account</th>
                <th className="px-5 py-3 text-left font-medium">Product Type</th>
                <th className="px-5 py-3 text-left font-medium">Volume</th>
                <th className="px-5 py-3 text-left font-medium">Manager(s)</th>
                <th className="px-5 py-3 text-left font-medium">Urgency</th>
                <th className="px-5 py-3 text-left font-medium">Priority</th>
                <th className="px-5 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => <AccountRow key={a.id} account={a} onClick={() => goToAccount(a)} onDelete={(e) => handleDelete(e, a.id, a.company)} />)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-4">
          <MatrixView accounts={filtered} onClick={goToAccount} />
        </div>
      )}

      <AnimatePresence>
        {showExport && <ExportModal accounts={filtered} onClose={() => setShowExport(false)} />}
      </AnimatePresence>
    </div>
  );
}

const SF_TABS = ["Accounts", "New Production Orders", "Charts", "Forecast"] as const;
type SfTab = typeof SF_TABS[number];

export default function SalesForce() {
  const [activeTab, setActiveTab] = useState<SfTab>("Accounts");
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <div className="space-y-0">
      <div className="mb-5">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-primary" /> Sales Force
        </h1>
        <p className="text-muted-foreground mt-1">Manage accounts, track performance, and forecast revenue.</p>
      </div>

      <div className={cn("flex gap-1 p-1 rounded-2xl border mb-6 w-fit",
        isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10"
      )}>
        {SF_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-5 py-2 rounded-xl text-sm font-semibold transition-all",
              activeTab === tab
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
            )}>
            {tab}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {activeTab === "Accounts" && <AccountsPage />}
          {activeTab === "New Production Orders" && <NewProductionOrdersPage />}
          {activeTab === "Charts" && <SalesChartsPage />}
          {activeTab === "Forecast" && <SalesForecastPage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
