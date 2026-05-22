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
  Moon,
  Settings,
  AlertTriangle,
  ChevronDown,
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
import { useCustomOptions, DEFAULT_PRODUCT_TYPES, displayLabel } from "@/lib/project-options";
import { CustomOptionsSelect } from "@/components/ui/CustomOptionsSelect";

const BASE = import.meta.env.BASE_URL;

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
  productType: "",
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
    a.productType ?? "-",
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

type FloorStatus = "Running" | "Under Maintenance" | "On Hold";
const FLOOR_STATUSES: FloorStatus[] = ["Running", "Under Maintenance", "On Hold"];

type ProductionFloor = {
  id: number;
  floorName: string;
  blendCategory: "Sweet" | "Savory" | "Sweet/Savory" | "Savory/Sweet";
  maxCapacityKg: number;
  status?: FloorStatus | string | null;
};

function formatSwitchDuration(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "0mins";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}mins`;
  if (min === 0) return `${h}${h === 1 ? "hr" : "hrs"}`;
  return `${h}${h === 1 ? "hr" : "hrs"} ${min}mins`;
}

const SWITCH_PRESETS = [30, 60, 90, 120, 150, 180];

function floorStatusColor(status: FloorStatus | string | null | undefined): { dot: string; chip: string; ring: string } {
  const s = (status ?? "Running") as FloorStatus;
  if (s === "Under Maintenance") return {
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 border-amber-500/30 text-amber-500",
    ring: "ring-amber-500/40",
  };
  if (s === "On Hold") return {
    dot: "bg-red-500",
    chip: "bg-red-500/10 border-red-500/30 text-red-500",
    ring: "ring-red-500/40",
  };
  return {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
    ring: "ring-emerald-500/40",
  };
}

type FloorAssignmentRow = {
  assignment: {
    id: number;
    floorId: number;
    productionOrderId: number;
    weekLabel: string;
    assignedDay: string;
    planStatus: string;
    assignedVolume?: string | null;
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

// ── Blend Speed ─────────────────────────────────────────────────────────────

interface BlendSpeed {
  id: string;
  label: string;
  timeTaken: string;
}

const DEFAULT_BLEND_SPEEDS: BlendSpeed[] = [
  { id: "fast",   label: "Fast",   timeTaken: "" },
  { id: "medium", label: "Medium", timeTaken: "" },
  { id: "slow",   label: "Slow",   timeTaken: "" },
];

const LS_BLEND_SPEEDS     = "zentryx-blend-speeds";
const LS_ORDER_BLENDSPEED = "zentryx-order-blendspeed";

function blendSpeedColor(id: string) {
  if (id === "fast")   return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (id === "medium") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  if (id === "slow")   return "bg-blue-500/10 border-blue-500/20 text-blue-400";
  return "bg-slate-500/10 border-slate-500/20 text-slate-400";
}

function blendSpeedFactor(speedId: string): number {
  if (speedId === "fast")   return 1.0;
  if (speedId === "medium") return 0.7;
  if (speedId === "slow")   return 0.5;
  return 1.0;
}

function calcPriorityScore(
  rawMaterial: string,
  microbial: string,
  blendSpeedId: string,
  volume: number,
  expectedDeliveryDate: string | null | undefined,
): number {
  let score = 0;

  // Raw Material
  if (rawMaterial === "Available") score += 3;
  else if (rawMaterial === "Pending") score -= 5;

  // Due date urgency
  if (expectedDeliveryDate) {
    const due = new Date(expectedDeliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 5) score += 4;
    else if (diffDays <= 10) score += 2;
    // >10 days = +0
  }

  // Microbial
  if (microbial === "Critical") score += 3;
  else if (microbial === "Important") score += 1;

  // Volume
  if (volume > 10000) score += 2;

  // Blend Speed
  if (blendSpeedId === "slow") score += 3;
  else if (blendSpeedId === "medium") score += 1;

  return score;
}

function priorityScoreStyle(score: number): string {
  if (score < 0)  return "bg-red-500/10 border-red-500/20 text-red-400";
  if (score >= 8) return "bg-red-500/10 border-red-500/20 text-red-400";
  if (score >= 5) return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  if (score >= 2) return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
  return "bg-slate-500/10 border-slate-500/20 text-slate-400";
}

function ConfigurationDialog({
  open, onClose, blendSpeeds, onSave,
}: {
  open: boolean;
  onClose: () => void;
  blendSpeeds: BlendSpeed[];
  onSave: (speeds: BlendSpeed[]) => void;
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [draft, setDraft]         = React.useState<BlendSpeed[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [newLabel, setNewLabel]   = React.useState("");

  React.useEffect(() => {
    if (open) { setDraft(blendSpeeds.map(s => ({ ...s }))); setEditingId(null); setNewLabel(""); }
  }, [open, blendSpeeds]);

  const commitRename = (id: string) => {
    if (editLabel.trim()) setDraft(d => d.map(s => s.id === id ? { ...s, label: editLabel.trim() } : s));
    setEditingId(null);
  };

  const startRename = (s: BlendSpeed) => { setEditingId(s.id); setEditLabel(s.label); };

  const addNew = () => {
    if (!newLabel.trim()) return;
    setDraft(d => [...d, { id: `custom_${Date.now()}`, label: newLabel.trim(), timeTaken: "" }]);
    setNewLabel("");
  };

  if (!open) return null;

  const panelCls = cn("border rounded-2xl shadow-2xl w-full max-w-md flex flex-col",
    isLight ? "bg-white border-gray-200" : "glass-panel border-white/10");
  const rowCls = cn("rounded-xl border p-3 space-y-2",
    isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.02]");
  const inputCls = cn("h-8 rounded-lg border px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground",
    isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className={panelCls}>
        <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
          <div>
            <h2 className="text-lg font-bold text-foreground">Configuration</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Manage blend speed definitions and time metadata</p>
          </div>
          <button onClick={onClose} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blend Speed</h3>
          <div className="space-y-2">
            {draft.map(speed => (
              <div key={speed.id} className={rowCls}>
                <div className="flex items-center gap-2">
                  {editingId === speed.id ? (
                    <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => commitRename(speed.id)} onKeyDown={e => e.key === "Enter" && commitRename(speed.id)}
                      className={cn(inputCls, "flex-1 h-7 text-sm")} />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-foreground">{speed.label}</span>
                  )}
                  <button onClick={() => startRename(speed)} title="Rename"
                    className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDraft(d => d.filter(s => s.id !== speed.id))} title="Remove"
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Time Taken</label>
                  <input value={speed.timeTaken} onChange={e => setDraft(d => d.map(s => s.id === speed.id ? { ...s, timeTaken: e.target.value } : s))}
                    placeholder="e.g. 2 hours, 45 minutes" className={cn(inputCls, "w-full text-xs")} />
                </div>
              </div>
            ))}
          </div>

          <div className={cn("rounded-xl border p-3", isLight ? "border-slate-200" : "border-white/10")}>
            <p className="text-xs text-muted-foreground mb-2">Add new blend speed</p>
            <div className="flex gap-2">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addNew()}
                placeholder="Label (e.g. Extra Fast)" className={cn(inputCls, "flex-1")} />
              <button onClick={addNew} disabled={!newLabel.trim()}
                className="flex items-center gap-1 px-3 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </div>

        <div className={cn("flex justify-end gap-2 px-6 py-4 border-t", isLight ? "border-gray-100" : "border-white/5")}>
          <button onClick={onClose}
            className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
            Cancel
          </button>
          <button onClick={() => { onSave(draft); onClose(); }}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all">
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
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
  const [blendSpeeds, setBlendSpeeds] = React.useState<BlendSpeed[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_BLEND_SPEEDS) || "null") ?? DEFAULT_BLEND_SPEEDS; }
    catch { return DEFAULT_BLEND_SPEEDS; }
  });
  const [blendSpeedById, setBlendSpeedById] = React.useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_ORDER_BLENDSPEED) || "null") ?? {}; }
    catch { return {}; }
  });
  const [isConfigOpen, setIsConfigOpen] = React.useState(false);
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

  const handleChangeBlendSpeed = (orderId: number, value: string) => {
    setBlendSpeedById(c => {
      const next = { ...c, [orderId]: value };
      localStorage.setItem(LS_ORDER_BLENDSPEED, JSON.stringify(next));
      return next;
    });
  };

  const handleSaveBlendSpeeds = (speeds: BlendSpeed[]) => {
    setBlendSpeeds(speeds);
    localStorage.setItem(LS_BLEND_SPEEDS, JSON.stringify(speeds));
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
          <button onClick={() => setIsConfigOpen(true)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-foreground hover:border-white/20 hover:bg-white/5")}>
            <Settings className="w-4 h-4" /> Configuration
          </button>
          <button onClick={() => downloadProductionOrdersCsv(tableOrders)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20")}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => downloadProductionOrdersXlsx(tableOrders)} className={cn("flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20")}>
            <Download className="w-4 h-4" /> Export XLSX
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
              <th className="px-4 py-3 text-left font-medium">Blend Speed</th>
              <th className="px-4 py-3 text-left font-medium">Priority Score</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableOrders.length === 0 ? (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No production orders found.</td></tr>
            ) : (
              tableOrders.map((order) => {
                const microbial = microbialById[order.id] ?? order.microbialAnalysis ?? "Normal";
                const rawMaterial = rawMaterialById[order.id] ?? order.rawMaterialStatus ?? "Pending";
                const planned = order.isPlanned || isPlanningOrder(order.id);
                const blendSpeedId = blendSpeedById[order.id] ?? "";
                return (
                  <tr key={order.sfId ?? order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50/70" : "border-white/5 hover:bg-white/[0.03]")}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground text-sm">{order.accountCompany ?? "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{order.productName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {order.productType ?? "—"}
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
                      <select value={blendSpeedId} onChange={e => handleChangeBlendSpeed(order.id, e.target.value)}
                        className={cn("rounded-lg border px-2 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none",
                          blendSpeedId ? blendSpeedColor(blendSpeedId) : isLight ? "border-slate-200 bg-white text-slate-500" : "border-white/10 bg-black/20 text-muted-foreground"
                        )}>
                        <option value="" className="bg-black text-white">— Select —</option>
                        {blendSpeeds.map(s => <option key={s.id} value={s.id} className="bg-black text-white">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const ps = calcPriorityScore(
                          rawMaterial,
                          microbial,
                          blendSpeedId,
                          Number(order.volume ?? 0),
                          order.expectedDeliveryDate,
                        );
                        return (
                          <span className={cn("inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums", priorityScoreStyle(ps))}>
                            {ps > 0 ? `+${ps}` : ps}
                          </span>
                        );
                      })()}
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

      {/* ── Configuration Dialog ── */}
      <AnimatePresence>
        {isConfigOpen && (
          <ConfigurationDialog
            open={isConfigOpen}
            onClose={() => setIsConfigOpen(false)}
            blendSpeeds={blendSpeeds}
            onSave={handleSaveBlendSpeeds}
          />
        )}
      </AnimatePresence>

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

// Standalone hex/rgb CSS for the print template — used in html2canvas onclone to
// replace Tailwind v4's oklch-based stylesheets (which html2canvas 1.4.1 cannot parse).
const PRINT_CANVAS_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#fff;color:#0f172a}
.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}
.items-start{align-items:flex-start}.items-center{align-items:center}.justify-between{justify-content:space-between}
.gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}
.grid{display:grid}
.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}
.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.grid-cols-5{grid-template-columns:repeat(5,minmax(0,1fr))}
.grid-cols-6{grid-template-columns:repeat(6,minmax(0,1fr))}
.grid-cols-7{grid-template-columns:repeat(7,minmax(0,1fr))}
.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-6{padding:1.5rem}
.px-1\\.5{padding-left:.375rem;padding-right:.375rem}
.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}
.py-0\\.5{padding-top:.125rem;padding-bottom:.125rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}
.py-1\\.5{padding-top:.375rem;padding-bottom:.375rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}
.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}
.pb-4{padding-bottom:1rem}.pt-4{padding-top:1rem}
.mb-0\\.5{margin-bottom:.125rem}.mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}
.mb-3{margin-bottom:.75rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}
.mt-0\\.5{margin-top:.125rem}.mt-1{margin-top:.25rem}.mt-1\\.5{margin-top:.375rem}
.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.mt-6{margin-top:1.5rem}
.w-2{width:.5rem}.w-full{width:100%}
.h-1{height:.25rem}.h-2{height:.5rem}.h-full{height:100%}
.min-h-\\[100px\\]{min-height:100px}
.text-\\[9px\\]{font-size:9px;line-height:1.2}.text-\\[10px\\]{font-size:10px;line-height:1.2}.text-\\[11px\\]{font-size:11px;line-height:1.2}
.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}
.text-lg{font-size:1.125rem;line-height:1.75rem}.text-2xl{font-size:1.5rem;line-height:2rem}
.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}
.tracking-tight{letter-spacing:-.025em}.tracking-widest{letter-spacing:.1em}
.uppercase{text-transform:uppercase}.italic{font-style:italic}
.truncate{overflow:visible;text-overflow:clip;white-space:normal}
.leading-tight{line-height:1.25}.text-right{text-align:right}.text-center{text-align:center}
.opacity-40{opacity:.4}
.border{border-width:1px;border-style:solid}.border-2{border-width:2px;border-style:solid}
.border-b{border-bottom-width:1px;border-bottom-style:solid}
.border-b-2{border-bottom-width:2px;border-bottom-style:solid}
.border-t{border-top-width:1px;border-top-style:solid}
.border-r{border-right-width:1px;border-right-style:solid}
.border-t-0{border-top-width:0!important}
.rounded-lg{border-radius:.5rem}.rounded-xl{border-radius:.75rem}
.rounded-t-xl{border-top-left-radius:.75rem;border-top-right-radius:.75rem}
.rounded-b-xl{border-bottom-left-radius:.75rem;border-bottom-right-radius:.75rem}
.rounded-full{border-radius:9999px}
.last\\:border-r-0:last-child{border-right-width:0}
.space-y-2>*+*{margin-top:.5rem}.space-y-4>*+*{margin-top:1rem}.space-y-6>*+*{margin-top:1.5rem}
.overflow-hidden{overflow:hidden}.overflow-visible{overflow:visible}
.bg-white{background-color:#fff}
.bg-slate-50{background-color:#f8fafc}
.bg-slate-50\\/50{background-color:rgba(248,250,252,.5)}
.bg-slate-100{background-color:#f1f5f9}
.bg-slate-200{background-color:#e2e8f0}
.bg-slate-800{background-color:#1e293b}
.bg-red-100{background-color:#fee2e2}.bg-red-500{background-color:#ef4444}
.bg-amber-500{background-color:#f59e0b}
.bg-emerald-100{background-color:#d1fae5}.bg-emerald-500{background-color:#10b981}
.bg-blue-100{background-color:#dbeafe}
.bg-sky-400{background-color:#38bdf8}
.text-white{color:#fff}
.text-slate-900{color:#0f172a}.text-slate-800{color:#1e293b}.text-slate-700{color:#334155}
.text-slate-600{color:#475569}.text-slate-500{color:#64748b}
.text-slate-400{color:#94a3b8}.text-slate-300{color:#cbd5e1}
.text-red-700{color:#b91c1c}.text-red-600{color:#dc2626}
.text-emerald-700{color:#047857}.text-emerald-600{color:#059669}
.text-blue-700{color:#1d4ed8}
.text-amber-600{color:#d97706}
.text-sky-400{color:#38bdf8}
.border-slate-200{border-color:#e2e8f0}.border-slate-800{border-color:#1e293b}
.rounded-2xl{border-radius:1rem}.rounded-t-2xl{border-top-left-radius:1rem;border-top-right-radius:1rem}.rounded-b-2xl{border-bottom-left-radius:1rem;border-bottom-right-radius:1rem}
.w-3{width:.75rem}.w-4{width:1rem}.h-1\\.5{height:.375rem}.h-3{height:.75rem}.h-4{height:1rem}
.min-h-\\[90px\\]{min-height:90px}
.mt-3{margin-top:.75rem}
.gap-1\\.5{gap:.375rem}.space-y-1\\.5>*+*{margin-top:.375rem}
.py-2\\.5{padding-top:.625rem;padding-bottom:.625rem}.px-2\\.5{padding-left:.625rem;padding-right:.625rem}.p-2\\.5{padding:.625rem}
.text-indigo-400{color:#818cf8}.text-indigo-500{color:#6366f1}.text-indigo-600{color:#4f46e5}.text-indigo-800{color:#3730a3}
.bg-indigo-50{background-color:#eef2ff}.bg-indigo-100{background-color:#e0e7ff}.bg-indigo-500{background-color:#6366f1}
.bg-indigo-50\\/30{background-color:rgba(238,242,255,.3)}.bg-indigo-50\\/40{background-color:rgba(238,242,255,.4)}
.bg-indigo-500\\/5{background-color:rgba(99,102,241,.05)}.bg-indigo-500\\/10{background-color:rgba(99,102,241,.1)}
.border-indigo-100{border-color:#e0e7ff}.border-indigo-200{border-color:#c7d2fe}
.border-indigo-500\\/15{border-color:rgba(99,102,241,.15)}.border-indigo-500\\/20{border-color:rgba(99,102,241,.2)}.border-indigo-500\\/60{border-color:rgba(99,102,241,.6)}
`;

