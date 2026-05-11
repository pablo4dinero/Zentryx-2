import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL;

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
};

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

const inputClass = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground";

export default function NewProductionOrdersPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(true);
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

  const { data: todayOrders = [], isLoading, error } = useQuery<TodayOrder[]>({
    queryKey: ["/api/production-orders/today"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/production-orders/today`, { headers: authHeaders() });
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
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders/today"] });
      setForm({ accountId: "", price: "", volume: "", expectedDeliveryDate: "", dateDelivered: "" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders/today"] });
    },
  });

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return todayOrders;
    return todayOrders.filter(order =>
      order.accountCompany?.toLowerCase().includes(term) ||
      order.productName?.toLowerCase().includes(term) ||
      order.dateOrdered?.toLowerCase().includes(term) ||
      order.expectedDeliveryDate?.toLowerCase().includes(term),
    );
  }, [todayOrders, search]);

  const totalIncome = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      const price = Number(order.price || 0);
      const volume = Number(order.volume || 0);
      return sum + price * volume;
    }, 0);
  }, [filteredOrders]);

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
      "Income ($)": ((Number(order.price || 0) * Number(order.volume || 0)).toFixed(2)),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Today Production Orders");
    XLSX.writeFile(wb, `today_production_orders_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const accountOptions = accounts.map(account => (
    <option key={account.id} value={account.id}>{account.company} — {account.productName}</option>
  ));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sales Force</p>
              <h1 className="text-2xl font-display font-bold text-foreground mt-2">New Production Orders</h1>
              <p className="mt-2 text-sm text-muted-foreground">Track new production orders created today across accounts.</p>
            </div>
            <button onClick={() => setShowForm(!showForm)}
              className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all", showForm ? "bg-white/10 text-foreground border border-white/10" : "bg-primary text-white")}> 
              {showForm ? "Hide new order" : "Add new order"}
            </button>
          </div>

          {showForm && (
            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Account</label>
                  <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                    className={cn(inputClass, accountsLoading ? "opacity-50 cursor-not-allowed" : "") } disabled={accountsLoading}>
                    <option value="">Select account</option>
                    {accountOptions}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Price ($/kg)</label>
                  <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    type="number" step="0.01" min="0" className={inputClass} placeholder="e.g. 58.50" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Volume (kg)</label>
                  <input value={form.volume} onChange={e => setForm(f => ({ ...f, volume: e.target.value }))}
                    type="number" step="0.01" min="0" className={inputClass} placeholder="e.g. 1200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Expected Delivery</label>
                  <input value={form.expectedDeliveryDate} onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
                    type="text" className={inputClass} placeholder="dd/mm/yyyy" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Date Ordered</label>
                  <input value={todayDMY()} disabled className={cn(inputClass, "bg-white/5 cursor-not-allowed")} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Date Delivered</label>
                  <input value={form.dateDelivered} onChange={e => setForm(f => ({ ...f, dateDelivered: e.target.value }))}
                    type="text" className={inputClass} placeholder="dd/mm/yyyy" />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <button onClick={addOrder} disabled={creating || !form.accountId || !form.price || !form.volume}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
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
              <p className="mt-2 text-2xl font-bold text-foreground">${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border border-white/5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Date</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{todayDMY()}</p>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by account, product, or date" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <button onClick={exportTable} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors">
            <Download className="w-4 h-4" /> Export Today Orders
          </button>
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Tips</p>
            <p>Use this page to capture orders that were placed today and keep the team on track.</p>
            <p className={isLight ? "text-slate-500" : "text-slate-400"}>If the order is removed, it also clears the account-level production order.</p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
        <div className="flex items-center justify-between px-5 py-4 bg-white/5 border-b border-white/5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Today’s Production Orders</p>
            <p className="text-sm text-muted-foreground mt-1">Showing orders created today across accounts.</p>
          </div>
          <p className="text-xs text-muted-foreground">Updated {todayOrders ? todayOrders.length : 0} orders</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">Loading today’s orders…</div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-red-400">Unable to load orders.</div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
            <p className="text-sm">No production orders were placed today.</p>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">Add order for today</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground bg-white/5 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Product</th>
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
                    <td className="px-4 py-3">${Number(order.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">{Number(order.volume || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">{order.dateOrdered || "—"}</td>
                    <td className="px-4 py-3">{order.expectedDeliveryDate || "—"}</td>
                    <td className="px-4 py-3">{order.dateDelivered || "—"}</td>
                    <td className="px-4 py-3 text-emerald-400">${(Number(order.price || 0) * Number(order.volume || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteMutation.mutate(order.id)}
                        className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
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
