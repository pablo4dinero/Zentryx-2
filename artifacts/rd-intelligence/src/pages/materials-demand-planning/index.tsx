import * as React from "react";
import SalesForecastPage from "@/pages/sales-force/Forecast";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Plus,
  Edit3,
  Trash2,
  Download,
  Search,
  Loader2,
  X,
  Maximize2,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useListUsers } from "@/api-client";
import { PlannedOrdersProvider, usePlannedOrders } from "./planned-orders-context";

const BASE = import.meta.env.BASE_URL;

const PRODUCT_TYPES = [
  { value: "seasoning", label: "Seasoning" },
  { value: "snacks_dusting", label: "Snacks Dusting" },
  { value: "dairy_premix", label: "Dairy Premix" },
  { value: "bakery_dough_premix", label: "Bakery & Dough Premix" },
  { value: "sweet_flavours", label: "Sweet Flavours" },
  { value: "savoury_flavour", label: "Savoury Flavour" },
];

const SF_URGENCY = [
  { value: "urgent", label: "Urgent", color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20",       dot: "bg-red-500" },
  { value: "medium", label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-500" },
  { value: "normal", label: "Normal", color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20",   dot: "bg-green-500" },
];

function UrgencyBadge({ level }: { level: string }) {
  const u = SF_URGENCY.find(x => x.value === level) || SF_URGENCY[2];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border", u.bg, u.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", u.dot)} />{u.label}
    </span>
  );
}

function VolumeTag({ volume }: { volume: string | null }) {
  const v = parseFloat(volume || "0");
  if (v >= 10000) return <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Very High</span>;
  if (v >= 1000)  return <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">High</span>;
  if (v >= 500)   return <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">Medium</span>;
  return <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Low</span>;
}

type Account = {
  id: number;
  company: string;
  productName: string | null;
  productType: string | null;
  urgencyLevel: string;
  volume: string | null;
  accountManagerNames: string[];
  contactPerson: string | null;
  cpPhone: string | null;
  cpEmail: string | null;
  customerType: string | null;
  application: string | null;
  targetPrice: string | null;
  competitorReference: string | null;
  accountManagers: number[];
  createdAt: string;
  updatedAt: string;
};

type ProductionOrder = {
  id: number;
  salesOrderId?: number;
  accountId?: number;
  accountName?: string;
  accountCompany?: string | null;
  productName?: string | null;
  productType?: string | null;
  volume?: number | string | null;
  rawMaterialStatus?: "Available" | "Not Available" | "Pending" | string;
  microbialAnalysis?: string | null;
  remarks?: string | null;
  orderStatus?: string | null;
  isPlanned?: boolean;
  expectedDeliveryDate?: string | null;
};

