import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { BarChart3, PieChart as PieIcon, List, Maximize2, Minimize2, X, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL;
const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];
const PRODUCT_TYPE_LABELS: Record<string, string> = {
  seasoning: "Seasoning", snacks_dusting: "Snacks Dusting", dairy_premix: "Dairy Premix",
  bakery_dough_premix: "Bakery & Dough Premix", sweet_flavours: "Sweet Flavours", savoury_flavour: "Savoury Flavour",
};
const VOLUME_BANDS = [
  { key: "very_high", label: "Very High (10k+)", color: "#ef4444", test: (v: number) => v >= 10000 },
  { key: "high", label: "High (1k–10k)", color: "#f59e0b", test: (v: number) => v >= 1000 && v < 10000 },
  { key: "medium", label: "Medium (500–1k)", color: "#10b981", test: (v: number) => v >= 500 && v < 1000 },
  { key: "low", label: "Low (<500)", color: "#06b6d4", test: (v: number) => v < 500 },
];

function FullScreenBtn({ full, setFull }: { full: boolean; setFull: (v: boolean) => void }) {
  return (
    <button onClick={() => setFull(!full)}
      className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
      {full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
    </button>
  );
}

function ChartCard({ title, children, height = 320 }: { title: string; children: (full: boolean) => React.ReactNode; height?: number }) {
  const [full, setFull] = useState(false);
  const { theme } = useTheme();
  const isL = theme === "light";

  return (
    <>
      <div className="glass-card rounded-2xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm">{title}</h3>
          <FullScreenBtn full={full} setFull={setFull} />
        </div>
        <div style={{ height }}>{children(false)}</div>
      </div>

      <AnimatePresence>
        {full && (
          <div className={`fixed inset-0 z-50 backdrop-blur-sm flex flex-col p-6 ${isL ? "bg-white/95" : "bg-black/90"}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              <button onClick={() => setFull(false)} className="p-2 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1">{children(true)}</div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

type ChartView = "bar" | "pie" | "list";

function ChartViewToggle({ view, setView }: { view: ChartView; setView: (v: ChartView) => void }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
      {([["bar", BarChart3], ["pie", PieIcon], ["list", List]] as [ChartView, any][]).map(([v, Icon]) => (
        <button key={v} onClick={() => setView(v)}
          className={cn("p-1.5 rounded-lg transition-all", view === v ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}>
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

function FlexChart({ data, nameKey, valueKey, label, onBarClick }: { data: any[]; nameKey: string; valueKey: string; label: string; onBarClick?: (name: string) => void }) {
  const [view, setView] = useState<ChartView>("bar");
  const [full, setFull] = useState(false);
  const { theme } = useTheme();
  const isL = theme === "light";
  const axisColor = isL ? "#374151" : "#64748b";
  const gridStroke = isL ? "#E5E7EB" : "rgba(255,255,255,0.05)";
  const tipStyle = { background: isL ? "#FFFFFF" : "#1e1e2e", border: isL ? "1px solid #E5E7EB" : "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: isL ? "#111827" : undefined };

  const handleChartClick = (d: any) => {
    if (onBarClick && d?.activePayload?.[0]?.payload?.[nameKey]) {
      onBarClick(d.activePayload[0].payload[nameKey]);
    }
  };

  const renderContent = (h: number) => (
    view === "bar" ? (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24, top: 4, bottom: 4 }}
          onClick={onBarClick ? handleChartClick : undefined}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} />
          <YAxis type="category" dataKey={nameKey} tick={{ fill: axisColor, fontSize: 11 }} width={140} />
          <Tooltip contentStyle={tipStyle} cursor={onBarClick ? { fill: isL ? "rgba(79,70,229,0.05)" : "rgba(139,92,246,0.1)" } : undefined} />
          <Bar dataKey={valueKey} fill="#8b5cf6" radius={[0, 6, 6, 0]} cursor={onBarClick ? "pointer" : undefined} />
        </BarChart>
      </ResponsiveContainer>
    ) : view === "pie" ? (
      <ResponsiveContainer width="100%" height={h}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={h * 0.3} label={({ name, value }) => `${name}: ${value}`} labelLine>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: isL ? "#374151" : undefined }} />
        </PieChart>
      </ResponsiveContainer>
    ) : (
      <div className="overflow-y-auto h-full custom-scrollbar">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="text-left text-xs text-muted-foreground px-2 py-1.5 font-medium">{nameKey}</th>
            <th className="text-right text-xs text-muted-foreground px-2 py-1.5 font-medium">{label}</th>
          </tr></thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className={`border-t border-white/5 ${onBarClick ? "cursor-pointer hover:bg-primary/5" : ""}`}
                onClick={onBarClick ? () => onBarClick(d[nameKey]) : undefined}>
                <td className="px-2 py-2 text-foreground text-sm">{d[nameKey]}</td>
                <td className="px-2 py-2 text-right font-semibold text-primary">{d[valueKey]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <>
      <div className="glass-card rounded-2xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm">{label}</h3>
          <div className="flex gap-2 items-center">
            <ChartViewToggle view={view} setView={setView} />
            <FullScreenBtn full={full} setFull={setFull} />
          </div>
        </div>
        <div style={{ height: 280 }}>{renderContent(280)}</div>
      </div>
      <AnimatePresence>
        {full && (
          <div className={`fixed inset-0 z-50 backdrop-blur-sm flex flex-col p-6 ${isL ? "bg-white/95" : "bg-black/90"}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">{label}</h2>
              <button onClick={() => setFull(false)} className="p-2 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-2 mb-4"><ChartViewToggle view={view} setView={setView} /></div>
            <div className="flex-1">{renderContent(600)}</div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function SalesChartsPage() {
  const [, navigate] = useLocation();
  const [companyExpand, setCompanyExpand] = useState<string | null>(null);
  const [volumeExpand, setVolumeExpand] = useState<string | null>(null);
  const [managerExpand, setManagerExpand] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const token = localStorage.getItem("rd_token");
      const res = await fetch(`${BASE}api/accounts`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
  });

  const acc = accounts as any[];

  const companyData = Object.entries(
    acc.reduce((m: any, a: any) => { m[a.company] = (m[a.company] || 0) + 1; return m; }, {})
  )
    .map(([company, count]) => ({ company, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 15);

  const managerData = Object.entries(
    acc.reduce((m: any, a: any) => {
      (a.accountManagerNames || []).forEach((n: string) => { m[n] = (m[n] || 0) + 1; });
      if (!a.accountManagerNames?.length) m["Unassigned"] = (m["Unassigned"] || 0) + 1;
      return m;
    }, {})
  ).map(([manager, count]) => ({ manager, count })).sort((a: any, b: any) => (b.count as number) - (a.count as number));

  const productTypeData = Object.entries(
    acc.reduce((m: any, a: any) => { m[a.productType] = (m[a.productType] || 0) + 1; return m; }, {})
  ).map(([type, count]) => ({ type: PRODUCT_TYPE_LABELS[type] || type, count }));

  const volumeBandData = VOLUME_BANDS.map(b => ({
    band: b.label,
    count: acc.filter(a => b.test(parseFloat(a.volume || 0))).length,
    color: b.color,
    key: b.key,
  }));

  const companyAccounts = companyExpand ? acc.filter(a => a.company === companyExpand) : [];
  const volumeAccounts = volumeExpand ? acc.filter(a => VOLUME_BANDS.find(b => b.key === volumeExpand)?.test(parseFloat(a.volume || 0))) : [];
  const managerAccounts = managerExpand && managerExpand !== "Unassigned"
    ? acc.filter(a => (a.accountManagerNames || []).includes(managerExpand))
    : managerExpand === "Unassigned"
    ? acc.filter(a => !a.accountManagerNames?.length)
    : [];

  const { theme: _ct } = useTheme();
  const isLC = _ct === "light";
  const axisColor = isLC ? "#374151" : "#64748b";
  const gridStrokeC = isLC ? "#E5E7EB" : "rgba(255,255,255,0.05)";
  const tipStyleC = { background: isLC ? "#FFFFFF" : "#1e1e2e", border: isLC ? "1px solid #E5E7EB" : "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: isLC ? "#111827" : undefined };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <ChartCard title="Accounts by Company (Top 15)" height={360}>
            {(full) => (
              <ResponsiveContainer width="100%" height={full ? "100%" : 360}>
                <BarChart data={companyData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                  onClick={(d: any) => { if (d?.activePayload?.[0]?.payload?.company) setCompanyExpand(d.activePayload[0].payload.company); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeC} />
                  <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="company" tick={{ fill: axisColor, fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={tipStyleC} cursor={{ fill: isLC ? "rgba(79,70,229,0.05)" : "rgba(139,92,246,0.1)" }} />
                  <Bar dataKey="count" name="Accounts" fill="#8b5cf6" radius={[0, 6, 6, 0]} cursor="pointer">
                    {companyData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          {companyExpand && (
            <div className="mt-3 glass-card rounded-xl p-4 border border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm text-foreground">{companyExpand} — Accounts</p>
                <button onClick={() => setCompanyExpand(null)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-1.5">
                {companyAccounts.map((a: any) => (
                  <button key={a.id} onClick={() => navigate(`/sales-force/${a.id}`)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-primary/10 border border-white/5 hover:border-primary/20 transition-all flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary">{a.productName}</p>
                      <p className="text-xs text-muted-foreground">{PRODUCT_TYPE_LABELS[a.productType]}</p>
                    </div>
                    <TrendingUp className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <FlexChart data={managerData} nameKey="manager" valueKey="count" label="Accounts by Account Manager"
            onBarClick={(name) => setManagerExpand(prev => prev === name ? null : name)} />
          {managerExpand && (
            <div className="mt-3 glass-card rounded-xl p-4 border border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm text-foreground">{managerExpand} — Accounts</p>
                <button onClick={() => setManagerExpand(null)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-1.5">
                {managerAccounts.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-2">No accounts found</p>
                  : managerAccounts.map((a: any) => (
                    <button key={a.id} onClick={() => navigate(`/sales-force/${a.id}`)}
                      className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-primary/10 border border-white/5 hover:border-primary/20 transition-all flex items-center justify-between group">
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-primary">{a.company} — {a.productName}</p>
                        <p className="text-xs text-muted-foreground">{PRODUCT_TYPE_LABELS[a.productType] || a.productType}</p>
                      </div>
                      <TrendingUp className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <FlexChart data={productTypeData} nameKey="type" valueKey="count" label="Accounts by Product Category" />

        <div>
          <div className="glass-card rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-sm">Accounts by Volume Band</h3>
            </div>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeBandData} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                  onClick={(d: any) => { if (d?.activePayload?.[0]?.payload?.key) setVolumeExpand(d.activePayload[0].payload.key); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeC} />
                  <XAxis dataKey="band" tick={{ fill: axisColor, fontSize: 10 }} />
                  <YAxis tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tipStyleC} cursor={{ fill: isLC ? "rgba(79,70,229,0.05)" : "rgba(139,92,246,0.1)" }} />
                  <Bar dataKey="count" name="Accounts" radius={[6, 6, 0, 0]} cursor="pointer">
                    {volumeBandData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {volumeExpand && (
            <div className="mt-3 glass-card rounded-xl p-4 border border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm text-foreground">
                  {VOLUME_BANDS.find(b => b.key === volumeExpand)?.label} — Accounts
                </p>
                <button onClick={() => setVolumeExpand(null)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-1.5">
                {volumeAccounts.map((a: any) => (
                  <button key={a.id} onClick={() => navigate(`/sales-force/${a.id}`)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-primary/10 border border-white/5 hover:border-primary/20 transition-all flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary">{a.company} — {a.productName}</p>
                      <p className="text-xs text-muted-foreground">{parseFloat(a.volume || 0).toLocaleString()} kg/mo</p>
                    </div>
                    <TrendingUp className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
