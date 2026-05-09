import { useState } from "react";
import { ShoppingCart, Building2, FileText, Package, BarChart3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import VendorsTab from "./VendorsTab";
import RequestsTab from "./RequestsTab";
import OrdersTab from "./OrdersTab";
import AnalyticsTab from "./AnalyticsTab";
import SalesForecastPage from "@/pages/sales-force/Forecast";

const TABS = [
  { id: "vendors", label: "Vendors", icon: Building2 },
  { id: "requests", label: "Purchase Requests", icon: FileText },
  { id: "orders", label: "Purchase Orders", icon: Package },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "forecast", label: "Sales Forecast", icon: TrendingUp },
] as const;
type TabId = typeof TABS[number]["id"];

export default function ProcurementPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [activeTab, setActiveTab] = useState<TabId>("vendors");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/15 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground">Procurement</h1>
              <p className="text-sm text-muted-foreground">Vendors, purchase requests, and orders</p>
            </div>
          </div>
        </div>
      </div>

      <div className={cn("rounded-2xl border p-1 flex overflow-x-auto gap-1 w-full",
        isLight ? "bg-slate-100/60 border-slate-200" : "glass-card border-white/10 bg-white/[0.03]")}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0",
                isActive
                  ? "bg-primary text-white shadow-md"
                  : isLight
                    ? "text-slate-600 hover:bg-white hover:text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}>
          {activeTab === "vendors" && <VendorsTab />}
          {activeTab === "requests" && <RequestsTab />}
          {activeTab === "orders" && <OrdersTab />}
          {activeTab === "analytics" && <AnalyticsTab />}
          {activeTab === "forecast" && <SalesForecastPage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}