type SFOrder = {
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

type MergedOrder = ProductionOrder & {
  sfId: number;
  accountId: number;
  dateOrdered: string | null;
  expectedDeliveryDate: string | null;
  createdAt: string;
};

const DEFAULT_FORM = {
  company: "",
  productName: "",
  productType: "seasoning",
  customerType: "new",
  contactPerson: "",
  cpPhone: "",
  cpEmail: "",
  application: "",
  targetPrice: "",
  volume: "",
  urgencyLevel: "normal",
  competitorReference: "",
  accountManagers: [] as number[],
};

const STATUS_OPTIONS = ["Ordered", "Planned", "Produced", "Dispatched", "Delivered"] as const;
const MICROBIAL_OPTIONS = [
  { value: "Normal", label: "Normal", color: "bg-blue-500" },
  { value: "Important", label: "Important", color: "bg-emerald-500" },
  { value: "Critical", label: "Critical", color: "bg-red-500" },
];

function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = localStorage.getItem("rd_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getCurrentWeekLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - oneJan.getTime()) / 86400000) + 1;
  const week = Math.ceil((dayOfYear + oneJan.getDay()) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function downloadCsv(accounts: Account[]) {
  const headers = ["Company", "Product Name", "Product Type", "Urgency", "Volume", "Account Manager(s)", "Date Added"];
  const rows = accounts.map((a) => [
    a.company,
    a.productName ?? "-",
    PRODUCT_TYPES.find(p => p.value === a.productType)?.label ?? a.productType ?? "-",
    a.urgencyLevel,
    a.volume ?? "0",
    (a.accountManagerNames || []).join(", ") || "-",
    formatDate(a.createdAt),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `customer-products-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadProductionOrdersCsv(orders: ProductionOrder[]) {
  const headers = ["Order ID", "Account", "Product", "Product Type", "Volume (KG)", "Raw Material", "Microbial Analysis", "Remarks", "Status"];
  const rows = orders.map((order) => [
    order.id,
    order.accountName ?? order.accountCompany ?? "Unknown",
    order.productName ?? order.productType ?? "-",
    order.productType ?? "-",
    String(order.volume ?? "-"),
    order.rawMaterialStatus ?? "Pending",
    order.microbialAnalysis ?? "Normal",
    order.remarks ?? "",
    order.orderStatus ?? "Ordered",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadProductionOrdersXlsx(orders: ProductionOrder[]) {
  const worksheetData = [
    ["Order ID", "Account", "Product", "Product Type", "Volume (KG)", "Raw Material", "Microbial Analysis", "Remarks", "Status"],
    ...orders.map((order) => [
      order.id,
      order.accountName ?? order.accountCompany ?? "Unknown",
      order.productName ?? order.productType ?? "-",
      order.productType ?? "-",
      Number(order.volume ?? 0),
      order.rawMaterialStatus ?? "Pending",
      order.microbialAnalysis ?? "Normal",
      order.remarks ?? "",
      order.orderStatus ?? "Ordered",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ProductionOrders");
  XLSX.writeFile(workbook, `production-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

type ProductionHistoryView = "daily" | "weekly" | "monthly" | "yearly";

type ProducedOrder = {
  id: number;
  productionOrderId?: number | null;
  accountName: string;
  productName: string;
  productType: string;
  volume: number;
  producedAt: string;
  deliveryStatus: string;
  deliveredAt?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const formattedDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formattedDate} · ${formattedTime}`;
}

function formatHistoryFileDate(date: Date) {
  const formatted = date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  return formatted.toLowerCase().replace(/\s+/g, "-").replace(/,/g, "");
}

function getHistoryRangeLabel(view: ProductionHistoryView, now = new Date()) {
  const cutoff = new Date(now);

  switch (view) {
    case "weekly":
      cutoff.setDate(now.getDate() - 7);
      break;
    case "monthly":
      cutoff.setMonth(now.getMonth() - 1);
      break;
    case "yearly":
      cutoff.setFullYear(now.getFullYear() - 1);
      break;
    default:
      cutoff.setDate(now.getDate() - 1);
      break;
  }

  const startLabel = cutoff.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endLabel = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return view === "daily" ? endLabel : `${startLabel} – ${endLabel}`;
}

function getHistoryFileRange(view: ProductionHistoryView, now = new Date()) {
  const cutoff = new Date(now);

  switch (view) {
    case "weekly":
      cutoff.setDate(now.getDate() - 7);
      break;
    case "monthly":
      cutoff.setMonth(now.getMonth() - 1);
      break;
    case "yearly":
      cutoff.setFullYear(now.getFullYear() - 1);
      break;
    default:
      cutoff.setDate(now.getDate() - 1);
      break;
  }

  return `${formatHistoryFileDate(cutoff)}-${formatHistoryFileDate(now)}`;
}

function downloadProductionHistoryCsv(records: ProducedOrder[], view: ProductionHistoryView) {
  const headers = ["Account/Product", "Product Type", "Volume (KG)", "Produced At", "Delivery Status"];
  const rows = records.map((record) => [
    `${record.accountName} | ${record.productName}`,
    record.productType,
    String(record.volume),
    formatDateTime(record.producedAt),
    record.deliveryStatus,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production_history_${view}_${getHistoryFileRange(view)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadProductionHistoryXlsx(records: ProducedOrder[], view: ProductionHistoryView) {
  const worksheetData = [
    ["Account/Product", "Product Type", "Volume (KG)", "Produced At", "Delivery Status"],
    ...records.map((record) => [
      `${record.accountName} | ${record.productName}`,
      record.productType,
      record.volume,
      formatDateTime(record.producedAt),
      record.deliveryStatus,
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ProductionHistory");
  XLSX.writeFile(workbook, `production_history_${view}_${getHistoryFileRange(view)}.xlsx`);
}

function getRawMaterialStatus(order: ProductionOrder) {
  if (order.rawMaterialStatus) {
    return order.rawMaterialStatus;
  }
  return order.orderStatus === "Planned" || order.orderStatus === "Produced" || order.orderStatus === "Delivered"
    ? "Available"
    : "Pending";
}

function getStatusBadgeVariant(status?: string) {
  switch (status) {
    case "Planned":
      return "warning";
    case "Produced":
      return "success";
    case "Dispatched":
      return "info";
    case "Delivered":
      return "secondary";
    default:
      return "default";
  }
}

function getStatusClasses(status?: string) {
  switch (status) {
    case "Planned":
      return "bg-amber-500/10 text-amber-300 border border-amber-500/20";
    case "Produced":
      return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20";
    case "Dispatched":
      return "bg-sky-500/10 text-sky-300 border border-sky-500/20";
    case "Delivered":
      return "bg-green-500/10 text-green-200 border border-green-500/20";
    default:
      return "bg-slate-500/10 text-slate-200 border border-slate-500/20";
  }
}

function getMicrobialColor(value?: string) {
  switch (value) {
    case "Important":
      return "bg-emerald-500";
    case "Critical":
      return "bg-red-500";
    default:
      return "bg-blue-500";
  }
}

function getOrderAccountText(order: ProductionOrder) {
  return order.accountName ?? order.accountCompany ?? `Account ${order.accountId ?? order.id}`;
}

function getOrderProductText(order: ProductionOrder) {
  return order.productName ?? order.productType ?? "Unknown product";
}

type WorkingWeek = {
  weekLabel: string;
  weekNumber: number;
  days: Date[];
  startDate: Date;
  endDate: Date;
};

type ProductionFloor = {
  id: number;
  floorName: string;
  blendCategory: "Sweet" | "Savory" | "Sweet/Savory" | "Savory/Sweet";
  maxCapacityKg: number;
};

type FloorAssignmentRow = {
  assignment: {
    id: number;
    floorId: number;
    productionOrderId: number;
    weekLabel: string;
    assignedDay: string;
    planStatus: string;
  };
  floor: ProductionFloor;
  order: ProductionOrder;
};

type FloorAssignmentPayload = {
  floor_id: number;
  production_order_id: number;
  week_label: string;
  assigned_day: string;
};

function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWorkingWeeksForMonth(year: number, month: number): WorkingWeek[] {
  const weeks: WorkingWeek[] = [];
  const firstOfMonth = new Date(year, month, 1);
  let firstMonday = new Date(firstOfMonth);

  while (firstMonday.getMonth() === month && firstMonday.getDay() !== 1) {
    firstMonday.setDate(firstMonday.getDate() + 1);
  }

  if (firstMonday.getMonth() !== month || firstMonday.getDay() !== 1) {
    return weeks;
  }

  let weekNumber = 1;
  let currentStart = new Date(firstMonday);

  while (currentStart.getMonth() === month) {
    const days = Array.from({ length: 5 }, (_, index) => {
      const day = new Date(currentStart);
      day.setDate(day.getDate() + index);
      return day;
    });
    const endDate = new Date(currentStart);
    endDate.setDate(endDate.getDate() + 4);
    const formattedStart = currentStart.toLocaleDateString(undefined, {
      weekday: "short",
      month: "long",
      day: "numeric",
    });
    const formattedEnd = endDate.toLocaleDateString(undefined, {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    weeks.push({
      weekLabel: `Week ${weekNumber}: ${formattedStart} – ${formattedEnd}`,
      weekNumber,
      days,
      startDate: new Date(currentStart),
      endDate,
    });
    weekNumber += 1;
    currentStart = new Date(currentStart);
    currentStart.setDate(currentStart.getDate() + 7);
  }

  return weeks;
}

function getMicrobialPriority(value?: string | null) {
  switch (value) {
    case "Critical":
      return 0;
    case "Important":
      return 1;
    default:
      return 2;
  }
}

function isAssignEligibleForFloor(order: ProductionOrder, blendCategory: ProductionFloor["blendCategory"]) {
  const type = String(order.productType ?? "").toLowerCase();
  if (blendCategory === "Savory") {
    return type.includes("seasoning") || type.includes("savoury flavours") || type.includes("savoury flavours");
  }
  return true;
}

function getOrderCategory(order: ProductionOrder) {
  const type = String(order.productType ?? "").toLowerCase();
  if (type.includes("dairy premix")) return "Dairy Premix";
  if (type.includes("bread premix")) return "Bread Premix";
  if (type.includes("seasoning")) return "Seasoning";
  if (type.includes("savoury flavours") || type.includes("savory flavours")) return "Savoury Flavours";
  return "Other";
}

function buildOptimizedAssignments(
  floors: ProductionFloor[],
  unassignedOrders: ProductionOrder[],
  weekLabel: string,
  includeSat = false
): FloorAssignmentPayload[] {
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", ...(includeSat ? ["Sat"] : [])];

  const eligibleOrders = unassignedOrders
    .filter((order) => order.rawMaterialStatus !== "Not Available")
    .slice()
    .sort((a, b) => {
      const priority = getMicrobialPriority(a.microbialAnalysis) - getMicrobialPriority(b.microbialAnalysis);
      if (priority !== 0) return priority;
      return Number(b.volume ?? 0) - Number(a.volume ?? 0);
    });

  const assignments: FloorAssignmentPayload[] = [];

  const dayUsageByFloor: Record<number, Record<string, number>> = {};
  const dayTypesByFloor: Record<number, Record<string, string[]>> = {};
  for (const floor of floors) {
    dayUsageByFloor[floor.id] = Object.fromEntries(dayNames.map(d => [d, 0]));
    dayTypesByFloor[floor.id] = Object.fromEntries(dayNames.map(d => [d, [] as string[]]));
  }

  const preferredDayForOrder = (order: ProductionOrder): string[] => {
    const m = order.microbialAnalysis;
    if (m === "Critical") return dayNames;
    if (m === "Important") return [...dayNames.slice(1), dayNames[0]];
    return [...dayNames.slice(3), ...dayNames.slice(0, 3)];
  };

  const canAssign = (floor: ProductionFloor, day: string, order: ProductionOrder): boolean => {
    if (!isAssignEligibleForFloor(order, floor.blendCategory)) return false;
    const cat = getOrderCategory(order);
    const existing = dayTypesByFloor[floor.id][day];
    if (cat === "Seasoning" && existing.includes("Dairy Premix")) return false;
    if (cat === "Dairy Premix" && existing.includes("Seasoning")) return false;
    return (dayUsageByFloor[floor.id][day] + Number(order.volume ?? 0)) <= floor.maxCapacityKg;
  };

  for (const order of eligibleOrders) {
    let placed = false;
    for (const floor of floors) {
      const days = preferredDayForOrder(order);
      for (const day of days) {
        if (canAssign(floor, day, order)) {
          dayUsageByFloor[floor.id][day] += Number(order.volume ?? 0);
          dayTypesByFloor[floor.id][day].push(getOrderCategory(order));
          assignments.push({
            floor_id: floor.id,
            production_order_id: order.id,
            week_label: weekLabel,
            assigned_day: day,
          });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  return assignments;
}

function ProductionOrdersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { addPlannedOrder, removePlannedOrder, isPlanningOrder } = usePlannedOrders();
  const [searchOrders, setSearchOrders] = React.useState("");
  const [ordersViewMode, setOrdersViewMode] = React.useState<"daily" | "weekly" | "monthly">("weekly");
  const [microbialById, setMicrobialById] = React.useState<Record<number, string>>({});
  const [rawMaterialById, setRawMaterialById] = React.useState<Record<number, string>>({});
  const [isNewOrderOpen, setIsNewOrderOpen] = React.useState(false);
  const [newOrderForm, setNewOrderForm] = React.useState({
    accountId: "", volume: "", price: "", expectedDeliveryDate: "",
    rawMaterialStatus: "Pending", microbialAnalysis: "Normal",
  });

  const accountsForOrderQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json() as Promise<{id: number; company: string; productName: string | null; productType: string | null}[]>;
    },
    staleTime: 1000 * 60 * 5,
  });
  const orderAccounts = accountsForOrderQuery.data ?? [];

  const accountTypeMap = React.useMemo(() => {
    const map: Record<number, string | null> = {};
    orderAccounts.forEach(a => { map[a.id] = a.productType; });
    return map;
  }, [orderAccounts]);

  const mdpOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load production orders");
      }
      return res.json() as Promise<ProductionOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
  }) as UseQueryResult<ProductionOrder[], Error>;

  const mdpOrderBySalesId = React.useMemo(() => {
    const map: Record<number, ProductionOrder> = {};
    (mdpOrdersQuery.data ?? []).forEach(o => {
      if (o.salesOrderId != null) map[o.salesOrderId] = o;
    });
    return map;
  }, [mdpOrdersQuery.data]);

  const sfOrdersQuery = useQuery({
    queryKey: ["/api/production-orders", ordersViewMode],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/production-orders?period=${ordersViewMode}`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load orders");
      }
      return res.json() as Promise<SFOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
  });

  const mergedOrders = React.useMemo((): MergedOrder[] => {
    const sfOrders = sfOrdersQuery.data ?? [];
    return sfOrders
      .map(sf => {
        const mdpOrder = mdpOrderBySalesId[sf.id];
        if (!mdpOrder) return null;
        return {
          ...mdpOrder,
          sfId: sf.id,
          accountId: sf.accountId,
          accountCompany: sf.accountCompany,
          productName: sf.productName,
          volume: sf.volume,
          productType: mdpOrder.productType ?? accountTypeMap[sf.accountId] ?? null,
          dateOrdered: sf.dateOrdered,
          expectedDeliveryDate: sf.expectedDeliveryDate,
          createdAt: sf.createdAt,
        } as MergedOrder;
      })
      .filter((o): o is MergedOrder => o !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sfOrdersQuery.data, mdpOrderBySalesId, accountTypeMap]);

  const ordersLoading = sfOrdersQuery.isLoading || mdpOrdersQuery.isLoading;

  React.useEffect(() => {
    if (!mergedOrders.length) return;
    setMicrobialById((current) => {
      const next = { ...current };
      mergedOrders.forEach((order) => {
        if (!(order.id in next)) next[order.id] = order.microbialAnalysis ?? "Normal";
      });
      return next;
    });
    setRawMaterialById((current) => {
      const next = { ...current };
      mergedOrders.forEach((order) => {
        if (!(order.id in next)) next[order.id] = order.rawMaterialStatus ?? "Pending";
      });
      return next;
    });
    mergedOrders.forEach((order) => {
      if (order.isPlanned) addPlannedOrder(order.id);
    });
  }, [mergedOrders, addPlannedOrder]);

  const productionUpdate = useMutation({
    mutationFn: async ({ orderId, changes }: { orderId: number; changes: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}api/mdp/production-orders/${orderId}`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify(changes),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to create order"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-orders"] });
      setIsNewOrderOpen(false);
      setNewOrderForm({ accountId: "", volume: "", price: "", expectedDeliveryDate: "", rawMaterialStatus: "Pending", microbialAnalysis: "Normal" });
      toast({ title: "Order created" });
    },
    onError: (error: any) => toast({ title: "Could not create order", description: error?.message, variant: "destructive" }),
  });

  const handleChangeMicrobial = async (orderId: number, value: string) => {
    setMicrobialById(c => ({ ...c, [orderId]: value }));
    try { await productionUpdate.mutateAsync({ orderId, changes: { microbialAnalysis: value } }); }
    catch { toast({ title: "Could not save", variant: "destructive" }); }
  };

  const handleChangeRawMaterial = async (orderId: number, value: string) => {
    setRawMaterialById(c => ({ ...c, [orderId]: value }));
    try { await productionUpdate.mutateAsync({ orderId, changes: { rawMaterialStatus: value } }); }
    catch { toast({ title: "Could not save", variant: "destructive" }); }
  };

  const handlePlanNow = async (orderId: number) => {
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: "Planned", isPlanned: true } });
      addPlannedOrder(orderId);
      toast({ title: "Order planned", description: "Now visible in Production Planning → Planned Orders." });
    } catch (error: any) {
      toast({ title: "Could not plan order", description: error?.message, variant: "destructive" });
    }
  };

  const handleUnplan = async (orderId: number) => {
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: "Ordered", isPlanned: false } });
      removePlannedOrder(orderId);
      toast({ title: "Order unplanned" });
    } catch (error: any) {
      toast({ title: "Could not unplan", description: error?.message, variant: "destructive" });
    }
  };

  const tableOrders = React.useMemo(() => {
    const term = searchOrders.trim().toLowerCase();
    return mergedOrders.filter((order) => {
      if (!term) return true;
      return [order.accountCompany ?? "", order.productName ?? "", order.productType ?? "", String(order.volume ?? ""), order.dateOrdered ?? ""]
        .join(" ").toLowerCase().includes(term);
    });
  }, [mergedOrders, searchOrders]);

  if (ordersLoading) return <PageLoader />;

  const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
  const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">New Production Orders</h2>
          <p className="text-sm text-muted-foreground">Manage production orders, raw material availability and microbial analysis.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {(["daily", "weekly", "monthly"] as const).map(mode => (
              <button key={mode} onClick={() => setOrdersViewMode(mode)}
                className={cn("rounded-full px-4 py-1.5 text-xs font-semibold transition duration-150",
                  ordersViewMode === mode ? "bg-primary text-white" : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-white/5 text-muted-foreground hover:bg-white/10")}>
                {mode === "daily" ? "Daily" : mode === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadProductionOrdersCsv(tableOrders)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20")}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => downloadProductionOrdersXlsx(tableOrders)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20")}>
            <Download className="w-4 h-4" /> Export XLSX
          </button>
          <button onClick={() => setIsNewOrderOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> New Production Order
          </button>
        </div>
      </div>

      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={searchOrders} onChange={e => setSearchOrders(e.target.value)} placeholder="Search orders..." className={cn("h-9 pl-9 pr-4 rounded-xl border text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/50", isLight ? "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground")} />
      </div>

      <div className={cn("glass-card rounded-2xl overflow-x-auto border", isLight ? "border-slate-200 bg-white" : "border-white/5 bg-white/5")}>
        <table className="w-full text-sm">
          <thead className={cn("text-xs text-muted-foreground border-b", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/5")}>
            <tr>
              <th className="px-4 py-3 text-left font-medium">Account</th>
              <th className="px-4 py-3 text-left font-medium">Product Type</th>
              <th className="px-4 py-3 text-right font-medium">Volume (KG)</th>
              <th className="px-4 py-3 text-left font-medium">Order</th>
              <th className="px-4 py-3 text-left font-medium">Expected</th>
              <th className="px-4 py-3 text-left font-medium">Raw Material</th>
              <th className="px-4 py-3 text-left font-medium">Microbial Analysis</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableOrders.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No production orders found.</td></tr>
            ) : (
              tableOrders.map((order) => {
                const microbial = microbialById[order.id] ?? order.microbialAnalysis ?? "Normal";
                const rawMaterial = rawMaterialById[order.id] ?? order.rawMaterialStatus ?? "Pending";
                const planned = order.isPlanned || isPlanningOrder(order.id);
                return (
                  <tr key={order.sfId ?? order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50/70" : "border-white/5 hover:bg-white/[0.03]")}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground text-sm">{order.accountCompany ?? "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{order.productName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {PRODUCT_TYPES.find(p => p.value === order.productType)?.label ?? order.productType ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-sm">{Number(order.volume ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{order.dateOrdered ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{order.expectedDeliveryDate ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select value={rawMaterial} onChange={e => handleChangeRawMaterial(order.id, e.target.value)}
                        className={cn("rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                          rawMaterial === "Available" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          rawMaterial === "Not Available" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        )}>
                        <option value="Available" className="bg-black text-white">Available</option>
                        <option value="Not Available" className="bg-black text-white">Not Available</option>
                        <option value="Pending" className="bg-black text-white">Pending</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", getMicrobialColor(microbial))} />
                        <select value={microbial} onChange={e => handleChangeMicrobial(order.id, e.target.value)}
                          className={cn("rounded-xl border px-2 py-1 text-xs focus:outline-none cursor-pointer",
                            microbial === "Critical" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                            microbial === "Important" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/10 text-foreground"
                          )}>
                          {MICROBIAL_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-black text-white">{opt.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => planned ? handleUnplan(order.id) : handlePlanNow(order.id)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap",
                          planned
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                            : isLight ? "border-slate-200 text-slate-700 hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
                              : "border-white/10 text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
                        )}>
                        {planned ? "✓ Un-plan" : "Plan Now"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className={cn("px-4 py-2.5 text-xs text-muted-foreground border-t", isLight ? "border-slate-100" : "border-white/5")}>
          Showing {tableOrders.length} of {mergedOrders.length} production orders
        </div>
      </div>

      {/* ── New Production Order Modal ── */}
      <AnimatePresence>
        {isNewOrderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn("border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                <div>
                  <h2 className="text-lg font-bold text-foreground">New Production Order</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a production order from an existing account</p>
                </div>
                <button onClick={() => setIsNewOrderOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className={lCls}>Account *</label>
                  <select value={newOrderForm.accountId} onChange={e => setNewOrderForm(p => ({ ...p, accountId: e.target.value }))} className={iCls + " cursor-pointer"}>
                    <option value="" className="bg-black text-white">Select account…</option>
                    {orderAccounts.map(a => (
                      <option key={a.id} value={a.id} className="bg-black text-white">
                        {a.company}{a.productName ? ` — ${a.productName}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lCls}>Volume (kg) *</label>
                    <input value={newOrderForm.volume} onChange={e => setNewOrderForm(p => ({ ...p, volume: e.target.value }))} placeholder="0" type="number" min="0" className={iCls} />
                  </div>
                  <div>
                    <label className={lCls}>Price ($/kg)</label>
                    <input value={newOrderForm.price} onChange={e => setNewOrderForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                  </div>
                </div>
                <div>
                  <label className={lCls}>Expected Delivery Date</label>
                  <input value={newOrderForm.expectedDeliveryDate} onChange={e => setNewOrderForm(p => ({ ...p, expectedDeliveryDate: e.target.value }))} type="date" className={iCls} />
                </div>
                <div>
                  <label className={lCls}>Raw Material Status</label>
                  <select value={newOrderForm.rawMaterialStatus} onChange={e => setNewOrderForm(p => ({ ...p, rawMaterialStatus: e.target.value }))} className={iCls + " cursor-pointer"}>
                    <option value="Available" className="bg-black text-white">Available</option>
                    <option value="Not Available" className="bg-black text-white">Not Available</option>
                    <option value="Pending" className="bg-black text-white">Pending</option>
                  </select>
                </div>
                <div>
                  <label className={lCls}>Microbial Analysis</label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {MICROBIAL_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setNewOrderForm(p => ({ ...p, microbialAnalysis: opt.value }))}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                          newOrderForm.microbialAnalysis === opt.value
                            ? opt.value === "Critical" ? "bg-red-500/10 border-red-500/20 text-red-400"
                              : opt.value === "Important" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                            : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20"
                        )}>
                        <span className={cn("w-2 h-2 rounded-full", opt.color)} />{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                <button onClick={() => {
                    if (!newOrderForm.accountId || !newOrderForm.volume) {
                      toast({ title: "Account and Volume are required", variant: "destructive" }); return;
                    }
                    createOrderMutation.mutate({
                      accountId: Number(newOrderForm.accountId),
                      volume: Number(newOrderForm.volume),
                      price: newOrderForm.price || null,
                      expectedDeliveryDate: newOrderForm.expectedDeliveryDate || null,
                      rawMaterialStatus: newOrderForm.rawMaterialStatus,
                      microbialAnalysis: newOrderForm.microbialAnalysis,
                      orderStatus: "Ordered",
                      isPlanned: false,
                    });
                  }}
                  disabled={createOrderMutation.status === "pending"}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                  {createOrderMutation.status === "pending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {createOrderMutation.status === "pending" ? "Creating…" : "Create Order"}
                </button>
                <button onClick={() => setIsNewOrderOpen(false)} className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

type PlanningViewMode = "weekly" | "daily";

function ProductionPlanningTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [selectedWeekLabel, setSelectedWeekLabel] = React.useState("");
  const [splitPercent, setSplitPercent] = React.useState(55);
  const [isDividerDragging, setIsDividerDragging] = React.useState(false);
  const [floorModalOpen, setFloorModalOpen] = React.useState(false);
  const [floorForm, setFloorForm] = React.useState({
    floorName: "",
    blendCategory: "Sweet" as ProductionFloor["blendCategory"],
    maxCapacityKg: "0",
  });
  const [editFloorOpen, setEditFloorOpen] = React.useState(false);
  const [editingFloor, setEditingFloor] = React.useState<ProductionFloor | null>(null);
  const [editFloorForm, setEditFloorForm] = React.useState({ floorName: "", blendCategory: "Sweet" as ProductionFloor["blendCategory"], maxCapacityKg: "0" });
  const [deleteConfirmFloorId, setDeleteConfirmFloorId] = React.useState<number | null>(null);
  const [includeSaturday, setIncludeSaturday] = React.useState(false);
  const [planningView, setPlanningView] = React.useState<PlanningViewMode>("weekly");
  const [assistedState, setAssistedState] = React.useState<"idle" | "optimizing" | "done">("idle");
  const [printOpen, setPrintOpen] = React.useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = React.useState(false);

  const handlePrint = React.useCallback(() => {
    const style = document.createElement("style");
    style.id = "zentryx-print-override";
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 1cm; }
        body * { visibility: hidden !important; }
        #print-schedule, #print-schedule * { visibility: visible !important; }
        #print-schedule {
          position: fixed !important; inset: 0 !important;
          width: 100% !important; background: white !important;
          overflow: visible !important; z-index: 99999 !important;
        }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => { document.getElementById("zentryx-print-override")?.remove(); }, 1500);
  }, []);

  const handleDownloadPdf = React.useCallback(async () => {
    const el = document.getElementById("print-schedule");
    if (!el) return;
    setIsPdfGenerating(true);
    try {
      // Clone outside the dialog so overflow:hidden doesn't clip the capture
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.cssText = "position:absolute;top:0;left:-9999px;width:794px;background:white;";
      document.body.appendChild(clone);
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: clone.offsetWidth,
        height: clone.scrollHeight,
        windowWidth: clone.offsetWidth,
      });
      document.body.removeChild(clone);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let yOffset = 0;
      let page = 0;
      while (yOffset < imgHeight) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgWidth, imgHeight);
        yOffset += pageHeight;
        page++;
      }
      pdf.save(`Production-Schedule-${selectedWeekLabel.replace(/[\s:]/g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setIsPdfGenerating(false);
    }
  }, [selectedWeekLabel]);
  const [expandedDay, setExpandedDay] = React.useState<string | null>(null);
  const [dragged, setDragged] = React.useState<{
    type: "planned" | "assigned";
    productionOrderId: number;
    assignmentId?: number;
    floorId?: number;
  } | null>(null);
  const [localFloorOrder, setLocalFloorOrder] = React.useState<Record<number, number[]>>({});
  const [dragOverFloorId, setDragOverFloorId] = React.useState<number | null>(null);

  const now = React.useMemo(() => new Date(), []);
  const weeks = React.useMemo(() => getWorkingWeeksForMonth(now.getFullYear(), now.getMonth()), [now]);
  const defaultWeekLabel = React.useMemo(() => {
    return (
      weeks.find((week) => week.days.some((day) => sameDate(day, now)))?.weekLabel ?? weeks[0]?.weekLabel ?? ""
    );
  }, [now, weeks]);

  const selectedWeek = React.useMemo(
    () => weeks.find(w => w.weekLabel === selectedWeekLabel) ?? null,
    [weeks, selectedWeekLabel]
  );

  React.useEffect(() => {
    if (!selectedWeekLabel && defaultWeekLabel) {
      setSelectedWeekLabel(defaultWeekLabel);
    }
  }, [defaultWeekLabel, selectedWeekLabel]);

  const floorsQuery = useQuery({
    queryKey: ["/api/mdp/production-floors"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-floors`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load production floors");
      }
      return res.json() as Promise<ProductionFloor[]>;
    },
    staleTime: 1000 * 60 * 2,
  }) as UseQueryResult<ProductionFloor[], Error>;

  const assignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments", selectedWeekLabel],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments?week=${encodeURIComponent(selectedWeekLabel)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load floor assignments");
      }
      return res.json() as Promise<FloorAssignmentRow[]>;
    },
    enabled: !!selectedWeekLabel,
    staleTime: 1000 * 60 * 1,
  }) as UseQueryResult<FloorAssignmentRow[], Error>;

  const productionOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load production orders");
      }
      return res.json() as Promise<ProductionOrder[]>;
    },
    staleTime: 1000 * 60 * 2,
  }) as UseQueryResult<ProductionOrder[], Error>;

  const planningAccountsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json() as Promise<{id: number; company: string; productName: string | null; productType: string | null}[]>;
    },
    staleTime: 1000 * 60 * 5,
  });

  const planningAccountMap = React.useMemo(() => {
    const map: Record<number, {company: string; productName: string | null; productType: string | null}> = {};
    (planningAccountsQuery.data ?? []).forEach(a => { map[a.id] = { company: a.company, productName: a.productName, productType: a.productType }; });
    return map;
  }, [planningAccountsQuery.data]);

  const floors = floorsQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const plannedOrders = React.useMemo(
    () => (productionOrdersQuery.data ?? []).filter((order) => order.isPlanned),
    [productionOrdersQuery.data]
  );

  const assignmentsByFloor = React.useMemo(() => {
    const map = new Map<number, FloorAssignmentRow[]>();
    assignments.forEach((row) => {
      const floorId = row.floor.id;
      if (!map.has(floorId)) {
        map.set(floorId, []);
      }
      map.get(floorId)!.push(row);
    });
    return map;
  }, [assignments]);

  React.useEffect(() => {
    const next: Record<number, number[]> = {};
    assignmentsByFloor.forEach((rows, floorId) => {
      next[floorId] = rows.map((row) => row.assignment.id);
    });
    setLocalFloorOrder(next);
  }, [assignmentsByFloor]);

  const assignedMap = React.useMemo(() => {
    const map = new Map<number, FloorAssignmentRow>();
    assignments.forEach((row) => {
      map.set(row.assignment.productionOrderId, row);
    });
    return map;
  }, [assignments]);

  const floorOrder = (floorId: number) => {
    const rows = assignmentsByFloor.get(floorId) ?? [];
    const orderIds = localFloorOrder[floorId];
    if (!orderIds) return rows;
    const byId = new Map(rows.map((row) => [row.assignment.id, row]));
    return orderIds.map((id) => byId.get(id)).filter(Boolean) as FloorAssignmentRow[];
  };

  const createFloorMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/production-floors`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to create production floor"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-floors"] });
      setFloorModalOpen(false);
      setFloorForm({ floorName: "", blendCategory: "Sweet", maxCapacityKg: "0" });
      toast({ title: "Floor added" });
    },
    onError: (error: any) => toast({ title: "Could not add floor", description: error?.message, variant: "destructive" }),
  });

  const updateFloorMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/production-floors/${id}`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to update floor"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-floors"] });
      setEditFloorOpen(false);
      setEditingFloor(null);
      toast({ title: "Floor updated" });
    },
    onError: (error: any) => toast({ title: "Could not update floor", description: error?.message, variant: "destructive" }),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/production-floors/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to delete floor"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-floors"] });
      setDeleteConfirmFloorId(null);
      toast({ title: "Floor deleted" });
    },
    onError: (error: any) => toast({ title: "Could not delete floor", description: error?.message, variant: "destructive" }),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to assign order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments", selectedWeekLabel] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to remove assignment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments", selectedWeekLabel] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
    },
  });

  const produceAssignmentMutation = useMutation({
    mutationFn: async ({ assignmentId, orderId, accountName, productName, productType, volume, floorId: fId }: {
      assignmentId: number; orderId: number;
      accountName: string; productName: string; productType: string; volume: number; floorId?: number;
    }) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments/${assignmentId}/produce`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to mark assignment produced");
      }
      await fetch(`${BASE}api/mdp/produced-orders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          productionOrderId: orderId,
          accountName,
          productName,
          productType,
          volume,
          floorId: fId ?? null,
          producedAt: new Date().toISOString(),
        }),
      });
      await fetch(`${BASE}api/mdp/production-orders/${orderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ isProduced: true, orderStatus: "Produced" }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments", selectedWeekLabel] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
    },
  });

  const handleDividerMouseMove = React.useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      const container = document.getElementById("planning-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const percent = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(72, Math.max(28, percent)));
    },
    [setSplitPercent]
  );

  React.useEffect(() => {
    if (!isDividerDragging) return;
    window.addEventListener("mousemove", handleDividerMouseMove);
    window.addEventListener("mouseup", () => setIsDividerDragging(false), { once: true });
    return () => {
      window.removeEventListener("mousemove", handleDividerMouseMove);
    };
  }, [handleDividerMouseMove, isDividerDragging]);

  const getFloorUsage = (floorId: number) => {
    const rows = assignmentsByFloor.get(floorId) ?? [];
    return rows.reduce((sum, row) => sum + Number(row.order.volume ?? 0), 0);
  };

  const getAvailableDay = (floor: ProductionFloor, currentAssignments: FloorAssignmentRow[], volume: number) => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const usage = days.reduce<Record<string, number>>((acc, day) => {
      acc[day] = 0;
      return acc;
    }, {} as Record<string, number>);

    currentAssignments.forEach((row) => {
      if (row.assignment.assignedDay && typeof usage[row.assignment.assignedDay] === "number") {
        usage[row.assignment.assignedDay] += Number(row.order.volume ?? 0);
      }
    });

    return days.find((day) => usage[day] + volume <= floor.maxCapacityKg) ?? days[0];
  };

  const onCreateAssignment = async (floor: ProductionFloor, order: ProductionOrder) => {
    const rows = assignmentsByFloor.get(floor.id) ?? [];
    const assignedDay = getAvailableDay(floor, rows, Number(order.volume ?? 0));
    await createAssignmentMutation.mutateAsync({
      floorId: floor.id,
      productionOrderId: order.id,
      weekLabel: selectedWeekLabel,
      assignedDay,
      planStatus: "Planned",
    });
    toast({ title: "Order assigned", description: `${order.productType ?? "Order"} assigned to ${floor.floorName}.` });
  };

  const handleAddFloor = () => {
    createFloorMutation.mutate({
      floorName: floorForm.floorName,
      blendCategory: floorForm.blendCategory,
      maxCapacityKg: Number(floorForm.maxCapacityKg),
    });
  };

  const handleDropOnFloor = async (floor: ProductionFloor, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverFloorId(null);
    if (!dragged) return;
    const plannedOrder = plannedOrders.find((order) => order.id === dragged.productionOrderId);
    if (!plannedOrder) return;

    if (dragged.type === "planned") {
      await onCreateAssignment(floor, plannedOrder);
    }

    if (dragged.type === "assigned" && dragged.assignmentId && dragged.floorId !== undefined) {
      if (dragged.floorId !== floor.id) {
        await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
        const newDay = getAvailableDay(floor, assignmentsByFloor.get(floor.id) ?? [], Number(plannedOrder.volume ?? 0));
        await createAssignmentMutation.mutateAsync({
          floorId: floor.id,
          productionOrderId: plannedOrder.id,
          weekLabel: selectedWeekLabel,
          assignedDay: newDay,
          planStatus: "Planned",
        });
      }
    }
    setDragged(null);
  };

  const handleUnassign = async (assignmentId: number) => {
    await deleteAssignmentMutation.mutateAsync(assignmentId);
    toast({ title: "Order unassigned", description: "The order was returned to the unassigned list." });
  };

  const handleProduce = async (assignmentId: number, orderId: number, floorId?: number) => {
    try {
      const fullOrder = mdpOrderByMdpId.get(orderId);
      const acc = planningAccountMap[fullOrder?.accountId ?? 0];
      await produceAssignmentMutation.mutateAsync({
        assignmentId,
        orderId,
        accountName: acc?.company ?? fullOrder?.accountName ?? "Unknown",
        productName: acc?.productName ?? fullOrder?.productName ?? "Unknown",
        productType: acc?.productType ?? fullOrder?.productType ?? "Unknown",
        volume: Number(fullOrder?.volume ?? 0),
        floorId,
      });
      toast({ title: "Produced", description: "The order has been moved to production history." });
    } catch (error: any) {
      toast({ title: "Could not produce order", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const handleReorder = (floorId: number, draggedAssignmentId: number, targetAssignmentId: number) => {
    setLocalFloorOrder((prev) => {
      const current = [...(prev[floorId] ?? [])];
      const fromIndex = current.indexOf(draggedAssignmentId);
      const toIndex = current.indexOf(targetAssignmentId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      current.splice(fromIndex, 1);
      current.splice(toIndex, 0, draggedAssignmentId);
      return { ...prev, [floorId]: current };
    });
  };

  const handleDropOnFloorDay = async (floor: ProductionFloor, day: string, event: React.DragEvent) => {
    event.preventDefault();
    setDragOverFloorId(null);
    if (!dragged) return;
    const plannedOrder = plannedOrders.find((order) => order.id === dragged.productionOrderId);
    if (!plannedOrder) return;

    if (dragged.type === "planned") {
      await createAssignmentMutation.mutateAsync({
        floorId: floor.id, productionOrderId: plannedOrder.id,
        weekLabel: selectedWeekLabel, assignedDay: day, planStatus: "Planned",
      });
      toast({ title: "Order assigned", description: `Assigned to ${floor.floorName} — ${day}.` });
    }
    if (dragged.type === "assigned" && dragged.assignmentId && dragged.floorId !== undefined) {
      await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
      await createAssignmentMutation.mutateAsync({
        floorId: floor.id, productionOrderId: plannedOrder.id,
        weekLabel: selectedWeekLabel, assignedDay: day, planStatus: "Planned",
      });
    }
    setDragged(null);
  };

  const handleAssistedPlanning = async () => {
    setAssistedState("optimizing");
    try {
      const unassignedOrders = plannedOrders.filter((order) => !assignedMap.has(order.id));
      const assignmentPayloads = buildOptimizedAssignments(floors, unassignedOrders, selectedWeekLabel, includeSaturday);
      await Promise.all(
        assignmentPayloads.map((payload) =>
          fetch(`${BASE}api/mdp/floor-assignments`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              floorId: payload.floor_id, productionOrderId: payload.production_order_id,
              weekLabel: payload.week_label, assignedDay: payload.assigned_day, planStatus: "Planned",
            }),
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments", selectedWeekLabel] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      setAssistedState("done");
      window.setTimeout(() => setAssistedState("idle"), 3000);
      toast({ title: "AI Plan Optimized", description: `Planned orders sorted across floors — Critical first, Seasoning/Dairy Premix separated.` });
    } catch (error: any) {
      setAssistedState("idle");
      toast({ title: "Could not optimize plan", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const assignedRightOrders = React.useMemo(
    () => plannedOrders.map((order) => ({
      order,
      assigned: assignedMap.has(order.id),
    })),
    [plannedOrders, assignedMap]
  );

  const mdpOrderByMdpId = React.useMemo(() => {
    const map = new Map<number, ProductionOrder>();
    (productionOrdersQuery.data ?? []).forEach(o => map.set(o.id, o));
    return map;
  }, [productionOrdersQuery.data]);

  const printStyles = `
    @media print {
      @page { margin: 1cm; size: A4 landscape; }
      body * { visibility: hidden !important; }
      #print-schedule { visibility: visible !important; position: fixed; top: 0; left: 0; width: 100%; background: #fff !important; font-family: 'Inter', system-ui, sans-serif; color: #111 !important; }
      #print-schedule * { visibility: visible !important; color-adjust: exact; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-no-break { page-break-inside: avoid; }
      .print-break-before { page-break-before: always; }
    }
  `;

  if (floorsQuery.isLoading || assignmentsQuery.isLoading || productionOrdersQuery.isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-5">
      <style>{printStyles}</style>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="week-selector">Choose a week</label>
          <select
            id="week-selector"
            value={selectedWeekLabel}
            onChange={(event) => setSelectedWeekLabel(event.target.value)}
            className={cn("h-10 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
              isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
            )}
          >
            {weeks.map((week) => (
              <option key={week.weekLabel} value={week.weekLabel}>
                {week.weekLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {planningView === "weekly" && (
            <label className={cn("flex items-center gap-2 px-3 h-9 rounded-xl border text-xs font-medium cursor-pointer transition-all",
              isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
            )}>
              <input type="checkbox" checked={includeSaturday} onChange={e => setIncludeSaturday(e.target.checked)} className="accent-primary" />
              Include Saturday
            </label>
          )}
          <button
            onClick={handleAssistedPlanning}
            disabled={assistedState === "optimizing"}
            className={cn("flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50",
              assistedState === "done"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-primary/10 border-primary/30 text-primary hover:bg-primary hover:text-white"
            )}
          >
            {assistedState === "optimizing" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI Planning…</> : assistedState === "done" ? "✓ AI Plan Applied" : "🤖 AI Assisted Planning"}
          </button>
          <button
            onClick={() => setPrintOpen(true)}
            className={cn("flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all",
              isLight ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            )}
          >
            Print Week Schedule
          </button>
        </div>
      </div>

      <div id="planning-split-container" className={cn("relative flex h-[720px] rounded-2xl border overflow-hidden",
        isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
      )}>
        <div style={{ width: `${splitPercent}%` }} className={cn("overflow-y-auto border-r p-5", isLight ? "border-slate-200" : "border-white/10")}>
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Production Floors</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Drag planned orders into floor boxes to schedule production.</p>
            </div>
            <Dialog open={floorModalOpen} onOpenChange={setFloorModalOpen}>
              <DialogTrigger asChild>
                <Button>Add Production Floor</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Add Production Floor</DialogTitle>
                  <DialogDescription>Define a new production floor with a blend category and daily capacity.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="floorName">Floor Name</Label>
                    <Input
                      id="floorName"
                      value={floorForm.floorName}
                      onChange={(event) => setFloorForm((prev) => ({ ...prev, floorName: event.target.value }))}
                      placeholder="e.g. Floor 1"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="blendCategory">Blend Category</Label>
                    <select
                      id="blendCategory"
                      value={floorForm.blendCategory}
                      onChange={(event) => setFloorForm((prev) => ({ ...prev, blendCategory: event.target.value as ProductionFloor["blendCategory"] }))}
                      className={cn("h-10 w-full rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
                        isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
                      )}
                    >
                      <option value="Sweet">Sweet</option>
                      <option value="Savory">Savory</option>
                      <option value="Sweet/Savory">Sweet/Savory</option>
                      <option value="Savory/Sweet">Savory/Sweet</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxCapacityKg">Maximum Capacity per day KG</Label>
                    <Input
                      id="maxCapacityKg"
                      type="number"
                      min={0}
                      value={floorForm.maxCapacityKg}
                      onChange={(event) => setFloorForm((prev) => ({ ...prev, maxCapacityKg: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>
                <DialogFooter className="space-x-2">
                  <Button onClick={handleAddFloor} disabled={!floorForm.floorName.trim() || Number(floorForm.maxCapacityKg) <= 0}>
                    Confirm
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* ── Shared order card renderer ── */}
          {(() => {
            const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", ...(includeSaturday ? ["Sat"] : [])];

            const makeOrderCard = (floorId: number) => (row: FloorAssignmentRow) => {
              const fullOrder = mdpOrderByMdpId.get(row.order.id);
              const acc = planningAccountMap[fullOrder?.accountId ?? 0];
              const company = acc?.company ?? row.order.accountName ?? "Unknown";
              const productName = acc?.productName ?? row.order.productName ?? null;
              const productTypeKey = acc?.productType ?? row.order.productType ?? null;
              const productTypeLabel = PRODUCT_TYPES.find(p => p.value === productTypeKey)?.label ?? productTypeKey ?? "—";
              const volume = Number(fullOrder?.volume ?? row.order.volume ?? 0);
              const expected = fullOrder?.expectedDeliveryDate ?? null;
              return (
                <div
                  key={row.assignment.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setDragged({ type: "assigned", productionOrderId: row.order.id, assignmentId: row.assignment.id, floorId }); }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (dragged?.type === "assigned" && dragged.assignmentId && dragged.floorId === floorId) handleReorder(floorId, dragged.assignmentId, row.assignment.id); }}
                  className={cn("rounded-xl border p-2.5 cursor-grab active:cursor-grabbing",
                    isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground text-xs truncate">{company}</div>
                      {productName && <div className="text-[10px] text-muted-foreground truncate">{productName}</div>}
                      <div className="text-[10px] text-muted-foreground">{productTypeLabel}</div>
                      {expected && <div className="text-[10px] text-muted-foreground">Due: {expected}</div>}
                    </div>
                    <div className="text-xs font-bold text-foreground shrink-0">{volume.toLocaleString()} KG</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleUnassign(row.assignment.id)} className={cn("flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>Unplan</button>
                    <button onClick={() => handleProduce(row.assignment.id, row.order.id, floorId)} className="flex-1 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">Produced</button>
                  </div>
                </div>
              );
            };

            const floorActionButtons = (floor: ProductionFloor) => (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditingFloor(floor); setEditFloorForm({ floorName: floor.floorName, blendCategory: floor.blendCategory, maxCapacityKg: String(floor.maxCapacityKg) }); setEditFloorOpen(true); }}
                  className={cn("p-1 rounded-md transition-colors text-muted-foreground hover:text-foreground", isLight ? "hover:bg-slate-100" : "hover:bg-white/10")} title="Edit">
                  <Edit3 className="w-3 h-3" />
                </button>
                {deleteConfirmFloorId === floor.id ? (
                  <>
                    <button onClick={() => deleteFloorMutation.mutate(floor.id)} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20">Yes</button>
                    <button onClick={() => setDeleteConfirmFloorId(null)} className={cn("px-1.5 py-0.5 rounded text-[9px]", isLight ? "text-slate-500" : "text-muted-foreground")}>No</button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirmFloorId(floor.id)}
                    className={cn("p-1 rounded-md transition-colors text-muted-foreground hover:text-red-400", isLight ? "hover:bg-red-50" : "hover:bg-red-500/10")} title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );

            if (floors.length === 0) {
              return (
                <div className={cn("rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground",
                  isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5"
                )}>
                  No floors defined yet. Add a production floor to begin scheduling.
                </div>
              );
            }

            /* ── DAILY VIEW ── */
            if (planningView === "daily") {
              return (
                <div className="space-y-4">
                  {floors.map(floor => {
                    const assignedRows = floorOrder(floor.id);
                    const totalKg = assignedRows.reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
                    const weekTotalCapacity = floor.maxCapacityKg * weekDays.length;
                    const progress = Math.min(100, Math.round((totalKg / (weekTotalCapacity || 1)) * 100));
                    const barClass = progress > 90 ? "bg-red-500" : progress > 70 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <div key={floor.id}
                        className={cn("rounded-2xl border p-4 transition-colors",
                          dragOverFloorId === floor.id ? "border-primary/50 bg-primary/5"
                            : isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5"
                        )}
                        onDragOver={e => { e.preventDefault(); setDragOverFloorId(floor.id); }}
                        onDragLeave={() => setDragOverFloorId(c => c === floor.id ? null : c)}
                        onDrop={e => handleDropOnFloor(floor, e)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">{floor.floorName}</h3>
                            <span className={cn("inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                              isLight ? "border-slate-200 text-slate-600 bg-white" : "border-white/10 text-muted-foreground bg-white/5"
                            )}>{floor.blendCategory}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="text-right text-xs text-muted-foreground mr-1">
                              <div className="font-medium">{(weekTotalCapacity - totalKg).toLocaleString()} KG remaining</div>
                              <div className={cn("mt-1 h-1.5 w-24 overflow-hidden rounded-full", isLight ? "bg-slate-200" : "bg-white/10")}>
                                <div className={`${barClass} h-full transition-all`} style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                            {floorActionButtons(floor)}
                          </div>
                        </div>
                        <div className={cn("min-h-[120px] rounded-xl border border-dashed p-3",
                          isLight ? "border-slate-200 bg-white/60" : "border-white/10 bg-black/5"
                        )}>
                          {assignedRows.length === 0
                            ? <div className="flex h-full min-h-[80px] items-center justify-center text-xs text-muted-foreground/60">Drop orders here</div>
                            : <div className="space-y-2">{assignedRows.map(makeOrderCard(floor.id))}</div>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            /* ── WEEKLY VIEW: day-first layout ── */
            return (
              <div className="space-y-5">
                {weekDays.map((day, dayIndex) => {
                  const dayDate = selectedWeek?.days[dayIndex];
                  const dayFull = dayDate
                    ? dayDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
                    : day;
                  const totalDayKg = floors.reduce((sum, floor) => {
                    return sum + floorOrder(floor.id)
                      .filter(r => r.assignment.assignedDay === day)
                      .reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
                  }, 0);

                  return (
                    <div key={day}>
                      {/* Day header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn("h-px flex-none w-2", isLight ? "bg-slate-300" : "bg-white/20")} />
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("text-xs font-bold uppercase tracking-widest", isLight ? "text-slate-700" : "text-foreground")}>{dayFull}</span>
                          {totalDayKg > 0 && (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold",
                              isLight ? "border-slate-200 text-slate-500 bg-slate-50" : "border-white/10 text-muted-foreground bg-white/5"
                            )}>{totalDayKg.toLocaleString()} KG total</span>
                          )}
                          <button onClick={() => setExpandedDay(day)}
                            className={cn("p-1 rounded-md transition-colors text-muted-foreground hover:text-primary", isLight ? "hover:bg-primary/5" : "hover:bg-primary/10")} title={`Expand ${dayFull}`}>
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className={cn("h-px flex-1", isLight ? "bg-slate-200" : "bg-white/10")} />
                      </div>

                      {/* Floor boxes row */}
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${floors.length}, minmax(0, 1fr))` }}>
                        {floors.map(floor => {
                          const dayRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === day);
                          const dayKg = dayRows.reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
                          const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                          const utilBar = dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500";
                          const isDragTarget = dragOverFloorId === floor.id;

                          return (
                            <div key={floor.id}
                              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverFloorId(floor.id); }}
                              onDragLeave={() => setDragOverFloorId(c => c === floor.id ? null : c)}
                              onDrop={e => { e.stopPropagation(); handleDropOnFloorDay(floor, day, e); }}
                              className={cn("rounded-2xl border flex flex-col transition-colors",
                                isDragTarget ? "border-primary/60 bg-primary/5"
                                  : isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5"
                              )}
                            >
                              {/* Floor card header */}
                              <div className={cn("px-3 py-2.5 border-b rounded-t-2xl flex items-start justify-between gap-1",
                                isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
                              )}>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{floor.floorName}</p>
                                  <p className="text-[10px] text-muted-foreground">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG</p>
                                </div>
                                {floorActionButtons(floor)}
                              </div>

                              {/* Utilisation bar */}
                              <div className="px-3 pt-2">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <div className={cn("flex-1 h-1 rounded-full overflow-hidden", isLight ? "bg-slate-200" : "bg-white/10")}>
                                    <div className={`${utilBar} h-full transition-all`} style={{ width: `${dayUtil}%` }} />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground shrink-0">{(floor.maxCapacityKg - dayKg).toLocaleString()} KG remaining · {dayUtil}%</span>
                                </div>
                              </div>

                              {/* Orders drop zone */}
                              <div className={cn("flex-1 p-2 space-y-1.5 min-h-[90px] rounded-b-2xl",
                                isDragTarget ? "bg-primary/5" : ""
                              )}>
                                {dayRows.length === 0
                                  ? <div className={cn("flex h-full min-h-[70px] items-center justify-center text-[10px] rounded-xl border border-dashed",
                                      isLight ? "border-slate-200 text-slate-400" : "border-white/10 text-muted-foreground/40"
                                    )}>Drop here</div>
                                  : dayRows.map(makeOrderCard(floor.id))
                                }
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div
          className={cn("cursor-col-resize", isLight ? "bg-slate-200" : "bg-white/10")}
          style={{ width: 10, minWidth: 10, maxWidth: 10 }}
          onMouseDown={() => setIsDividerDragging(true)}
        />

        <div style={{ width: `${100 - splitPercent}%` }} className="flex flex-col overflow-hidden p-5 gap-4">
          {/* Planning Summary — pinned at top */}
          <div className={cn("rounded-2xl border p-4 shrink-0", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5")}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Planning summary</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className={cn("rounded-xl border p-4", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Planned orders</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{plannedOrders.length}</p>
              </div>
              <div className={cn("rounded-xl border p-4", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Assigned</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{Array.from(assignedMap.keys()).length}</p>
              </div>
            </div>
          </div>

          {/* Planned Orders — scrollable */}
          <div className="flex flex-col min-h-0 flex-1 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">Planned Orders</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Drag unassigned orders into floors or unassign existing items.</p>
              </div>
              <div className={cn("flex gap-1 p-1 rounded-xl border", isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10")}>
                {(["weekly", "daily"] as PlanningViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPlanningView(mode)}
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                      planningView === mode
                        ? "bg-primary text-white shadow-sm shadow-primary/20"
                        : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={cn("rounded-2xl border p-4 flex-1 overflow-y-auto", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5")}>
              <div
                className={cn("min-h-[260px] rounded-xl border border-dashed p-3",
                  isLight ? "border-slate-200" : "border-white/10"
                )}
                onDragOver={(event) => event.preventDefault()}
                onDrop={async (event) => {
                  event.preventDefault();
                  if (dragged?.type === "assigned" && dragged.assignmentId) {
                    await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
                    setDragged(null);
                    toast({ title: "Order unassigned", description: "The order was returned to unassigned." });
                  }
                }}
              >
                {assignedRightOrders.length === 0 ? (
                  <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground/60">
                    No planned orders available.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedRightOrders.map(({ order, assigned }) => {
                      const acc = planningAccountMap[order.accountId ?? 0];
                      const company = acc?.company ?? order.accountName ?? "Unknown account";
                      const productName = acc?.productName ?? order.productName ?? null;
                      const productType = acc?.productType ?? order.productType ?? null;
                      const productTypeLabel = PRODUCT_TYPES.find(p => p.value === productType)?.label ?? productType ?? "—";
                      return (
                        <div
                          key={order.id}
                          draggable={!assigned}
                          onDragStart={(event) => {
                            if (!assigned) {
                              event.dataTransfer.effectAllowed = "move";
                              setDragged({ type: "planned", productionOrderId: order.id });
                            }
                          }}
                          className={cn("rounded-xl border p-3 transition-colors",
                            assigned
                              ? isLight ? "border-slate-200 bg-slate-100/60 opacity-60" : "border-white/10 bg-white/5 opacity-60"
                              : isLight ? "border-slate-200 bg-white hover:border-primary/30 cursor-grab" : "border-white/10 bg-black/10 hover:border-white/20 cursor-grab"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${getMicrobialColor(order.microbialAnalysis ?? "Normal")}`} />
                                <span className="font-bold text-foreground text-sm truncate">{company}</span>
                              </div>
                              {productName && <p className="text-xs text-muted-foreground truncate pl-3.5">{productName}</p>}
                              <div className="mt-1.5 pl-3.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-[11px] text-muted-foreground">{productTypeLabel}</span>
                                {order.expectedDeliveryDate && (
                                  <span className="text-[11px] text-muted-foreground">· Due: {order.expectedDeliveryDate}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-foreground">{Number(order.volume ?? 0).toLocaleString()} KG</p>
                              <VolumeTag volume={String(order.volume ?? 0)} />
                            </div>
                          </div>
                          {assigned && (
                            <div className="mt-2 inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                              Assigned ✓
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Floor Modal ── */}
      <AnimatePresence>
        {editFloorOpen && editingFloor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn("border rounded-2xl shadow-2xl w-full max-w-md flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                <h2 className="text-base font-bold text-foreground">Edit Production Floor</h2>
                <button onClick={() => setEditFloorOpen(false)} className={cn("p-1.5 rounded-lg", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-4">
                {(() => {
                  const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
                  const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";
                  return (<>
                    <div><label className={lCls}>Floor Name</label><input value={editFloorForm.floorName} onChange={e => setEditFloorForm(p => ({ ...p, floorName: e.target.value }))} className={iCls} /></div>
                    <div>
                      <label className={lCls}>Blend Category</label>
                      <select value={editFloorForm.blendCategory} onChange={e => setEditFloorForm(p => ({ ...p, blendCategory: e.target.value as ProductionFloor["blendCategory"] }))} className={iCls + " cursor-pointer"}>
                        <option value="Sweet" className="bg-black text-white">Sweet</option>
                        <option value="Savory" className="bg-black text-white">Savory</option>
                        <option value="Sweet/Savory" className="bg-black text-white">Sweet/Savory</option>
                        <option value="Savory/Sweet" className="bg-black text-white">Savory/Sweet</option>
                      </select>
                    </div>
                    <div><label className={lCls}>Max Capacity (kg/day)</label><input value={editFloorForm.maxCapacityKg} onChange={e => setEditFloorForm(p => ({ ...p, maxCapacityKg: e.target.value }))} type="number" min="0" className={iCls} /></div>
                  </>);
                })()}
              </div>
              <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                <button onClick={() => updateFloorMutation.mutate({ id: editingFloor.id, floorName: editFloorForm.floorName, blendCategory: editFloorForm.blendCategory, maxCapacityKg: Number(editFloorForm.maxCapacityKg) })}
                  disabled={!editFloorForm.floorName.trim() || Number(editFloorForm.maxCapacityKg) <= 0}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                  Save Changes
                </button>
                <button onClick={() => setEditFloorOpen(false)} className={cn("px-5 py-2.5 border rounded-xl text-sm", isLight ? "border-gray-200 text-gray-600" : "border-white/10 text-muted-foreground")}>Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className={cn("sm:max-w-5xl max-h-[90vh] overflow-y-auto", isLight ? "bg-white border-slate-200" : "")}>
          <DialogHeader>
            <DialogTitle>Print Week Schedule</DialogTitle>
            <DialogDescription>Production schedule for {selectedWeekLabel}. Click Print to generate a PDF.</DialogDescription>
          </DialogHeader>

          <div id="print-schedule" className="bg-white text-slate-900 p-6 rounded-xl">
            {/* Document Header */}
            <div className="border-b-2 border-slate-800 pb-4 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">ZENTRYX PRODUCTION</h1>
                  <p className="text-sm text-slate-500 mt-0.5">Materials & Demand Planning</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Week Schedule</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">{selectedWeekLabel}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Generated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
              </div>
            </div>

            {/* Summary Bar */}
            {(() => {
              const totalPlanned = assignments.length;
              const totalVolume = assignments.reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
              const totalCapacity = floors.reduce((s, f) => s + f.maxCapacityKg, 0);
              const weekDaysPrint = ["Mon", "Tue", "Wed", "Thu", "Fri", ...(includeSaturday ? ["Sat"] : [])];
              return (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                      { label: "Production Floors", value: floors.length },
                      { label: "Orders Planned", value: totalPlanned },
                      { label: "Total Volume", value: `${totalVolume.toLocaleString()} KG` },
                      { label: "Total Capacity/Day", value: `${totalCapacity.toLocaleString()} KG` },
                    ].map(stat => (
                      <div key={stat.label} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">{stat.label}</p>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-day schedules (day-first layout matching weekly view) */}
                  <div className="space-y-6">
                    {weekDaysPrint.map((day, dayIdx) => {
                      const dayDate = selectedWeek?.days[dayIdx];
                      const dayFull = dayDate
                        ? dayDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                        : day;
                      const totalDayKgPrint = floors.reduce((sum, floor) => {
                        return sum + floorOrder(floor.id)
                          .filter(r => r.assignment.assignedDay === day)
                          .reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
                      }, 0);
                      return (
                        <div key={day} className="print-no-break">
                          {/* Day Header */}
                          <div className="flex items-center justify-between border border-slate-200 rounded-t-xl px-4 py-3 bg-slate-800 text-white">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-sky-400" />
                              <span className="font-bold text-sm">{dayFull}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-slate-300">Day Total: <span className="text-white font-semibold">{totalDayKgPrint.toLocaleString()} KG</span></span>
                              <span className="text-slate-300">Floors: <span className="text-white font-semibold">{floors.length}</span></span>
                            </div>
                          </div>

                          {/* Floor columns */}
                          <div className="grid border border-t-0 border-slate-200 rounded-b-xl overflow-hidden"
                            style={{ gridTemplateColumns: `repeat(${floors.length || 1}, 1fr)` }}>
                            {floors.map((floor, floorIdx) => {
                              const dayRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === day);
                              const dayKg = dayRows.reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
                              const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                              return (
                                <div key={floor.id} className={cn("border-r border-slate-200 last:border-r-0 flex flex-col", floorIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                                  {/* Floor header */}
                                  <div className="border-b border-slate-200 px-3 py-2 bg-slate-100">
                                    <p className="text-[11px] font-bold text-slate-700">{floor.floorName}</p>
                                    <p className="text-[10px] text-slate-400">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG/day</p>
                                    {dayRows.length > 0 && (
                                      <div className="mt-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                                        <div className={cn("h-full rounded-full", dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${dayUtil}%` }} />
                                      </div>
                                    )}
                                  </div>
                                  {/* Orders */}
                                  <div className="p-2 space-y-2 min-h-[100px] flex-1">
                                    {dayRows.length === 0 ? (
                                      <p className="text-[10px] text-slate-300 text-center py-4">—</p>
                                    ) : (
                                      dayRows.map(row => {
                                        const fullOrder = mdpOrderByMdpId.get(row.order.id);
                                        const acc = planningAccountMap[fullOrder?.accountId ?? 0];
                                        const company = acc?.company ?? fullOrder?.accountCompany ?? fullOrder?.accountName ?? "—";
                                        const productName = acc?.productName ?? fullOrder?.productName ?? null;
                                        const volume = Number(fullOrder?.volume ?? row.order.volume ?? 0);
                                        return (
                                          <div key={row.assignment.id} className="border border-slate-200 rounded-lg p-2 bg-white">
                                            <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{company}</p>
                                            {productName && <p className="text-[10px] text-slate-500 truncate">{productName}</p>}
                                            <div className="flex items-center justify-between mt-1.5 gap-1">
                                              <span className="text-[10px] font-semibold text-slate-700">{volume.toLocaleString()} KG</span>
                                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", row.order.microbialAnalysis === "Critical" ? "bg-red-100 text-red-700" : row.order.microbialAnalysis === "Important" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>{row.order.microbialAnalysis ?? "Normal"}</span>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                  {/* Floor footer */}
                                  {dayRows.length > 0 && (
                                    <div className="border-t border-slate-200 px-3 py-1.5 bg-slate-50">
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-slate-500">{dayKg.toLocaleString()} KG</span>
                                        <span className={cn("text-[10px] font-bold", dayUtil > 90 ? "text-red-600" : dayUtil > 70 ? "text-amber-600" : "text-emerald-600")}>{dayUtil}% util</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-slate-200 mt-6 pt-4 flex items-center justify-between text-[10px] text-slate-400">
                    <span>ZENTRYX Production Schedule — Confidential</span>
                    <span>{selectedWeekLabel}</span>
                  </div>
                </>
              );
            })()}
          </div>

          <DialogFooter className="gap-2 mt-2 flex-wrap">
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Close</Button>
            <Button variant="outline" onClick={handlePrint}>Print</Button>
            <Button onClick={handleDownloadPdf} disabled={isPdfGenerating}>
              {isPdfGenerating ? "Generating…" : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Expand Day Full Screen Modal ── */}
      <AnimatePresence>
        {expandedDay != null && (() => {
          const weekDaysEx = ["Mon", "Tue", "Wed", "Thu", "Fri", ...(includeSaturday ? ["Sat"] : [])];
          const dayIdx = weekDaysEx.indexOf(expandedDay);
          const dayDate = selectedWeek?.days[dayIdx];
          const dayFull = dayDate
            ? dayDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            : expandedDay;
          const totalDayKgEx = floors.reduce((sum, floor) => {
            return sum + floorOrder(floor.id)
              .filter(r => r.assignment.assignedDay === expandedDay)
              .reduce((s, r) => s + Number(r.order.volume ?? 0), 0);
          }, 0);
          return (
            <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
                className="flex flex-col h-full">
                {/* Header */}
                <div className={cn("flex items-center justify-between px-6 py-4 border-b shrink-0", isLight ? "bg-white border-slate-200" : "bg-slate-900 border-white/10")}>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{dayFull}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedWeekLabel} · All production floors · {totalDayKgEx.toLocaleString()} KG scheduled</p>
                  </div>
                  <button onClick={() => setExpandedDay(null)}
                    className={cn("p-2 rounded-xl transition-colors", isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-muted-foreground")}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Floor grid for this day */}
                <div className={cn("flex-1 overflow-auto p-6", isLight ? "bg-slate-50" : "bg-slate-950")}>
                  {floors.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground/40">No production floors defined.</div>
                  ) : (
                    <div className="grid gap-4 h-full" style={{ gridTemplateColumns: `repeat(${floors.length}, minmax(0, 1fr))` }}>
                      {floors.map(floor => {
                        const dayRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === expandedDay);
                        const dayKg = dayRows.reduce((s, r) => s + Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0), 0);
                        const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                        const dayBar = dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500";
                        return (
                          <div key={floor.id} className={cn("rounded-2xl border flex flex-col", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900")}>
                            {/* Floor header */}
                            <div className={cn("px-4 py-3 border-b rounded-t-2xl", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
                              <p className="text-sm font-bold text-foreground">{floor.floorName}</p>
                              <p className="text-xs text-muted-foreground">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG/day</p>
                              <div className="mt-2 flex items-center gap-2">
                                <div className={cn("h-1.5 flex-1 rounded-full overflow-hidden", isLight ? "bg-slate-200" : "bg-white/10")}>
                                  <div className={`${dayBar} h-full transition-all`} style={{ width: `${dayUtil}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{(floor.maxCapacityKg - dayKg).toLocaleString()} KG remaining · {dayUtil}%</span>
                              </div>
                            </div>
                            {/* Orders */}
                            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                              {dayRows.length === 0 ? (
                                <div className="flex h-full min-h-[80px] items-center justify-center text-sm text-muted-foreground/40">No orders</div>
                              ) : (
                                dayRows.map(row => {
                                  const fullOrder = mdpOrderByMdpId.get(row.order.id);
                                  const acc = planningAccountMap[fullOrder?.accountId ?? 0];
                                  const company = acc?.company ?? fullOrder?.accountCompany ?? fullOrder?.accountName ?? "Unknown";
                                  const productName = acc?.productName ?? fullOrder?.productName ?? null;
                                  const volume = Number(fullOrder?.volume ?? row.order.volume ?? 0);
                                  return (
                                    <div key={row.assignment.id} className={cn("rounded-xl border p-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="min-w-0">
                                          <p className="font-bold text-foreground text-sm truncate">{company}</p>
                                          {productName && <p className="text-xs text-muted-foreground truncate">{productName}</p>}
                                        </div>
                                        <span className="text-sm font-bold text-foreground shrink-0">{volume.toLocaleString()} KG</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={cn("h-2 w-2 rounded-full shrink-0", getMicrobialColor(row.order.microbialAnalysis ?? "Normal"))} />
                                        <span className="text-xs text-muted-foreground">{row.order.microbialAnalysis ?? "Normal"}</span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

function ProductionHistoryTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [view, setView] = React.useState<ProductionHistoryView>("weekly");

  const allOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to load orders"); }
      return res.json() as Promise<ProductionOrder[]>;
    },
    staleTime: 1000 * 60,
  }) as UseQueryResult<ProductionOrder[], Error>;

  const historyAccountsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json() as Promise<{id: number; company: string; productName: string | null; productType: string | null}[]>;
    },
    staleTime: 1000 * 60 * 5,
  });

  const historyAccountMap = React.useMemo(() => {
    const map: Record<number, {company: string; productName: string | null; productType: string | null}> = {};
    (historyAccountsQuery.data ?? []).forEach(a => { map[a.id] = { company: a.company, productName: a.productName, productType: a.productType }; });
    return map;
  }, [historyAccountsQuery.data]);

  const pendingOrders = React.useMemo(() => {
    return (allOrdersQuery.data ?? []).filter(o => !o.isPlanned);
  }, [allOrdersQuery.data]);

  const producedHistoryQuery = useQuery({
    queryKey: ["/api/mdp/produced-orders", view],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/produced-orders?view=${encodeURIComponent(view)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load production history");
      }
      return (await res.json()) as ProducedOrder[];
    },
    staleTime: 1000 * 60,
  }) as UseQueryResult<ProducedOrder[], Error>;

  const deliverMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${BASE}api/mdp/produced-orders/${id}/deliver`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update delivery status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders", view] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      toast({ title: "Status updated", description: "Production order status has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Could not update status", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const producedOrders = React.useMemo(
    () => (producedHistoryQuery.data ?? []).slice().sort((a, b) => new Date(b.producedAt).getTime() - new Date(a.producedAt).getTime()),
    [producedHistoryQuery.data]
  );

  const rangeLabel = React.useMemo(() => getHistoryRangeLabel(view), [view]);

  if (producedHistoryQuery.isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-4">
      {/* ── Split layout: Pending (left) | History (right) ── */}
      <div className={cn("flex min-h-[640px] rounded-2xl border overflow-hidden", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>

        {/* ── LEFT: Pending Orders ── */}
        <div className={cn("w-[38%] shrink-0 flex flex-col border-r overflow-hidden", isLight ? "border-slate-200" : "border-white/10")}>
          <div className={cn("px-5 py-4 border-b shrink-0", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Pending Orders</h3>
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", pendingOrders.length > 0 ? "bg-amber-500/10 text-amber-400" : isLight ? "bg-slate-100 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                {pendingOrders.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Orders not yet planned</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {pendingOrders.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">All orders planned</p>
                  <p className="text-xs text-muted-foreground mt-1">No pending production orders.</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className={cn("text-xs text-muted-foreground border-b sticky top-0 z-10", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1117] border-white/5")}>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Vol.</th>
                    <th className="px-3 py-2.5 text-left font-medium">Material</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map(order => {
                    const acc = historyAccountMap[order.accountId ?? 0];
                    const company = acc?.company ?? order.accountName ?? order.accountCompany ?? "—";
                    const productName = acc?.productName ?? order.productName ?? null;
                    const productTypeKey = acc?.productType ?? order.productType ?? null;
                    const productTypeLabel = PRODUCT_TYPES.find(p => p.value === productTypeKey)?.label ?? productTypeKey ?? "—";
                    const rawMat = order.rawMaterialStatus ?? "Pending";
                    return (
                      <tr key={order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-foreground text-xs leading-tight truncate max-w-[130px]">{company}</p>
                          {productName && <p className="text-[10px] text-muted-foreground truncate max-w-[130px]">{productName}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-muted-foreground">{productTypeLabel}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold">{Number(order.volume ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            rawMat === "Available" ? "bg-emerald-500/10 text-emerald-400" :
                            rawMat === "Not Available" ? "bg-red-500/10 text-red-400" :
                            "bg-amber-500/10 text-amber-400"
                          )}>{rawMat}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── RIGHT: Production History ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className={cn("px-5 py-4 border-b shrink-0 flex items-center justify-between gap-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div>
              <h3 className="text-sm font-bold text-foreground">Production History</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Viewing: {rangeLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className={cn("flex gap-0.5 p-0.5 rounded-xl border", isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10")}>
                {(["daily", "weekly", "monthly", "yearly"] as ProductionHistoryView[]).map((option) => (
                  <button key={option} type="button" onClick={() => setView(option)}
                    className={cn("rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all",
                      view === option ? "bg-primary text-white shadow-sm" : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
                    )}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn("flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-medium border transition-all",
                    isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                  )}>
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px]">
                  <DropdownMenuItem onClick={() => downloadProductionHistoryCsv(producedOrders, view)}>Export CSV</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => downloadProductionHistoryXlsx(producedOrders, view)}>Export XLSX</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {producedOrders.length === 0 ? (
              <div className="flex h-full items-center justify-center p-10 text-center">
                <div>
                  <p className="text-base font-semibold text-foreground">No production history yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">Click "Produced" on any floor assignment in Production Planning.</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className={cn("text-xs text-muted-foreground border-b sticky top-0 z-10", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1117] border-white/5")}>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">Product Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Volume (KG)</th>
                    <th className="px-3 py-2.5 text-left font-medium">Produced At</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {producedOrders.map((order) => (
                    <tr key={order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-foreground text-sm leading-tight">{order.accountName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{order.productName}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {PRODUCT_TYPES.find(p => p.value === order.productType)?.label ?? order.productType}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-sm">{Number(order.volume ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(order.producedAt)}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                          order.deliveryStatus === "Delivered"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : order.deliveryStatus === "Stored in Warehouse"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : order.deliveryStatus === "In process"
                            ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          {order.deliveryStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={cn("px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors",
                              isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
                            )}>
                              Update Status ▾
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[190px]">
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "Delivered" })}>
                              Mark as Delivered
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "Stored in Warehouse" })}>
                              Stored in Warehouse
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "In process" })}>
                              In process
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialsDemandPlanningPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState("customer-products");
  const [search, setSearch] = React.useState("");
  const [urgencyFilter, setUrgencyFilter] = React.useState("all");
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Account | null>(null);
  const [formValues, setFormValues] = React.useState({ ...DEFAULT_FORM });
  const [manSearch, setManSearch] = React.useState("");

  const { data: users } = useListUsers();

  const productsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load accounts");
      }
      return res.json() as Promise<Account[]>;
    },
    staleTime: 1000 * 60 * 2,
  }) as UseQueryResult<Account[], Error>;
  const products = productsQuery.data ?? [];
  const isLoading = productsQuery.isLoading;

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/accounts`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsAddOpen(false);
      setFormValues({ ...DEFAULT_FORM });
      setManSearch("");
      toast({ title: "Product added", description: "New account record was saved." });
    },
    onError: (error: any) => {
      toast({ title: "Could not save", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!editingProduct) throw new Error("No account selected");
      const res = await fetch(`${BASE}api/accounts/${editingProduct.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsEditOpen(false);
      setEditingProduct(null);
      toast({ title: "Product updated", description: "Account information was updated." });
    },
    onError: (error: any) => {
      toast({ title: "Could not update", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/accounts/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Product removed", description: "The account record was deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Could not delete", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const { theme } = useTheme();
  const isLight = theme === "light";
  const creating = createMutation.status === "pending";
  const updating = updateMutation.status === "pending";

  const filteredUsers = React.useMemo(
    () => (users || []).filter((u: any) => u.name.toLowerCase().includes(manSearch.toLowerCase())),
    [users, manSearch]
  );

  const toggleManager = (id: number) => {
    setFormValues(f => ({
      ...f,
      accountManagers: f.accountManagers.includes(id)
        ? f.accountManagers.filter(x => x !== id)
        : [...f.accountManagers, id],
    }));
  };

  const filteredProducts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((a) => {
      const matchesSearch =
        !term ||
        [a.company, a.productName ?? "", a.productType ?? "", (a.accountManagerNames || []).join(" ")].some((v) =>
          v.toLowerCase().includes(term)
        );
      const matchesUrgency = urgencyFilter === "all" || a.urgencyLevel === urgencyFilter;
      return matchesSearch && matchesUrgency;
    });
  }, [products, search, urgencyFilter]);

  const summary = React.useMemo(() => {
    const total = products.length;
    const urgentCount = products.filter((a) => a.urgencyLevel === "urgent").length;
    const averageVolume = total
      ? Math.round(products.reduce((sum, a) => sum + parseFloat(a.volume || "0"), 0) / total)
      : 0;
    const recentCount = products.filter((a) => {
      const date = new Date(a.createdAt);
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);
      return date >= threshold;
    }).length;
    return { total, averageVolume, urgentCount, recentCount };
  }, [products]);

  const openEditForm = (account: Account) => {
    setEditingProduct(account);
    setFormValues({
      company: account.company,
      productName: account.productName ?? "",
      productType: account.productType ?? "seasoning",
      customerType: account.customerType ?? "new",
      contactPerson: account.contactPerson ?? "",
      cpPhone: account.cpPhone ?? "",
      cpEmail: account.cpEmail ?? "",
      application: account.application ?? "",
      targetPrice: account.targetPrice ?? "",
      volume: account.volume ?? "",
      urgencyLevel: account.urgencyLevel ?? "normal",
      competitorReference: account.competitorReference ?? "",
      accountManagers: account.accountManagers ?? [],
    });
    setManSearch("");
    setIsEditOpen(true);
  };

  const submitForm = async () => {
    if (!formValues.company || !formValues.productName || !formValues.productType) {
      toast({ title: "Company, Product Name and Product Type are required", variant: "destructive" });
      return;
    }
    const payload = { ...formValues };
    if (editingProduct && isEditOpen) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const openAddForm = () => {
    setEditingProduct(null);
    setFormValues({ ...DEFAULT_FORM });
    setManSearch("");
    setIsAddOpen(true);
  };

  const openEditDialog = (account: Account) => {
    openEditForm(account);
  };

  const MDP_TABS = [
    { value: "customer-products", label: "Customer Products" },
    { value: "production-orders", label: "Production Orders" },
    { value: "production-planning", label: "Production Planning" },
    { value: "production-history", label: "Production History" },
    { value: "forecast", label: "Forecast" },
  ] as const;
  type MdpTab = typeof MDP_TABS[number]["value"];

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-0">
      <div className="mb-5">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Package className="w-8 h-8 text-primary" /> Materials & Demand Planning
        </h1>
        <p className="text-muted-foreground mt-1">Manage raw materials, demand forecasting, and procurement planning.</p>
      </div>

      <div className={cn("flex gap-1 p-1 rounded-2xl border mb-6 w-fit overflow-x-auto",
        isLight ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10"
      )}>
        {MDP_TABS.map(tab => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value as MdpTab)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
              activeTab === tab.value
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : isLight ? "text-slate-600 hover:text-slate-900" : "text-muted-foreground hover:text-foreground"
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {activeTab === "customer-products" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Total accounts", value: summary.total },
                  { label: "Urgent", value: summary.urgentCount },
                  { label: "Avg. volume", value: `${summary.averageVolume.toLocaleString()} kg` },
                  { label: "Recent (30d)", value: summary.recentCount },
                ].map(stat => (
                  <div key={stat.label} className={cn("rounded-2xl border p-5",
                    isLight ? "border-slate-200 bg-white shadow-sm" : "border-white/5 bg-white/5"
                  )}>
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search company or product"
                      className={cn("h-9 pl-9 pr-4 rounded-xl border text-sm w-60 focus:outline-none focus:ring-2 focus:ring-primary/50",
                        isLight ? "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground"
                      )}
                    />
                  </div>
                  <select
                    value={urgencyFilter}
                    onChange={(event) => setUrgencyFilter(event.target.value)}
                    className={cn("h-9 px-3 rounded-xl border text-sm focus:outline-none cursor-pointer",
                      isLight ? "bg-white border-slate-200 text-slate-700" : "bg-black/20 border-white/10 text-foreground"
                    )}
                  >
                    <option value="all">All urgencies</option>
                    <option value="normal">Normal</option>
                    <option value="medium">Medium</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={() => downloadCsv(filteredProducts as Account[])}
                    className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-all",
                      isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                    )}>
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button onClick={openAddForm}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4" /> Add Product
                  </button>
                </div>
              </div>

            {/* ── Customer Products Table ── */}
            <div className={cn("glass-card rounded-2xl overflow-hidden border", isLight ? "border-slate-200 bg-white" : "border-white/5")}>
              <table className="w-full text-sm">
                <thead className={cn("text-xs text-muted-foreground border-b", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/5")}>
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Account</th>
                    <th className="px-5 py-3 text-left font-medium">Product Type</th>
                    <th className="px-5 py-3 text-left font-medium">Volume (kg)</th>
                    <th className="px-5 py-3 text-left font-medium">Manager(s)</th>
                    <th className="px-5 py-3 text-left font-medium">Urgency</th>
                    <th className="px-5 py-3 text-left font-medium">Added</th>
                    <th className="px-5 py-3 text-left font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                        No accounts match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((account) => (
                      <tr key={account.id}
                        className={cn("border-b last:border-0 transition-colors group",
                          isLight ? "border-slate-100 hover:bg-slate-50/70" : "border-white/5 hover:bg-white/[0.03]"
                        )}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground text-sm">{account.company}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{account.productName ?? "—"}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {PRODUCT_TYPES.find(p => p.value === account.productType)?.label ?? account.productType ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground font-medium">{parseFloat(account.volume || "0").toLocaleString()}</span>
                            <VolumeTag volume={account.volume} />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {(account.accountManagerNames || []).join(", ") || "—"}
                        </td>
                        <td className="px-5 py-3"><UrgencyBadge level={account.urgencyLevel} /></td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(account.createdAt)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditDialog(account)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="Edit">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteMutation.mutate(account.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className={cn("px-5 py-2.5 text-xs text-muted-foreground border-t", isLight ? "border-slate-100" : "border-white/5")}>
                Showing {filteredProducts.length} of {products.length} accounts
              </div>
            </div>

            {/* ── Add Product Modal ── */}
            <AnimatePresence>
              {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={cn("border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
                    <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">Add Product</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Create a new account record</p>
                      </div>
                      <button onClick={() => setIsAddOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {(() => {
                        const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
                        const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";
                        return (
                          <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className={lCls}>Company *</label>
                                <input value={formValues.company} onChange={e => setFormValues(p => ({ ...p, company: e.target.value }))} placeholder="Company name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Name *</label>
                                <input value={formValues.productName} onChange={e => setFormValues(p => ({ ...p, productName: e.target.value }))} placeholder="Product name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Type *</label>
                                <select value={formValues.productType} onChange={e => setFormValues(p => ({ ...p, productType: e.target.value }))} className={iCls + " cursor-pointer"}>
                                  {PRODUCT_TYPES.map(pt => <option key={pt.value} value={pt.value} className="bg-white text-black">{pt.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className={lCls}>Customer Type</label>
                                <select value={formValues.customerType} onChange={e => setFormValues(p => ({ ...p, customerType: e.target.value }))} className={iCls + " cursor-pointer"}>
                                  <option value="new" className="bg-white text-black">New Customer</option>
                                  <option value="existing" className="bg-white text-black">Existing Customer</option>
                                </select>
                              </div>
                              <div>
                                <label className={lCls}>Contact Person (CP)</label>
                                <input value={formValues.contactPerson} onChange={e => setFormValues(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Full name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Phone Number</label>
                                <input value={formValues.cpPhone} onChange={e => setFormValues(p => ({ ...p, cpPhone: e.target.value }))} placeholder="+234 xxx xxxx xxxx" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Email</label>
                                <input value={formValues.cpEmail} onChange={e => setFormValues(p => ({ ...p, cpEmail: e.target.value }))} placeholder="email@company.com" type="email" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Application</label>
                                <input value={formValues.application} onChange={e => setFormValues(p => ({ ...p, application: e.target.value }))} placeholder="e.g. Noodles, Chips" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Target Price ($/kg)</label>
                                <input value={formValues.targetPrice} onChange={e => setFormValues(p => ({ ...p, targetPrice: e.target.value }))} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Volume (kg/month)</label>
                                <input value={formValues.volume} onChange={e => setFormValues(p => ({ ...p, volume: e.target.value }))} placeholder="0" type="number" min="0" className={iCls} />
                                {formValues.volume && <div className="mt-1"><VolumeTag volume={formValues.volume} /></div>}
                              </div>
                              <div>
                                <label className={lCls}>Urgency Level</label>
                                <div className="flex gap-2 flex-wrap mt-1">
                                  {SF_URGENCY.map(u => (
                                    <button key={u.value} type="button" onClick={() => setFormValues(p => ({ ...p, urgencyLevel: u.value }))}
                                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                                        formValues.urgencyLevel === u.value ? cn(u.bg, u.color) : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20"
                                      )}>
                                      <span className={cn("w-2 h-2 rounded-full", u.dot)} />{u.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className={lCls}>Competitor Reference</label>
                                <input value={formValues.competitorReference} onChange={e => setFormValues(p => ({ ...p, competitorReference: e.target.value }))} placeholder="Competitor names" className={iCls} />
                              </div>
                            </div>
                            <div>
                              <label className={lCls}>Account Manager(s)</label>
                              <input value={manSearch} onChange={e => setManSearch(e.target.value)} placeholder="Search staff…" className={iCls + " mb-2"} />
                              <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredUsers.map((u: any) => (
                                  <label key={u.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all",
                                    formValues.accountManagers.includes(u.id) ? "border-primary/30 bg-primary/10 text-foreground" : isLight ? "border-gray-100 text-gray-600 hover:bg-gray-50" : "border-white/5 text-muted-foreground hover:border-white/10"
                                  )}>
                                    <input type="checkbox" checked={formValues.accountManagers.includes(u.id)} onChange={() => toggleManager(u.id)} className="accent-primary" />
                                    <span className="flex-1">{u.name}</span>
                                    <span className="text-[10px] text-muted-foreground/60">{u.department || u.role?.replace(/_/g, " ")}</span>
                                  </label>
                                ))}
                              </div>
                              {formValues.accountManagers.length > 0 && (
                                <p className="text-xs text-primary mt-1">{formValues.accountManagers.length} manager{formValues.accountManagers.length > 1 ? "s" : ""} selected</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                      <button onClick={submitForm} disabled={creating}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {creating ? "Saving…" : "Add Product"}
                      </button>
                      <button onClick={() => setIsAddOpen(false)}
                        className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ── Edit Product Modal ── */}
            <AnimatePresence>
              {isEditOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={cn("border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col", isLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
                    <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">Edit Product</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Update account record details</p>
                      </div>
                      <button onClick={() => setIsEditOpen(false)} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {(() => {
                        const iCls = cn("w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");
                        const lCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block";
                        return (
                          <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className={lCls}>Company *</label>
                                <input value={formValues.company} onChange={e => setFormValues(p => ({ ...p, company: e.target.value }))} placeholder="Company name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Name *</label>
                                <input value={formValues.productName} onChange={e => setFormValues(p => ({ ...p, productName: e.target.value }))} placeholder="Product name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Product Type *</label>
                                <select value={formValues.productType} onChange={e => setFormValues(p => ({ ...p, productType: e.target.value }))} className={iCls + " cursor-pointer"}>
                                  {PRODUCT_TYPES.map(pt => <option key={pt.value} value={pt.value} className="bg-white text-black">{pt.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className={lCls}>Customer Type</label>
                                <select value={formValues.customerType} onChange={e => setFormValues(p => ({ ...p, customerType: e.target.value }))} className={iCls + " cursor-pointer"}>
                                  <option value="new" className="bg-white text-black">New Customer</option>
                                  <option value="existing" className="bg-white text-black">Existing Customer</option>
                                </select>
                              </div>
                              <div>
                                <label className={lCls}>Contact Person (CP)</label>
                                <input value={formValues.contactPerson} onChange={e => setFormValues(p => ({ ...p, contactPerson: e.target.value }))} placeholder="Full name" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Phone Number</label>
                                <input value={formValues.cpPhone} onChange={e => setFormValues(p => ({ ...p, cpPhone: e.target.value }))} placeholder="+234 xxx xxxx xxxx" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>CP's Email</label>
                                <input value={formValues.cpEmail} onChange={e => setFormValues(p => ({ ...p, cpEmail: e.target.value }))} placeholder="email@company.com" type="email" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Application</label>
                                <input value={formValues.application} onChange={e => setFormValues(p => ({ ...p, application: e.target.value }))} placeholder="e.g. Noodles, Chips" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Target Price ($/kg)</label>
                                <input value={formValues.targetPrice} onChange={e => setFormValues(p => ({ ...p, targetPrice: e.target.value }))} placeholder="0.00" type="number" step="0.01" min="0" className={iCls} />
                              </div>
                              <div>
                                <label className={lCls}>Volume (kg/month)</label>
                                <input value={formValues.volume} onChange={e => setFormValues(p => ({ ...p, volume: e.target.value }))} placeholder="0" type="number" min="0" className={iCls} />
                                {formValues.volume && <div className="mt-1"><VolumeTag volume={formValues.volume} /></div>}
                              </div>
                              <div>
                                <label className={lCls}>Urgency Level</label>
                                <div className="flex gap-2 flex-wrap mt-1">
                                  {SF_URGENCY.map(u => (
                                    <button key={u.value} type="button" onClick={() => setFormValues(p => ({ ...p, urgencyLevel: u.value }))}
                                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                                        formValues.urgencyLevel === u.value ? cn(u.bg, u.color) : isLight ? "border-gray-200 text-gray-500 hover:border-gray-300" : "border-white/10 text-muted-foreground hover:border-white/20"
                                      )}>
                                      <span className={cn("w-2 h-2 rounded-full", u.dot)} />{u.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className={lCls}>Competitor Reference</label>
                                <input value={formValues.competitorReference} onChange={e => setFormValues(p => ({ ...p, competitorReference: e.target.value }))} placeholder="Competitor names" className={iCls} />
                              </div>
                            </div>
                            <div>
                              <label className={lCls}>Account Manager(s)</label>
                              <input value={manSearch} onChange={e => setManSearch(e.target.value)} placeholder="Search staff…" className={iCls + " mb-2"} />
                              <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredUsers.map((u: any) => (
                                  <label key={u.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all",
                                    formValues.accountManagers.includes(u.id) ? "border-primary/30 bg-primary/10 text-foreground" : isLight ? "border-gray-100 text-gray-600 hover:bg-gray-50" : "border-white/5 text-muted-foreground hover:border-white/10"
                                  )}>
                                    <input type="checkbox" checked={formValues.accountManagers.includes(u.id)} onChange={() => toggleManager(u.id)} className="accent-primary" />
                                    <span className="flex-1">{u.name}</span>
                                    <span className="text-[10px] text-muted-foreground/60">{u.department || u.role?.replace(/_/g, " ")}</span>
                                  </label>
                                ))}
                              </div>
                              {formValues.accountManagers.length > 0 && (
                                <p className="text-xs text-primary mt-1">{formValues.accountManagers.length} manager{formValues.accountManagers.length > 1 ? "s" : ""} selected</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                      <button onClick={submitForm} disabled={updating}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                        {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                        {updating ? "Saving…" : "Save Changes"}
                      </button>
                      <button onClick={() => setIsEditOpen(false)}
                        className={cn("px-5 py-2.5 border rounded-xl text-sm transition-colors", isLight ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
          )}

          {activeTab === "production-orders" && <ProductionOrdersTab />}

          {activeTab === "production-planning" && <ProductionPlanningTab />}

          {activeTab === "production-history" && <ProductionHistoryTab />}

          {activeTab === "forecast" && <SalesForecastPage />}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function MaterialsDemandPlanning() {
  return (
    <PlannedOrdersProvider>
      <MaterialsDemandPlanningPage />
    </PlannedOrdersProvider>
  );
}
