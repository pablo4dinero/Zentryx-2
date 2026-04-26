import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Star, Building2, Phone, Mail, MapPin, Edit2, Trash2,
  X, Check, Loader2, ChevronDown, Package, LayoutGrid, List, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const BASE = import.meta.env.BASE_URL;
function authH() { return { Authorization: `Bearer ${localStorage.getItem("rd_token")}`, "Content-Type": "application/json" }; }

const CATEGORIES = ["ingredients","packaging","equipment","services","logistics","other"];
const CURRENCIES = ["ngn","usd","eur","gbp"];
const STATUSES = [{ value: "active", label: "Active", cls: "text-emerald-400 bg-emerald-500/10" },{ value: "inactive", label: "Inactive", cls: "text-slate-400 bg-slate-500/10" },{ value: "blacklisted", label: "Blacklisted", cls: "text-red-400 bg-red-500/10" }];

function categoryLabel(c: string) { return c.charAt(0).toUpperCase() + c.slice(1); }
function statusMeta(s: string) { return STATUSES.find(x => x.value === s) ?? STATUSES[1]; }

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={cn("w-3 h-3", i <= rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

const EMPTY_FORM = {
  name: "", category: "ingredients", contactName: "", contactEmail: "", contactPhone: "",
  country: "", address: "", paymentTerms: "", currency: "ngn", rating: 3, status: "active", notes: "",
};

function VendorModal({ vendor, onClose, isLight }: { vendor?: any; onClose: () => void; isLight: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(vendor ? { ...vendor } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const isEdit = !!vendor;

  const inputCls = cn("w-full px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground",
    isLight ? "bg-slate-50 border-slate-200" : "bg-black/20 border-white/10");

  async function save() {
    setSaving(true);
    try {
      const url = isEdit ? `${BASE}api/procurement/vendors/${vendor.id}` : `${BASE}api/procurement/vendors`;
      const method = isEdit ? "PUT" : "POST";
      await fetch(url, { method, headers: authH(), body: JSON.stringify(form) });
      qc.invalidateQueries({ queryKey: ["/api/procurement/vendors"] });
      onClose();
    } finally { setSaving(false); }
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-2xl rounded-2xl border shadow-2xl z-10 max-h-[90vh] overflow-y-auto",
        isLight ? "bg-white border-slate-200" : "glass-panel border-white/10")}>
        <div className={cn("sticky top-0 px-6 py-4 border-b flex items-center justify-between z-10",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <h3 className="text-base font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> {isEdit ? "Edit Vendor" : "Add Vendor"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor Name *</label>
            <input className={inputCls} value={form.name} onChange={e => f("name", e.target.value)} placeholder="Vendor name…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
            <select className={cn(inputCls, "appearance-none")} value={form.category} onChange={e => f("category", e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
            <select className={cn(inputCls, "appearance-none")} value={form.status} onChange={e => f("status", e.target.value)}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Contact Name</label>
            <input className={inputCls} value={form.contactName} onChange={e => f("contactName", e.target.value)} placeholder="Contact person…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Contact Email</label>
            <input className={inputCls} type="email" value={form.contactEmail} onChange={e => f("contactEmail", e.target.value)} placeholder="email@vendor.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Contact Phone</label>
            <input className={inputCls} type="tel" value={form.contactPhone} onChange={e => f("contactPhone", e.target.value)} placeholder="+234…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Country</label>
            <input className={inputCls} value={form.country} onChange={e => f("country", e.target.value)} placeholder="Nigeria…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment Terms</label>
            <input className={inputCls} value={form.paymentTerms} onChange={e => f("paymentTerms", e.target.value)} placeholder="e.g. Net 30, COD, 50% upfront…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
            <select className={cn(inputCls, "appearance-none")} value={form.currency} onChange={e => f("currency", e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rating (1-5)</label>
            <div className="flex gap-2 items-center mt-1">
              {[1,2,3,4,5].map(i => (
                <button key={i} type="button" onClick={() => f("rating", i)}
                  className={cn("w-8 h-8 rounded-lg transition-colors text-sm font-medium",
                    form.rating >= i ? "bg-amber-400/20 text-amber-400 border border-amber-400/30" : isLight ? "bg-slate-100 text-slate-400" : "bg-white/5 text-muted-foreground")}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Address</label>
            <input className={inputCls} value={form.address} onChange={e => f("address", e.target.value)} placeholder="Vendor address…" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea rows={3} className={cn(inputCls, "resize-none")} value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Internal notes…" />
          </div>
        </div>
        <div className={cn("sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3",
          isLight ? "bg-white border-slate-100" : "bg-[#0f0f1a] border-white/10")}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving || !form.name}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isEdit ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VendorsTab() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"list"|"card">("list");
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<any>(null);

  const { data: vendors = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/procurement/vendors"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/procurement/vendors`, { headers: authH() });
      return r.json();
    },
  });

  const deleteVendor = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}api/procurement/vendors/${id}`, { method: "DELETE", headers: authH() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/procurement/vendors"] }),
  });

  const filtered = vendors.filter(v => {
    const matchSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.contactName?.toLowerCase().includes(search.toLowerCase()) || v.country?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || v.category === filterCat;
    const matchStatus = filterStatus === "all" || v.status === filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  const cardCls = cn("rounded-2xl border p-5 transition-all hover:shadow-lg",
    isLight ? "bg-white border-slate-200 hover:border-slate-300" : "glass-card border-white/10 hover:border-white/20");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className={cn("rounded-2xl border p-4 flex flex-wrap items-center gap-3",
        isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input placeholder="Search vendors…" value={search} onChange={e => setSearch(e.target.value)}
            className={cn("w-full pl-9 pr-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-primary/40",
              isLight ? "bg-slate-50 border-slate-200 text-foreground" : "bg-black/20 border-white/10 text-foreground")} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className={cn("text-xs rounded-xl border px-3 py-2 appearance-none focus:outline-none",
            isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className={cn("text-xs rounded-xl border px-3 py-2 appearance-none focus:outline-none",
            isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10 text-foreground")}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className={cn("flex rounded-xl border overflow-hidden", isLight ? "border-slate-200" : "border-white/10")}>
          {([["list", List], ["card", LayoutGrid]] as const).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cn("p-2 transition-colors", viewMode === mode ? "bg-primary text-white" : isLight ? "bg-white text-slate-500 hover:bg-slate-50" : "bg-transparent text-muted-foreground hover:bg-white/5")}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <button onClick={() => { setEditVendor(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90">
          <Plus className="w-3.5 h-3.5" /> Add Vendor
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => {
            const sm = statusMeta(v.status);
            return (
              <div key={v.id} className={cardCls}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{v.name}</h3>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", isLight ? "bg-primary/10 text-primary" : "bg-primary/10 text-primary")}>
                      {categoryLabel(v.category)}
                    </span>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sm.cls)}>{sm.label}</span>
                </div>
                <StarRating rating={v.rating} />
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {v.contactName && <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3" />{v.contactName}</div>}
                  {v.contactEmail && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{v.contactEmail}</div>}
                  {v.contactPhone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{v.contactPhone}</div>}
                  {v.country && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{v.country}</div>}
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{v.activePOs ?? 0} active POs</span>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditVendor(v); setShowModal(true); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => deleteVendor.mutate(v.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 py-16 text-center text-muted-foreground text-sm">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />No vendors found.
            </div>
          )}
        </div>
      ) : (
        <div className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200" : "glass-card border-white/10")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn("text-left border-b", isLight ? "border-slate-100 bg-slate-50" : "border-white/8 bg-white/2")}>
                  {["Vendor Name","Category","Country","Payment Terms","Rating","Active POs","Total Spend","Status","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />No vendors found.
                  </td></tr>
                ) : filtered.map(v => {
                  const sm = statusMeta(v.status);
                  return (
                    <tr key={v.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/3")}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div>{v.name}</div>
                        {v.contactName && <div className="text-xs text-muted-foreground">{v.contactName}</div>}
                      </td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-0.5 rounded-full", isLight ? "bg-slate-100 text-slate-600" : "bg-white/5 text-muted-foreground")}>{categoryLabel(v.category)}</span></td>
                      <td className="px-4 py-3 text-sm text-foreground">{v.country || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{v.paymentTerms || "—"}</td>
                      <td className="px-4 py-3"><StarRating rating={v.rating} /></td>
                      <td className="px-4 py-3 text-center text-sm">{v.activePOs ?? 0}</td>
                      <td className="px-4 py-3 text-sm font-mono">{v.totalSpend ? Number(v.totalSpend).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}</td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sm.cls)}>{sm.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditVendor(v); setShowModal(true); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteVendor.mutate(v.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showModal && <VendorModal vendor={editVendor} onClose={() => { setShowModal(false); setEditVendor(null); }} isLight={isLight} />}
    </div>
  );
}