function PartialAssignModal({
  open, onClose, floor, order, suggestedVolume, remainingVolume,
  blendSpeedLabel, blendSpeedTimeTaken, volume, onVolumeChange, onConfirm, isLight, isPending,
}: {
  open: boolean;
  onClose: () => void;
  floor: ProductionFloor | null;
  order: ProductionOrder | null;
  suggestedVolume: number;
  remainingVolume: number;
  blendSpeedLabel: string;
  blendSpeedTimeTaken: string;
  volume: string;
  onVolumeChange: (v: string) => void;
  onConfirm: () => void;
  isLight: boolean;
  isPending: boolean;
}) {
  const numVol = Number(volume);
  const invalid = isNaN(numVol) || numVol <= 0;
  const exceeds = !isNaN(numVol) && numVol > remainingVolume;
  const panelCls = cn("border rounded-2xl shadow-2xl w-full max-w-md flex flex-col",
    isLight ? "bg-white border-gray-200" : "glass-panel border-white/10");
  const inputCls = cn("h-10 rounded-xl border px-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground",
    isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");

  if (!open || !floor || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }} className={panelCls}>
        <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
          <div>
            <h2 className="text-base font-bold text-foreground">Assign Partial Run</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{floor.floorName} · {floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG max</p>
          </div>
          <button onClick={onClose} className={cn("p-1.5 rounded-lg", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className={cn("rounded-xl border p-3 space-y-1", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.03]")}>
            <p className="text-xs font-semibold text-foreground truncate">{order.accountCompany ?? order.accountName ?? "Order"}</p>
            {order.productName && <p className="text-[11px] text-muted-foreground">{order.productName}</p>}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{Number(order.volume ?? 0).toLocaleString()} KG</span></span>
              <span className="text-[11px] text-muted-foreground">Remaining: <span className={cn("font-semibold", remainingVolume < Number(order.volume ?? 0) ? "text-amber-400" : "text-foreground")}>{remainingVolume.toLocaleString()} KG</span></span>
            </div>
          </div>

          {blendSpeedLabel && (
            <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", blendSpeedColor(blendSpeedLabel.toLowerCase()))}>
              <span className="text-xs font-semibold">{blendSpeedLabel}</span>
              {blendSpeedTimeTaken && <span className="text-[10px] opacity-80">· {blendSpeedTimeTaken}</span>}
              <span className="text-[10px] opacity-70 ml-auto">Blend speed</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Volume to assign (KG)
              <span className="normal-case ml-2 text-muted-foreground/60">Suggested: {suggestedVolume.toLocaleString()}</span>
            </label>
            <input
              type="number" min="1" step="0.1"
              value={volume}
              onChange={e => onVolumeChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !invalid && !exceeds && onConfirm()}
              className={cn(inputCls, exceeds ? "border-amber-500/50 focus:ring-amber-500/30" : "")}
              autoFocus
            />
            {exceeds && (
              <p className="text-xs text-amber-400 mt-1">Exceeds remaining quantity ({remainingVolume.toLocaleString()} KG). You can enter this but it will over-assign.</p>
            )}
          </div>
        </div>

        <div className={cn("flex justify-end gap-2 px-6 py-4 border-t", isLight ? "border-gray-100" : "border-white/5")}>
          <button onClick={onClose}
            className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={invalid || isPending}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Assign {!isNaN(numVol) && numVol > 0 ? `${numVol.toLocaleString()} KG` : ""}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

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
  const [includeNightShift, setIncludeNightShift] = React.useState(false);
  const [planningView, setPlanningView] = React.useState<PlanningViewMode>("weekly");
  const [assistedState, setAssistedState] = React.useState<"idle" | "optimizing" | "done">("idle");
  const [printOpen, setPrintOpen] = React.useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = React.useState(false);

  // Partial assignment modal state
  const [partialAssignPending, setPartialAssignPending] = React.useState<{
    floor: ProductionFloor; order: ProductionOrder; day: string;
  } | null>(null);
  const [partialVolume, setPartialVolume] = React.useState("");
  const [editingVolumeId, setEditingVolumeId] = React.useState<number | null>(null);
  const [editingVolumeStr, setEditingVolumeStr] = React.useState("");

  // Blend speeds from localStorage (same store as Production Orders tab)
  const blendSpeeds: BlendSpeed[] = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LS_BLEND_SPEEDS) || "null") ?? DEFAULT_BLEND_SPEEDS; }
    catch { return DEFAULT_BLEND_SPEEDS; }
  }, []);
  const blendSpeedByOrderId: Record<number, string> = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LS_ORDER_BLENDSPEED) || "null") ?? {}; }
    catch { return {}; }
  }, []);

  const handlePrint = React.useCallback(() => {
    window.print();
  }, []);

  const handleDownloadPdf = React.useCallback(() => {
    const el = document.getElementById("print-schedule");
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast({ title: "Popup blocked", description: "Allow popups for this site, then try again.", variant: "destructive" });
      return;
    }
    const filename = `Production-Schedule-${selectedWeekLabel.replace(/[\s:]/g, "-")}`;
    // PRINT_CANVAS_CSS is self-contained (hex/rgb, no external loads). This avoids
    // Tailwind preflight's "html,body{height:100%}" which clamps the popup body to
    // the window height (~700px) and causes only 1 page to appear in print.
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>
${PRINT_CANVAS_CSS}
html,body{height:auto!important;overflow:visible!important;background:#fff}
@page{size:A4 portrait;margin:1.5cm}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
.print-no-break{page-break-inside:avoid;break-inside:avoid}
.print-break-before{page-break-before:always;break-before:page}
</style></head><body>${el.outerHTML}</body></html>`);
    win.document.close();
    // No external assets — 600 ms is enough for layout to settle before printing.
    setTimeout(() => { win.focus(); win.print(); setTimeout(() => win.close(), 500); }, 600);
  }, [selectedWeekLabel, toast]);
  const [expandedDay, setExpandedDay] = React.useState<string | null>(null);
  const [dragged, setDragged] = React.useState<{
    type: "planned" | "assigned";
    productionOrderId: number;
    assignmentId?: number;
    floorId?: number;
  } | null>(null);
  const [localFloorOrder, setLocalFloorOrder] = React.useState<Record<number, number[]>>({});
  const [dragOverFloorId, setDragOverFloorId] = React.useState<number | null>(null);
  const [dragOverNightFloorId, setDragOverNightFloorId] = React.useState<number | null>(null);

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

  // All assignments across all weeks — used to permanently hide ordered orders from Planned Orders list
  const allAssignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load all floor assignments");
      return res.json() as Promise<FloorAssignmentRow[]>;
    },
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

  // Sum of assignedVolume across ALL weeks per order (null assignedVolume = legacy full assignment)
  const assignedVolumeByOrderId = React.useMemo(() => {
    const map: Record<number, number> = {};
    (allAssignmentsQuery.data ?? []).forEach(row => {
      const orderId = row.assignment.productionOrderId;
      const orderVol = Number(row.order?.volume ?? 0);
      const av = row.assignment.assignedVolume != null
        ? Number(row.assignment.assignedVolume)
        : orderVol; // legacy: treat as fully assigned
      map[orderId] = (map[orderId] ?? 0) + av;
    });
    return map;
  }, [allAssignmentsQuery.data]);

  const plannedOrders = React.useMemo(
    () => (productionOrdersQuery.data ?? []).filter((order) => order.isPlanned),
    [productionOrdersQuery.data]
  );

  // Remaining volume per order = total volume - total assigned across all weeks
  const remainingVolumeByOrderId = React.useMemo(() => {
    const map: Record<number, number> = {};
    plannedOrders.forEach(order => {
      const total = Number(order.volume ?? 0);
      const assigned = assignedVolumeByOrderId[order.id] ?? 0;
      map[order.id] = Math.max(0, total - assigned);
    });
    return map;
  }, [plannedOrders, assignedVolumeByOrderId]);

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

  const [statusMenuKey, setStatusMenuKey] = React.useState<string | null>(null);
  const [dismissedOverlays, setDismissedOverlays] = React.useState<Record<string, string>>({});

  const floorDayStatusesQuery = useQuery({
    queryKey: ["/api/mdp/floor-day-statuses", selectedWeekLabel],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-day-statuses?week=${encodeURIComponent(selectedWeekLabel)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to load floor day statuses"); }
      return res.json() as Promise<Array<{ id: number; floorId: number; weekLabel: string; assignedDay: string; status: FloorStatus; updatedAt: string }>>;
    },
    enabled: Boolean(selectedWeekLabel),
    staleTime: 1000 * 30,
  });

  const floorDayStatusMap = React.useMemo(() => {
    const map: Record<string, FloorStatus> = {};
    (floorDayStatusesQuery.data ?? []).forEach(row => {
      map[`${row.floorId}|${row.assignedDay}`] = row.status;
    });
    return map;
  }, [floorDayStatusesQuery.data]);

  const getFloorDayStatus = (floorId: number, day: string): FloorStatus =>
    floorDayStatusMap[`${floorId}|${day}`] ?? "Running";

  const downtimesQuery = useQuery({
    queryKey: ["/api/mdp/product-switch-downtimes", selectedWeekLabel],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/product-switch-downtimes?week=${encodeURIComponent(selectedWeekLabel)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to load product switch downtimes"); }
      return res.json() as Promise<Array<{ id: number; afterAssignmentId: number; minutes: number }>>;
    },
    enabled: Boolean(selectedWeekLabel),
    staleTime: 1000 * 30,
  });

  const downtimeByAssignmentId = React.useMemo(() => {
    const map: Record<number, number> = {};
    (downtimesQuery.data ?? []).forEach(row => { map[row.afterAssignmentId] = row.minutes; });
    return map;
  }, [downtimesQuery.data]);

  const updateDowntimeMutation = useMutation({
    mutationFn: async ({ afterAssignmentId, minutes }: { afterAssignmentId: number; minutes: number }) => {
      const res = await fetch(`${BASE}api/mdp/product-switch-downtimes`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ afterAssignmentId, minutes }),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to update switch downtime"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/product-switch-downtimes", selectedWeekLabel] });
    },
    onError: (error: any) => toast({ title: "Could not update switch time", description: error?.message, variant: "destructive" }),
  });

  const updateFloorDayStatusMutation = useMutation({
    mutationFn: async ({ floorId, day, status }: { floorId: number; day: string; status: FloorStatus }) => {
      const res = await fetch(`${BASE}api/mdp/floor-day-statuses`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ floorId, weekLabel: selectedWeekLabel, assignedDay: day, status }),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to update status"); }
      return res.json();
    },
    onSuccess: (_row, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-day-statuses", selectedWeekLabel] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setStatusMenuKey(null);
      setDismissedOverlays(prev => {
        const next = { ...prev };
        delete next[`${vars.floorId}|${vars.day}`];
        return next;
      });
      toast({ title: `Floor status: ${vars.status}`, description: `${vars.day} → ${vars.status}` });
    },
    onError: (error: any) => toast({ title: "Could not update status", description: error?.message, variant: "destructive" }),
  });

  const floorStatusButton = (floor: ProductionFloor, day: string) => {
    const current = getFloorDayStatus(floor.id, day);
    const colors = floorStatusColor(current);
    const menuKey = `${floor.id}|${day}`;
    const open = statusMenuKey === menuKey;
    return (
      <div className="relative">
        <button
          onClick={() => setStatusMenuKey(open ? null : menuKey)}
          className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-colors", colors.chip)}
          title={`Change ${floor.floorName} status for ${day}`}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
          {current}
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setStatusMenuKey(null)} />
            <div className={cn("absolute z-40 right-0 mt-1 min-w-[160px] rounded-xl border shadow-xl py-1",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-white/10"
            )}>
              {FLOOR_STATUSES.map(s => {
                const c = floorStatusColor(s);
                const isCurrent = s === current;
                return (
                  <button
                    key={s}
                    onClick={() => updateFloorDayStatusMutation.mutate({ floorId: floor.id, day, status: s })}
                    disabled={isCurrent || updateFloorDayStatusMutation.isPending}
                    className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                      isCurrent ? "opacity-50 cursor-not-allowed" : isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", c.dot)} />
                    <span className="font-medium text-foreground">{s}</span>
                    {isCurrent && <span className="ml-auto text-[9px] text-muted-foreground">current</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const DowntimeSeparator = ({ afterAssignmentId }: { afterAssignmentId: number }) => {
    const [open, setOpen] = React.useState(false);
    const [custom, setCustom] = React.useState("");
    const minutes = downtimeByAssignmentId[afterAssignmentId] ?? 60;
    return (
      <div className="relative flex items-center gap-2 px-1 py-0.5">
        <div className={cn("flex-1 border-t border-dashed", isLight ? "border-amber-400/40" : "border-amber-500/30")} />
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold whitespace-nowrap transition-colors",
            isLight
              ? "bg-amber-50 border-amber-300/60 text-amber-700 hover:bg-amber-100"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20",
          )}
          title="Product switch downtime"
        >
          <span className="w-1 h-1 rounded-full bg-amber-500" />
          {formatSwitchDuration(minutes)} switch
        </button>
        <div className={cn("flex-1 border-t border-dashed", isLight ? "border-amber-400/40" : "border-amber-500/30")} />
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className={cn(
              "absolute z-40 left-1/2 -translate-x-1/2 top-full mt-1 min-w-[220px] rounded-xl border shadow-xl p-2",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-white/10",
            )}>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5 px-1">Product switch</p>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {SWITCH_PRESETS.map(m => {
                  const isCurrent = m === minutes;
                  return (
                    <button
                      key={m}
                      onClick={() => { updateDowntimeMutation.mutate({ afterAssignmentId, minutes: m }); setOpen(false); }}
                      className={cn(
                        "py-1 rounded-md text-[10px] font-semibold border transition-colors",
                        isCurrent
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                          : isLight
                            ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                            : "border-white/10 text-muted-foreground hover:bg-white/5",
                      )}
                    >
                      {formatSwitchDuration(m)}
                    </button>
                  );
                })}
              </div>
              <div className={cn("flex items-center gap-1.5 border-t pt-2", isLight ? "border-slate-200" : "border-white/5")}>
                <input
                  type="number" min={0} step={5} placeholder="Custom min."
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  className={cn("flex-1 h-7 rounded-md border px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-500/40",
                    isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/30")}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const v = Number(custom);
                      if (!isNaN(v) && v >= 0) {
                        updateDowntimeMutation.mutate({ afterAssignmentId, minutes: v });
                        setOpen(false);
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const v = Number(custom);
                    if (!isNaN(v) && v >= 0) {
                      updateDowntimeMutation.mutate({ afterAssignmentId, minutes: v });
                      setOpen(false);
                    }
                  }}
                  className="h-7 px-2 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold"
                >Save</button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const interleaveDowntimes = (rows: FloorAssignmentRow[], renderCard: (r: FloorAssignmentRow) => React.ReactNode): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    rows.forEach((row, i) => {
      out.push(<React.Fragment key={`c-${row.assignment.id}`}>{renderCard(row)}</React.Fragment>);
      if (i < rows.length - 1) {
        out.push(<DowntimeSeparator key={`d-${row.assignment.id}`} afterAssignmentId={row.assignment.id} />);
      }
    });
    return out;
  };

  const floorDayCautionOverlay = (floor: ProductionFloor, day: string) => {
    const status = getFloorDayStatus(floor.id, day);
    if (status === "Running") return null;
    const dismissKey = `${floor.id}|${day}`;
    if (dismissedOverlays[dismissKey] === status) return null;
    const colors = floorStatusColor(status);
    return (
      <div className={cn(
        "pointer-events-none absolute inset-0 z-20 rounded-2xl ring-2",
        colors.ring,
      )}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg backdrop-blur-sm animate-pulse",
            status === "Under Maintenance"
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
              : "bg-red-500/20 border-red-500/40 text-red-300",
          )}>
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">{status}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDismissedOverlays(prev => ({ ...prev, [dismissKey]: status }));
              }}
              className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

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
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
    },
  });

  const updateAssignedVolumeMutation = useMutation({
    mutationFn: async ({ assignmentId, assignedVolume }: { assignmentId: number; assignedVolume: number }) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments/${assignmentId}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ assignedVolume }),
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.error || "Failed to update volume"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
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
        const vol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : Number(row.order.volume ?? 0);
        usage[row.assignment.assignedDay] += vol;
      }
    });

    return days.find((day) => usage[day] + volume <= floor.maxCapacityKg) ?? days[0];
  };

  const openPartialAssignModal = (floor: ProductionFloor, order: ProductionOrder, day?: string) => {
    const remaining = remainingVolumeByOrderId[order.id] ?? Number(order.volume ?? 0);
    const speedId = blendSpeedByOrderId[order.id] ?? "";
    const factor = blendSpeedFactor(speedId);
    const suggested = Math.min(remaining, Math.round(floor.maxCapacityKg * factor * 10) / 10);
    const resolvedDay = day ?? getAvailableDay(floor, assignmentsByFloor.get(floor.id) ?? [], suggested);
    setPartialAssignPending({ floor, order, day: resolvedDay });
    setPartialVolume(String(suggested > 0 ? suggested : remaining));
  };

  const handleConfirmPartialAssign = async () => {
    if (!partialAssignPending) return;
    const vol = Number(partialVolume);
    if (isNaN(vol) || vol <= 0) return;
    try {
      await createAssignmentMutation.mutateAsync({
        floorId: partialAssignPending.floor.id,
        productionOrderId: partialAssignPending.order.id,
        weekLabel: selectedWeekLabel,
        assignedDay: partialAssignPending.day,
        planStatus: "Planned",
        assignedVolume: vol,
      });
      toast({ title: "Partial run assigned", description: `${vol.toLocaleString()} KG → ${partialAssignPending.floor.floorName}` });
    } catch (err: any) {
      toast({ title: "Could not assign", description: err?.message, variant: "destructive" });
    }
    setPartialAssignPending(null);
    setPartialVolume("");
    setDragged(null);
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
      openPartialAssignModal(floor, plannedOrder);
      return; // wait for modal confirm
    }

    if (dragged.type === "assigned" && dragged.assignmentId && dragged.floorId !== undefined) {
      if (dragged.floorId !== floor.id) {
        const originalRow = assignments.find(r => r.assignment.id === dragged.assignmentId);
        const originalVol = originalRow?.assignment.assignedVolume;
        await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
        const newDay = getAvailableDay(floor, assignmentsByFloor.get(floor.id) ?? [], Number(originalVol ?? plannedOrder.volume ?? 0));
        await createAssignmentMutation.mutateAsync({
          floorId: floor.id, productionOrderId: plannedOrder.id,
          weekLabel: selectedWeekLabel, assignedDay: newDay, planStatus: "Planned",
          ...(originalVol != null ? { assignedVolume: Number(originalVol) } : {}),
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
      openPartialAssignModal(floor, plannedOrder, day);
      return; // wait for modal confirm
    }
    if (dragged.type === "assigned" && dragged.assignmentId && dragged.floorId !== undefined) {
      const originalRow = assignments.find(r => r.assignment.id === dragged.assignmentId);
      const originalVol = originalRow?.assignment.assignedVolume;
      await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
      await createAssignmentMutation.mutateAsync({
        floorId: floor.id, productionOrderId: plannedOrder.id,
        weekLabel: selectedWeekLabel, assignedDay: day, planStatus: "Planned",
        ...(originalVol != null ? { assignedVolume: Number(originalVol) } : {}),
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
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
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
    () => plannedOrders
      .filter((order) => (remainingVolumeByOrderId[order.id] ?? Number(order.volume ?? 0)) > 0)
      .map((order) => ({
        order,
        remainingVolume: remainingVolumeByOrderId[order.id] ?? Number(order.volume ?? 0),
      })),
    [plannedOrders, remainingVolumeByOrderId]
  );

  const mdpOrderByMdpId = React.useMemo(() => {
    const map = new Map<number, ProductionOrder>();
    (productionOrdersQuery.data ?? []).forEach(o => map.set(o.id, o));
    return map;
  }, [productionOrdersQuery.data]);

  const printStyles = `
    @media print {
      @page { margin: 1.5cm; size: A4 portrait; }
      body * { visibility: hidden !important; }
      #print-schedule {
        visibility: visible !important;
        position: absolute !important;
        top: 0 !important; left: 0 !important; right: 0 !important;
        width: 100% !important;
        overflow: visible !important;
        max-height: none !important;
        background: #fff !important;
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: #0f172a !important;
      }
      #print-schedule * {
        visibility: visible !important;
        overflow: visible !important;
        max-height: none !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-no-break { page-break-inside: avoid; break-inside: avoid; }
      .print-break-before { page-break-before: always; break-before: page; }
    }
  `;

  if (floorsQuery.isLoading || assignmentsQuery.isLoading || allAssignmentsQuery.isLoading || productionOrdersQuery.isLoading) {
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
              <input type="checkbox" checked={includeNightShift} onChange={e => setIncludeNightShift(e.target.checked)} className="accent-primary" />
              Include Night Shift
            </label>
          )}
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
              <DialogContent className={cn("sm:max-w-xl", isLight ? "bg-white border-gray-200 text-gray-900" : "")}>
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
                      className={isLight ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white" : ""}
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
                      className={isLight ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white" : ""}
                    />
                  </div>
                </div>
                <DialogFooter className="space-x-2">
                  <Button variant="outline" onClick={() => setFloorModalOpen(false)}
                    className={isLight ? "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:text-white" : ""}>
                    Cancel
                  </Button>
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
              const productTypeLabel = acc?.productType ?? row.order.productType ?? "—";
              const totalVol = Number(fullOrder?.volume ?? row.order.volume ?? 0);
              const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
              const expected = fullOrder?.expectedDeliveryDate ?? null;
              const isEditingThis = editingVolumeId === row.assignment.id;
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
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground text-xs truncate">{company}</div>
                      {productName && <div className="text-[10px] text-muted-foreground truncate">{productName}</div>}
                      <div className="text-[10px] text-muted-foreground">{productTypeLabel}</div>
                      {expected && <div className="text-[10px] text-muted-foreground">Due: {expected}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      {isEditingThis ? (
                        <input
                          autoFocus
                          type="number" min="0.1" step="0.1"
                          value={editingVolumeStr}
                          onChange={e => setEditingVolumeStr(e.target.value)}
                          onBlur={async () => {
                            const v = Number(editingVolumeStr);
                            if (!isNaN(v) && v > 0) {
                              await updateAssignedVolumeMutation.mutateAsync({ assignmentId: row.assignment.id, assignedVolume: v });
                            }
                            setEditingVolumeId(null);
                          }}
                          onKeyDown={async e => {
                            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                            if (e.key === "Escape") setEditingVolumeId(null);
                          }}
                          className={cn("w-20 h-6 rounded-md border px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/50",
                            isLight ? "border-slate-200 bg-white" : "border-white/10 bg-black/30")}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingVolumeId(row.assignment.id); setEditingVolumeStr(String(assignedVol)); }}
                          title="Edit assigned volume"
                          className="flex items-center gap-0.5 text-xs font-bold text-foreground hover:text-primary transition-colors group"
                        >
                          {assignedVol.toLocaleString()} KG
                          <Edit3 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 ml-0.5" />
                        </button>
                      )}
                      {totalVol > 0 && <div className="text-[9px] text-muted-foreground/60 mt-0.5">of {totalVol.toLocaleString()} total</div>}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleUnassign(row.assignment.id)} className={cn("flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>Unplan</button>
                    <button onClick={() => handleProduce(row.assignment.id, row.order.id, floorId)} className="flex-1 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">Produced</button>
                  </div>
                </div>
              );
            };

            const floorActionButtons = (floor: ProductionFloor, day?: string) => (
              <div className="flex items-center gap-1 shrink-0">
                {day && floorStatusButton(floor, day)}
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
                    const totalKg = assignedRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
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
                            : <div className="space-y-2">{interleaveDowntimes(assignedRows, makeOrderCard(floor.id))}</div>
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
                      .reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
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
                          const dayKg = dayRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                          const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                          const utilBar = dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500";
                          const isDragTarget = dragOverFloorId === floor.id;

                          return (
                            <div key={floor.id}
                              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverFloorId(floor.id); }}
                              onDragLeave={() => setDragOverFloorId(c => c === floor.id ? null : c)}
                              onDrop={e => { e.stopPropagation(); handleDropOnFloorDay(floor, day, e); }}
                              className={cn("relative rounded-2xl border flex flex-col transition-colors",
                                isDragTarget ? "border-primary/60 bg-primary/5"
                                  : isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5"
                              )}
                            >
                              {floorDayCautionOverlay(floor, day)}
                              {/* Floor card header */}
                              <div className={cn("px-3 py-2.5 border-b rounded-t-2xl flex items-start justify-between gap-1",
                                isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
                              )}>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{floor.floorName}</p>
                                  <p className="text-[10px] text-muted-foreground">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG</p>
                                </div>
                                {floorActionButtons(floor, day)}
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
                                  : interleaveDowntimes(dayRows, makeOrderCard(floor.id))
                                }
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Night Shift row — Mon–Fri only */}
                      {includeNightShift && day !== "Sat" && (
                        <>
                          <div className="flex items-center gap-2 mt-3 mb-2">
                            <Moon className="w-3 h-3 text-indigo-400" />
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">Night Shift</span>
                          </div>
                          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${floors.length}, minmax(0, 1fr))` }}>
                            {floors.map(floor => {
                              const nightDay = `${day}-NS`;
                              const nightRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === nightDay);
                              const nightKg = nightRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                              const nightUtil = Math.min(100, Math.round((nightKg / (floor.maxCapacityKg || 1)) * 100));
                              const nightUtilBar = nightUtil > 90 ? "bg-red-500" : nightUtil > 70 ? "bg-amber-500" : "bg-indigo-500";
                              const isNightTarget = dragOverNightFloorId === floor.id;
                              return (
                                <div key={`${floor.id}-NS`}
                                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverNightFloorId(floor.id); }}
                                  onDragLeave={() => setDragOverNightFloorId(c => c === floor.id ? null : c)}
                                  onDrop={e => { e.stopPropagation(); setDragOverNightFloorId(null); handleDropOnFloorDay(floor, nightDay, e); }}
                                  className={cn("relative rounded-2xl border flex flex-col transition-colors",
                                    isNightTarget ? "border-indigo-500/60 bg-indigo-500/5"
                                      : isLight ? "border-indigo-100 bg-indigo-50/40" : "border-indigo-500/15 bg-indigo-500/5"
                                  )}
                                >
                                  {floorDayCautionOverlay(floor, nightDay)}
                                  <div className={cn("px-3 py-2.5 border-b rounded-t-2xl flex items-start justify-between gap-1",
                                    isLight ? "border-indigo-100 bg-indigo-50" : "border-indigo-500/15 bg-indigo-500/10"
                                  )}>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-foreground truncate">{floor.floorName}</p>
                                      <p className="text-[10px] text-muted-foreground">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">{floorStatusButton(floor, nightDay)}</div>
                                  </div>
                                  <div className="px-3 pt-2">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <div className={cn("flex-1 h-1 rounded-full overflow-hidden", isLight ? "bg-indigo-100" : "bg-indigo-500/15")}>
                                        <div className={`${nightUtilBar} h-full transition-all`} style={{ width: `${nightUtil}%` }} />
                                      </div>
                                      <span className="text-[9px] text-muted-foreground shrink-0">{(floor.maxCapacityKg - nightKg).toLocaleString()} KG remaining · {nightUtil}%</span>
                                    </div>
                                  </div>
                                  <div className={cn("flex-1 p-2 space-y-1.5 min-h-[90px] rounded-b-2xl", isNightTarget ? "bg-indigo-500/5" : "")}>
                                    {nightRows.length === 0
                                      ? <div className={cn("flex h-full min-h-[70px] items-center justify-center text-[10px] rounded-xl border border-dashed",
                                          isLight ? "border-indigo-200 text-indigo-300" : "border-indigo-500/20 text-indigo-500/40"
                                        )}>Drop here</div>
                                      : interleaveDowntimes(nightRows, makeOrderCard(floor.id))
                                    }
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
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
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{selectedWeekLabel}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className={cn("rounded-xl border p-4", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Planned orders</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{plannedOrders.filter(o => (remainingVolumeByOrderId[o.id] ?? Number(o.volume ?? 0)) > 0).length}</p>
              </div>
              <div className={cn("rounded-xl border p-4", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Assigned</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{assignedMap.size}</p>
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
                    {assignedRightOrders.map(({ order, remainingVolume }) => {
                      const acc = planningAccountMap[order.accountId ?? 0];
                      const company = acc?.company ?? order.accountName ?? "Unknown account";
                      const productName = acc?.productName ?? order.productName ?? null;
                      const productType = acc?.productType ?? order.productType ?? null;
                      const productTypeLabel = productType ?? "—";
                      const totalVol = Number(order.volume ?? 0);
                      const isPartial = remainingVolume < totalVol;
                      return (
                        <div
                          key={order.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDragged({ type: "planned", productionOrderId: order.id });
                          }}
                          className={cn("rounded-xl border p-3 transition-colors cursor-grab",
                            isLight ? "border-slate-200 bg-white hover:border-primary/30" : "border-white/10 bg-black/10 hover:border-white/20"
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
                              <p className="text-sm font-bold text-foreground">{remainingVolume.toLocaleString()} KG</p>
                              {isPartial && <p className="text-[10px] text-amber-400 font-medium">{((remainingVolume / totalVol) * 100).toFixed(0)}% remaining</p>}
                              {!isPartial && <VolumeTag volume={String(totalVol)} />}
                            </div>
                          </div>
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

      {/* ── Partial Assignment Modal ── */}
      <AnimatePresence>
        {partialAssignPending && (() => {
          const order = partialAssignPending.order;
          const speedId = blendSpeedByOrderId[order.id] ?? "";
          const speed = blendSpeeds.find(s => s.id === speedId);
          const remaining = remainingVolumeByOrderId[order.id] ?? Number(order.volume ?? 0);
          const totalVol = Number(order.volume ?? 0);
          const factor = blendSpeedFactor(speedId);
          const suggested = Math.min(remaining, Math.round(partialAssignPending.floor.maxCapacityKg * factor * 10) / 10);
          return (
            <PartialAssignModal
              open={true}
              onClose={() => { setPartialAssignPending(null); setPartialVolume(""); setDragged(null); }}
              floor={partialAssignPending.floor}
              order={{ ...order, volume: totalVol }}
              suggestedVolume={suggested}
              remainingVolume={remaining}
              blendSpeedLabel={speed?.label ?? ""}
              blendSpeedTimeTaken={speed?.timeTaken ?? ""}
              volume={partialVolume}
              onVolumeChange={setPartialVolume}
              onConfirm={handleConfirmPartialAssign}
              isLight={isLight}
              isPending={createAssignmentMutation.isPending}
            />
          );
        })()}
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
              const totalVolume = assignments.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
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
                          .reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
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

                          {/* Floor columns — Day Shift */}
                          <div className="grid border border-t-0 border-slate-200 rounded-b-xl overflow-hidden"
                            style={{ gridTemplateColumns: `repeat(${floors.length || 1}, 1fr)` }}>
                            {floors.map((floor, floorIdx) => {
                              const dayRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === day);
                              const dayKg = dayRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                              const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                              return (
                                <div key={floor.id} className={cn("border-r border-slate-200 last:border-r-0 flex flex-col", floorIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                                  <div className="border-b border-slate-200 px-3 py-2 bg-slate-100">
                                    <p className="text-[11px] font-bold text-slate-700">{floor.floorName}</p>
                                    <p className="text-[10px] text-slate-400">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG/day</p>
                                    {dayRows.length > 0 && (
                                      <div className="mt-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                                        <div className={cn("h-full rounded-full", dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${dayUtil}%` }} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-2 space-y-2 min-h-[100px] flex-1">
                                    {dayRows.length === 0 ? (
                                      <p className="text-[10px] text-slate-300 text-center py-4">—</p>
                                    ) : (
                                      dayRows.map(row => {
                                        const fullOrder = mdpOrderByMdpId.get(row.order.id);
                                        const acc = planningAccountMap[fullOrder?.accountId ?? 0];
                                        const company = acc?.company ?? fullOrder?.accountCompany ?? fullOrder?.accountName ?? "—";
                                        const productName = acc?.productName ?? fullOrder?.productName ?? null;
                                        const totalVol = Number(fullOrder?.volume ?? row.order.volume ?? 0);
                                        const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
                                        return (
                                          <div key={row.assignment.id} className="border border-slate-200 rounded-lg p-2 bg-white">
                                            <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{company}</p>
                                            {productName && <p className="text-[10px] text-slate-500 truncate">{productName}</p>}
                                            <div className="flex items-center justify-between mt-1.5 gap-1">
                                              <span className="text-[10px] font-semibold text-slate-700">
                                                {assignedVol.toLocaleString()} KG
                                                {totalVol > 0 && totalVol !== assignedVol && (
                                                  <span className="text-[9px] font-normal text-slate-400"> / of {totalVol.toLocaleString()}</span>
                                                )}
                                              </span>
                                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", row.order.microbialAnalysis === "Critical" ? "bg-red-100 text-red-700" : row.order.microbialAnalysis === "Important" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>{row.order.microbialAnalysis ?? "Normal"}</span>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
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

                          {/* Night Shift rows — print */}
                          {includeNightShift && day !== "Sat" && (
                            <>
                              <div className="flex items-center gap-2 mt-3 mb-1 px-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Night Shift</span>
                              </div>
                              <div className="grid border border-indigo-200 rounded-xl overflow-hidden"
                                style={{ gridTemplateColumns: `repeat(${floors.length || 1}, 1fr)` }}>
                                {floors.map((floor, floorIdx) => {
                                  const nightDay = `${day}-NS`;
                                  const nightRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === nightDay);
                                  const nightKg = nightRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                                  const nightUtil = Math.min(100, Math.round((nightKg / (floor.maxCapacityKg || 1)) * 100));
                                  return (
                                    <div key={`${floor.id}-NS`} className={cn("border-r border-indigo-100 last:border-r-0 flex flex-col", floorIdx % 2 === 0 ? "bg-indigo-50/30" : "bg-white")}>
                                      <div className="border-b border-indigo-100 px-3 py-2 bg-indigo-100">
                                        <p className="text-[11px] font-bold text-indigo-800">{floor.floorName}</p>
                                        <p className="text-[10px] text-indigo-400">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG/day</p>
                                      </div>
                                      <div className="p-2 space-y-2 min-h-[80px] flex-1">
                                        {nightRows.length === 0 ? (
                                          <p className="text-[10px] text-slate-300 text-center py-4">—</p>
                                        ) : (
                                          nightRows.map(row => {
                                            const fullOrder = mdpOrderByMdpId.get(row.order.id);
                                            const acc = planningAccountMap[fullOrder?.accountId ?? 0];
                                            const company = acc?.company ?? fullOrder?.accountCompany ?? fullOrder?.accountName ?? "—";
                                            const productName = acc?.productName ?? fullOrder?.productName ?? null;
                                            const totalVol = Number(fullOrder?.volume ?? row.order.volume ?? 0);
                                            const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
                                            return (
                                              <div key={row.assignment.id} className="border border-indigo-200 rounded-lg p-2 bg-white">
                                                <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{company}</p>
                                                {productName && <p className="text-[10px] text-slate-500 truncate">{productName}</p>}
                                                <div className="flex items-center justify-between mt-1.5 gap-1">
                                                  <span className="text-[10px] font-semibold text-slate-700">
                                                    {assignedVol.toLocaleString()} KG
                                                    {totalVol > 0 && totalVol !== assignedVol && (
                                                      <span className="text-[9px] font-normal text-slate-400"> / of {totalVol.toLocaleString()}</span>
                                                    )}
                                                  </span>
                                                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", row.order.microbialAnalysis === "Critical" ? "bg-red-100 text-red-700" : row.order.microbialAnalysis === "Important" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>{row.order.microbialAnalysis ?? "Normal"}</span>
                                                </div>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                      {nightRows.length > 0 && (
                                        <div className="border-t border-indigo-100 px-3 py-1.5 bg-indigo-50">
                                          <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-indigo-500">{nightKg.toLocaleString()} KG</span>
                                            <span className={cn("text-[10px] font-bold", nightUtil > 90 ? "text-red-600" : nightUtil > 70 ? "text-amber-600" : "text-indigo-600")}>{nightUtil}% util</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
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
            <Button
              variant="outline"
              onClick={() => setPrintOpen(false)}
              className={isLight ? "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:text-white" : ""}
            >Close</Button>
            <Button onClick={handleDownloadPdf} disabled={isPdfGenerating}>
              {isPdfGenerating ? "Generating…" : "Print"}
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
              .reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(r.order.volume ?? 0)), 0);
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
                <div className={cn("flex-1 overflow-auto p-6 space-y-6", isLight ? "bg-slate-50" : "bg-slate-950")}>
                  {floors.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground/40">No production floors defined.</div>
                  ) : (
                    <>
                      {/* Day Shift */}
                      <div>
                        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${floors.length}, minmax(0, 1fr))` }}>
                          {floors.map(floor => {
                            const dayRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === expandedDay);
                            const dayKg = dayRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                            const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                            const dayBar = dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500";
                            return (
                              <div key={floor.id} className={cn("relative rounded-2xl border flex flex-col", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900")}>
                                {floorDayCautionOverlay(floor, expandedDay!)}
                                <div className={cn("px-4 py-3 border-b rounded-t-2xl", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-foreground">{floor.floorName}</p>
                                      <p className="text-xs text-muted-foreground">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG/day</p>
                                    </div>
                                    {floorStatusButton(floor, expandedDay!)}
                                  </div>
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className={cn("h-1.5 flex-1 rounded-full overflow-hidden", isLight ? "bg-slate-200" : "bg-white/10")}>
                                      <div className={`${dayBar} h-full transition-all`} style={{ width: `${dayUtil}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{(floor.maxCapacityKg - dayKg).toLocaleString()} KG remaining · {dayUtil}%</span>
                                  </div>
                                </div>
                                <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                                  {dayRows.length === 0 ? (
                                    <div className="flex h-full min-h-[80px] items-center justify-center text-sm text-muted-foreground/40">No orders</div>
                                  ) : (
                                    interleaveDowntimes(dayRows, row => {
                                      const fullOrder = mdpOrderByMdpId.get(row.order.id);
                                      const acc = planningAccountMap[fullOrder?.accountId ?? 0];
                                      const company = acc?.company ?? fullOrder?.accountCompany ?? fullOrder?.accountName ?? "Unknown";
                                      const productName = acc?.productName ?? fullOrder?.productName ?? null;
                                      const totalVol = Number(fullOrder?.volume ?? row.order.volume ?? 0);
                                      const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
                                      return (
                                        <div className={cn("rounded-xl border p-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
                                          <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0">
                                              <p className="font-bold text-foreground text-sm truncate">{company}</p>
                                              {productName && <p className="text-xs text-muted-foreground truncate">{productName}</p>}
                                            </div>
                                            <div className="text-right shrink-0">
                                              <span className="text-sm font-bold text-foreground">{assignedVol.toLocaleString()} KG</span>
                                              {totalVol > 0 && totalVol !== assignedVol && (
                                                <div className="text-[10px] text-muted-foreground/70 mt-0.5">of {totalVol.toLocaleString()} total</div>
                                              )}
                                            </div>
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
                      </div>

                      {/* Night Shift — expanded view */}
                      {includeNightShift && expandedDay !== "Sat" && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Moon className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Night Shift</span>
                          </div>
                          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${floors.length}, minmax(0, 1fr))` }}>
                            {floors.map(floor => {
                              const nightDay = `${expandedDay}-NS`;
                              const nightRows = floorOrder(floor.id).filter(r => r.assignment.assignedDay === nightDay);
                              const nightKg = nightRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                              const nightUtil = Math.min(100, Math.round((nightKg / (floor.maxCapacityKg || 1)) * 100));
                              const nightBar = nightUtil > 90 ? "bg-red-500" : nightUtil > 70 ? "bg-amber-500" : "bg-indigo-500";
                              return (
                                <div key={`${floor.id}-NS`} className={cn("relative rounded-2xl border flex flex-col", isLight ? "border-indigo-100 bg-indigo-50/40" : "border-indigo-500/20 bg-indigo-500/5")}>
                                  {floorDayCautionOverlay(floor, nightDay)}
                                  <div className={cn("px-4 py-3 border-b rounded-t-2xl", isLight ? "border-indigo-100 bg-indigo-50" : "border-indigo-500/20 bg-indigo-500/10")}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold text-foreground">{floor.floorName}</p>
                                        <p className="text-xs text-muted-foreground">{floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG/day</p>
                                      </div>
                                      {floorStatusButton(floor, nightDay)}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <div className={cn("h-1.5 flex-1 rounded-full overflow-hidden", isLight ? "bg-indigo-100" : "bg-indigo-500/15")}>
                                        <div className={`${nightBar} h-full transition-all`} style={{ width: `${nightUtil}%` }} />
                                      </div>
                                      <span className="text-xs text-muted-foreground">{(floor.maxCapacityKg - nightKg).toLocaleString()} KG remaining · {nightUtil}%</span>
                                    </div>
                                  </div>
                                  <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                                    {nightRows.length === 0 ? (
                                      <div className="flex h-full min-h-[80px] items-center justify-center text-sm text-muted-foreground/40">No night shift orders</div>
                                    ) : (
                                      interleaveDowntimes(nightRows, row => {
                                        const fullOrder = mdpOrderByMdpId.get(row.order.id);
                                        const acc = planningAccountMap[fullOrder?.accountId ?? 0];
                                        const company = acc?.company ?? fullOrder?.accountCompany ?? fullOrder?.accountName ?? "Unknown";
                                        const productName = acc?.productName ?? fullOrder?.productName ?? null;
                                        const totalVol = Number(fullOrder?.volume ?? row.order.volume ?? 0);
                                        const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
                                        return (
                                          <div className={cn("rounded-xl border p-3", isLight ? "border-indigo-100 bg-white" : "border-indigo-500/20 bg-indigo-500/5")}>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                              <div className="min-w-0">
                                                <p className="font-bold text-foreground text-sm truncate">{company}</p>
                                                {productName && <p className="text-xs text-muted-foreground truncate">{productName}</p>}
                                              </div>
                                              <div className="text-right shrink-0">
                                                <span className="text-sm font-bold text-foreground">{assignedVol.toLocaleString()} KG</span>
                                                {totalVol > 0 && totalVol !== assignedVol && (
                                                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">of {totalVol.toLocaleString()} total</div>
                                                )}
                                              </div>
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
                        </div>
                      )}
                    </>
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
  const [selectedWeek, setSelectedWeek] = React.useState<string>(getCurrentWeekLabel());
  const [pendingSearch, setPendingSearch] = React.useState("");
  const [historySearch, setHistorySearch] = React.useState("");
  const [splitPct, setSplitPct] = React.useState(38);
  const [clearConfirm, setClearConfirm] = React.useState<"pending" | "history" | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

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
    queryKey: ["/api/mdp/produced-orders", view, selectedWeek],
    queryFn: async () => {
      const params = new URLSearchParams({ view });
      if (view === "weekly") params.set("week", selectedWeek);
      const res = await fetch(`${BASE}api/mdp/produced-orders?${params}`, {
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

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/mdp/produced-orders`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to clear history");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders"] });
      setClearConfirm(null);
      toast({ title: "History cleared", description: "All production history records have been removed." });
    },
    onError: () => toast({ title: "Error", description: "Could not clear history.", variant: "destructive" }),
  });

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

  const filteredPending = React.useMemo(() => {
    const term = pendingSearch.trim().toLowerCase();
    if (!term) return pendingOrders;
    return pendingOrders.filter(o => {
      const acc = historyAccountMap[o.accountId ?? 0];
      return [acc?.company ?? o.accountName ?? "", acc?.productName ?? o.productName ?? "", o.productType ?? ""]
        .join(" ").toLowerCase().includes(term);
    });
  }, [pendingOrders, pendingSearch, historyAccountMap]);

  const filteredHistory = React.useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    if (!term) return producedOrders;
    return producedOrders.filter(o =>
      [o.accountName, o.productName, o.productType, o.deliveryStatus].join(" ").toLowerCase().includes(term)
    );
  }, [producedOrders, historySearch]);

  const rangeLabel = React.useMemo(() => {
    if (view === "weekly") {
      const [yr, wk] = selectedWeek.split("-W").map(Number);
      const jan1 = new Date(yr, 0, 1);
      const dayOffset = (wk - 1) * 7 - jan1.getDay() + 1;
      const start = new Date(yr, 0, 1 + dayOffset);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return getHistoryRangeLabel(view);
  }, [view, selectedWeek]);

  const startDrag = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(70, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPct(pct);
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  if (producedHistoryQuery.isLoading) {
    return <PageLoader />;
  }

  const inputCls = cn("h-8 pl-8 pr-3 rounded-lg border text-xs w-full focus:outline-none focus:ring-2 focus:ring-primary/50",
    isLight ? "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground");

  return (
    <div className="space-y-4">
      {/* ── Confirm clear dialog ── */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={cn("rounded-2xl border p-6 w-80 shadow-2xl", isLight ? "bg-white border-slate-200" : "bg-[#0f1117] border-white/10")}>
            <h3 className="text-sm font-bold text-foreground mb-2">
              {clearConfirm === "history" ? "Clear Production History?" : "Clear Pending Orders view?"}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {clearConfirm === "history"
                ? "This will permanently delete all production history records."
                : "This will clear the search filter on pending orders."}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setClearConfirm(null)} className={cn("px-4 py-2 rounded-xl text-xs font-medium border", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>Cancel</button>
              <button onClick={() => {
                if (clearConfirm === "history") clearHistoryMutation.mutate();
                else { setPendingSearch(""); setClearConfirm(null); }
              }} className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600">
                {clearHistoryMutation.isPending ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Split layout: Pending (left) | History (right) ── */}
      <div ref={containerRef} className={cn("flex min-h-[640px] rounded-2xl border overflow-hidden select-none", isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5")}>

        {/* ── LEFT: Pending Orders ── */}
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
          <div className={cn("px-4 py-3 border-b shrink-0", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Pending Orders</h3>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", pendingOrders.length > 0 ? "bg-amber-500/10 text-amber-400" : isLight ? "bg-slate-100 text-slate-500" : "bg-white/5 text-muted-foreground")}>
                  {filteredPending.length}
                </span>
              </div>
              <button onClick={() => setClearConfirm("pending")} className="text-[10px] text-red-400 hover:text-red-300 font-medium">Clear</button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} placeholder="Search pending orders…" className={inputCls} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredPending.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">{pendingOrders.length === 0 ? "All orders planned" : "No results"}</p>
                  <p className="text-xs text-muted-foreground mt-1">{pendingOrders.length === 0 ? "No pending production orders." : "Try a different search term."}</p>
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
                  {filteredPending.map(order => {
                    const acc = historyAccountMap[order.accountId ?? 0];
                    const company = acc?.company ?? order.accountName ?? order.accountCompany ?? "—";
                    const productName = acc?.productName ?? order.productName ?? null;
                    const productTypeKey = acc?.productType ?? order.productType ?? null;
                    const rawMat = order.rawMaterialStatus ?? "Pending";
                    return (
                      <tr key={order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-foreground text-xs leading-tight truncate max-w-[130px]">{company}</p>
                          {productName && <p className="text-[10px] text-muted-foreground truncate max-w-[130px]">{productName}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-muted-foreground">{productTypeKey ?? "—"}</td>
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

        {/* ── DRAG HANDLE ── */}
        <div onMouseDown={startDrag}
          className={cn("w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group transition-colors",
            isLight ? "bg-slate-200 hover:bg-primary/30" : "bg-white/10 hover:bg-primary/40")}>
          <div className={cn("w-0.5 h-8 rounded-full transition-colors", isLight ? "bg-slate-400 group-hover:bg-primary" : "bg-white/20 group-hover:bg-primary")} />
        </div>

        {/* ── RIGHT: Production History ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className={cn("px-4 py-3 border-b shrink-0", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Production History</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Viewing: {rangeLabel}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
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
                <button onClick={() => setClearConfirm("history")} className="text-[10px] text-red-400 hover:text-red-300 font-medium h-8 px-2">Clear History</button>
              </div>
            </div>
            {view === "weekly" && (
              <div className="flex items-center gap-2 mb-2">
                <label className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">Week:</label>
                <input type="week" value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
                  className={cn("h-7 px-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                    isLight ? "bg-white border-slate-200 text-slate-800" : "bg-black/20 border-white/10 text-foreground [color-scheme:dark]")} />
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search history…" className={inputCls} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredHistory.length === 0 ? (
              <div className="flex h-full items-center justify-center p-10 text-center">
                <div>
                  <p className="text-base font-semibold text-foreground">{producedOrders.length === 0 ? "No production history yet." : "No results"}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{producedOrders.length === 0 ? "Click \"Produced\" on any floor assignment in Production Planning." : "Try a different search term."}</p>
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
                  {filteredHistory.map((order) => (
                    <tr key={order.id} className={cn("border-b last:border-0 transition-colors", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-foreground text-sm leading-tight">{order.accountName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{order.productName}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{order.productType ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-sm">{Number(order.volume ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(order.producedAt)}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                          order.deliveryStatus === "Delivered" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          order.deliveryStatus === "Stored in Warehouse" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          order.deliveryStatus === "In process" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                          "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          {order.deliveryStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={cn("px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors",
                              isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
                            )}>Update Status ▾</button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[190px]">
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "Delivered" })}>Mark as Delivered</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "Stored in Warehouse" })}>Stored in Warehouse</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deliverMutation.mutate({ id: order.id, status: "In process" })}>In process</DropdownMenuItem>
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
  const typeOpts = useCustomOptions("productType", DEFAULT_PRODUCT_TYPES);

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
    const totalVolume = products.reduce((sum, a) => sum + parseFloat(a.volume || "0"), 0);
    const averageVolume = total ? Math.round(totalVolume / total) : 0;
    const recentCount = products.filter((a) => {
      const date = new Date(a.createdAt);
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);
      return date >= threshold;
    }).length;
    return { total, averageVolume, urgentCount, recentCount, totalVolume };
  }, [products]);

  const openEditForm = (account: Account) => {
    setEditingProduct(account);
    setFormValues({
      company: account.company,
      productName: account.productName ?? "",
      productType: account.productType ?? "",
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Total accounts", value: summary.total },
                  { label: "Urgent", value: summary.urgentCount },
                  { label: "Total volume", value: `${summary.totalVolume.toLocaleString()} kg` },
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
                          {account.productType ?? "—"}
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
                                <CustomOptionsSelect
                                  value={formValues.productType}
                                  onChange={v => setFormValues(p => ({ ...p, productType: v }))}
                                  handle={typeOpts}
                                  displayFn={displayLabel}
                                  placeholder="Select product type…"
                                  isLight={isLight}
                                />
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
                                <CustomOptionsSelect
                                  value={formValues.productType}
                                  onChange={v => setFormValues(p => ({ ...p, productType: v }))}
                                  handle={typeOpts}
                                  displayFn={displayLabel}
                                  placeholder="Select product type…"
                                  isLight={isLight}
                                />
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
