import * as React from "react";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  Package,
  Plus,
  Edit3,
  Trash2,
  Download,
  Search,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { PlannedOrdersProvider, usePlannedOrders } from "./planned-orders-context";

const BASE = import.meta.env.BASE_URL;

type CustomerProduct = {
  id: number;
  accountName: string;
  company: string;
  productType: string;
  urgency: string;
  priority: string;
  volume: number;
  accountManager: string | null;
  dateAdded: string;
  lastUpdated: string;
};

type ProductionOrder = {
  id: number;
  accountId?: number;
  accountName?: string;
  accountCompany?: string | null;
  productName?: string | null;
  productType?: string | null;
  volume?: number | string | null;
  expectedDeliveryDate?: string | null;
  rawMaterialStatus?: "Available" | "Pending" | string;
  microbialAnalysis?: string | null;
  remarks?: string | null;
  orderStatus?: string | null;
  isPlanned?: boolean;
};

const DEFAULT_FORM = {
  accountName: "",
  company: "",
  productType: "",
  urgency: "normal",
  priority: "medium",
  volume: "0",
  accountManager: "",
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

function downloadCsv(products: CustomerProduct[]) {
  const headers = ["Account Name", "Company", "Product Type", "Urgency", "Priority", "Volume", "Account Manager", "Date Added", "Last Updated"];
  const rows = products.map((product) => [
    product.accountName,
    product.company,
    product.productType,
    product.urgency,
    product.priority,
    String(product.volume),
    product.accountManager ?? "-",
    formatDate(product.dateAdded),
    formatDate(product.lastUpdated),
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
  blenderCapacityKg?: number;
};

type FloorAssignmentRow = {
  assignment: {
    id: number;
    floorId: number;
    productionOrderId: number;
    weekLabel: string;
    assignedDay: string;
    shift: string;
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
  shift: string;
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
  weekLabel: string
): FloorAssignmentPayload[] {
  const eligibleOrders = unassignedOrders
    .filter((order) => order.rawMaterialStatus === "Available")
    .slice()
    .sort((a, b) => {
      const priority = getMicrobialPriority(a.microbialAnalysis) - getMicrobialPriority(b.microbialAnalysis);
      if (priority !== 0) return priority;
      return Number(b.volume ?? 0) - Number(a.volume ?? 0);
    });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const assignments: FloorAssignmentPayload[] = [];

  for (const floor of floors) {
    const dayUsage = dayNames.reduce<Record<string, number>>((acc, day) => {
      acc[day] = 0;
      return acc;
    }, {} as Record<string, number>);

    const qualified = eligibleOrders.filter((order) => isAssignEligibleForFloor(order, floor.blendCategory));

    const remaining = [...qualified];
    const takeNext = (preferredCategories: string[]) => {
      const index = remaining.findIndex((order) => preferredCategories.includes(getOrderCategory(order)));
      if (index >= 0) {
        return remaining.splice(index, 1)[0];
      }
      return remaining.shift();
    };

    for (const day of dayNames) {
      let assigned = true;
      while (assigned) {
        assigned = false;
        if (!remaining.length) break;
        const order = (() => {
          if (floor.blendCategory === "Sweet/Savory") {
            if (["Mon", "Tue", "Wed"].includes(day)) {
              return takeNext(["Dairy Premix", "Bread Premix"]);
            }
            return takeNext(["Seasoning"]);
          }
          if (floor.blendCategory === "Savory/Sweet") {
            return takeNext(["Seasoning", "Savoury Flavours", "Bread Premix", "Dairy Premix"]);
          }
          if (floor.blendCategory === "Savory") {
            return takeNext(["Seasoning", "Savoury Flavours"]);
          }
          return remaining.shift();
        })();

        if (!order) break;

        const nextVolume = (dayUsage[day] ?? 0) + Number(order.volume ?? 0);
        if (nextVolume <= floor.maxCapacityKg) {
          dayUsage[day] = nextVolume;
          assignments.push({
            floor_id: floor.id,
            production_order_id: order.id,
            week_label: weekLabel,
            assigned_day: day,
            shift: "Day",
          });
          assigned = true;
        } else {
          remaining.unshift(order);
          break;
        }
      }
    }
  }

  return assignments;
}

function ProductionOrdersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { addPlannedOrder, removePlannedOrder, isPlanningOrder } = usePlannedOrders();
  const [searchOrders, setSearchOrders] = React.useState("");
  const [remarksById, setRemarksById] = React.useState<Record<number, string>>({});
  const [microbialById, setMicrobialById] = React.useState<Record<number, string>>({});
  const [statusById, setStatusById] = React.useState<Record<number, string>>({});

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
  const productionOrders = productionOrdersQuery.data ?? [];
  const ordersLoading = productionOrdersQuery.isLoading;

  React.useEffect(() => {
    if (!productionOrders.length) return;

    setRemarksById((current) => {
      const next = { ...current };
      productionOrders.forEach((order) => {
        if (!(order.id in next)) {
          next[order.id] = order.remarks ?? "";
        }
      });
      return next;
    });
    setMicrobialById((current) => {
      const next = { ...current };
      productionOrders.forEach((order) => {
        if (!(order.id in next)) {
          next[order.id] = order.microbialAnalysis ?? "Normal";
        }
      });
      return next;
    });
    setStatusById((current) => {
      const next = { ...current };
      productionOrders.forEach((order) => {
        if (!(order.id in next)) {
          next[order.id] = order.orderStatus ?? "Ordered";
        }
      });
      return next;
    });
    productionOrders.forEach((order) => {
      if (order.isPlanned) {
        addPlannedOrder(order.id);
      }
    });
  }, [productionOrders, addPlannedOrder]);

  const productionUpdate = useMutation({
    mutationFn: async ({ orderId, changes }: { orderId: number; changes: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}api/mdp/production-orders/${orderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to save production order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
    },
  });

  const floorAssignment = useMutation({
    mutationFn: async (payload: { productionOrderId: number; weekLabel: string; planStatus: string }) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create floor assignment");
      }
      return res.json();
    },
  });

  const handleChangeRemarks = (orderId: number, value: string) => {
    setRemarksById((current) => ({ ...current, [orderId]: value }));
  };

  const saveRemarks = async (orderId: number) => {
    const remarks = remarksById[orderId] ?? "";
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { remarks } });
      toast({ title: "Remarks saved" });
    } catch (error: any) {
      toast({ title: "Could not save remarks", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const handleChangeMicrobial = async (orderId: number, value: string) => {
    setMicrobialById((current) => ({ ...current, [orderId]: value }));
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { microbialAnalysis: value } });
      toast({ title: "Microbial analysis updated" });
    } catch (error: any) {
      toast({ title: "Could not save microbial analysis", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const handleChangeStatus = async (orderId: number, value: string) => {
    setStatusById((current) => ({ ...current, [orderId]: value }));
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: value, isPlanned: value === "Planned" } });
      if (value === "Planned") {
        addPlannedOrder(orderId);
      } else {
        removePlannedOrder(orderId);
      }
      toast({ title: "Status saved" });
    } catch (error: any) {
      toast({ title: "Could not save status", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const handlePlanNow = async (orderId: number) => {
    const weekLabel = getCurrentWeekLabel();
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: "Planned", isPlanned: true } });
      await floorAssignment.mutateAsync({ productionOrderId: orderId, weekLabel, planStatus: "Planned" });
      addPlannedOrder(orderId);
      toast({ title: "Order planned", description: "This order is now scheduled for floor assignment." });
    } catch (error: any) {
      toast({ title: "Could not plan order", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const handleSetOrdered = async (orderId: number) => {
    try {
      await productionUpdate.mutateAsync({ orderId, changes: { orderStatus: "Ordered", isPlanned: false } });
      removePlannedOrder(orderId);
      toast({ title: "Order reset", description: "The order has been moved back to Ordered." });
    } catch (error: any) {
      toast({ title: "Could not reset order", description: error?.message || "Try again.", variant: "destructive" });
    }
  };

  const tableOrders = React.useMemo(() => {
    const term = searchOrders.trim().toLowerCase();
    return productionOrders.filter((order) => {
      if (!term) return true;
      return [
        getOrderAccountText(order),
        getOrderProductText(order),
        order.productType ?? "",
        String(order.volume ?? ""),
        order.remarks ?? "",
        order.orderStatus ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [productionOrders, searchOrders]);

  if (ordersLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid gap-2">
          <h2 className="text-lg font-semibold text-foreground">New Production Orders</h2>
          <p className="text-sm text-muted-foreground">Manage demand plan updates, auto-save microbial analysis, remarks, and order status inline.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadProductionOrdersCsv(tableOrders)}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => downloadProductionOrdersXlsx(tableOrders)}>
            <Download className="mr-2 h-4 w-4" /> Export XLSX
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchOrders}
            onChange={(event) => setSearchOrders(event.target.value)}
            placeholder="Search orders..."
            className="pl-10"
          />
        </div>
      </div>

      <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono">Order ID</TableHead>
              <TableHead>Account / Product</TableHead>
              <TableHead>Product Type</TableHead>
              <TableHead className="text-right">Volume (KG)</TableHead>
              <TableHead>Raw Material</TableHead>
              <TableHead>Microbial Analysis</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No production orders match the current search.
                </TableCell>
              </TableRow>
            ) : (
              tableOrders.map((order) => {
                const remarks = remarksById[order.id] ?? order.remarks ?? "";
                const microbial = microbialById[order.id] ?? order.microbialAnalysis ?? "Normal";
                const status = statusById[order.id] ?? order.orderStatus ?? "Ordered";
                const rawMaterial = getRawMaterialStatus(order);
                const planned = order.isPlanned || isPlanningOrder(order.id);

                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{order.id}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium text-foreground">{getOrderAccountText(order)}</div>
                        <div className="text-sm text-muted-foreground">{getOrderProductText(order)}</div>
                      </div>
                    </TableCell>
                    <TableCell>{order.productType ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(order.volume ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={rawMaterial === "Available" ? "success" : "warning"}>
                        {rawMaterial}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${getMicrobialColor(microbial)}`} />
                        <select
                          value={microbial}
                          onChange={(event) => handleChangeMicrobial(order.id, event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/10 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          {MICROBIAL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={remarks}
                        onChange={(event) => handleChangeRemarks(order.id, event.target.value)}
                        onBlur={() => saveRemarks(order.id)}
                        placeholder="Add remarks…"
                        className="min-w-[220px]"
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        value={status}
                        onChange={(event) => handleChangeStatus(order.id, event.target.value)}
                        className={`rounded-full border px-3 py-1 text-sm font-semibold ${getStatusClasses(status)}`}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className={`rounded-full min-w-[92px] px-4 ${planned ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : ""}`}
                          >
                            {planned ? "✓ Planned" : "Select"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52">
                          <div className="space-y-2">
                            <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => handleSetOrdered(order.id)}>
                              Ordered
                            </Button>
                            <Button variant="default" size="sm" className="w-full justify-start" onClick={() => handlePlanNow(order.id)}>
                              Plan Now
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          <TableCaption className="text-muted-foreground">
            Showing {tableOrders.length} of {productionOrders.length} production orders.
          </TableCaption>
        </Table>
      </div>
    </div>
  );
}

function ProductionPlanningTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedWeekLabel, setSelectedWeekLabel] = React.useState("");
  const [splitPercent, setSplitPercent] = React.useState(55);
  const [isDividerDragging, setIsDividerDragging] = React.useState(false);
  const [floorModalOpen, setFloorModalOpen] = React.useState(false);
  const [editFloorModalOpen, setEditFloorModalOpen] = React.useState(false);
  const [editingFloor, setEditingFloor] = React.useState<ProductionFloor | null>(null);
  const [floorForm, setFloorForm] = React.useState({
    floorName: "",
    blendCategory: "Sweet" as ProductionFloor["blendCategory"],
    maxCapacityKg: "0",
    blenderCapacityKg: "0",
  });
  const [editFloorForm, setEditFloorForm] = React.useState({
    floorName: "",
    blendCategory: "Sweet" as ProductionFloor["blendCategory"],
    maxCapacityKg: "0",
    blenderCapacityKg: "0",
  });
  const [includeNightShift, setIncludeNightShift] = React.useState(false);
  const [assistedState, setAssistedState] = React.useState<"idle" | "optimizing" | "done">("idle");
  const [printOpen, setPrintOpen] = React.useState(false);
  const [dragged, setDragged] = React.useState<{
    type: "planned" | "assigned";
    productionOrderId: number;
    assignmentId?: number;
    floorId?: number;
  } | null>(null);
  const [localFloorOrder, setLocalFloorOrder] = React.useState<Record<number, number[]>>({});
  const [dragOverTarget, setDragOverTarget] = React.useState<{ floorId: number; day: string; shift: string } | null>(null);

  const now = React.useMemo(() => new Date(), []);
  const weeks = React.useMemo(() => getWorkingWeeksForMonth(now.getFullYear(), now.getMonth()), [now]);
  const defaultWeekLabel = React.useMemo(() => {
    return (
      weeks.find((week) => week.days.some((day) => sameDate(day, now)))?.weekLabel ?? weeks[0]?.weekLabel ?? ""
    );
  }, [now, weeks]);

  React.useEffect(() => {
    if (!selectedWeekLabel && defaultWeekLabel) {
      setSelectedWeekLabel(defaultWeekLabel);
    }
  }, [defaultWeekLabel, selectedWeekLabel]);

  const selectedWeek = React.useMemo(
    () => weeks.find((w) => w.weekLabel === selectedWeekLabel),
    [weeks, selectedWeekLabel]
  );
  const weekDays = selectedWeek?.days ?? [];
  const dayAbbrevs = ["Mon", "Tue", "Wed", "Thu", "Fri"];

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

  const floors = floorsQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const plannedOrders = React.useMemo(
    () => (productionOrdersQuery.data ?? []).filter((order) => order.isPlanned),
    [productionOrdersQuery.data]
  );

  const mdpOrderById = React.useMemo(
    () => new Map((productionOrdersQuery.data ?? []).map((o) => [o.id, o])),
    [productionOrdersQuery.data]
  );

  const assignmentsByFloor = React.useMemo(() => {
    const map = new Map<number, FloorAssignmentRow[]>();
    assignments.forEach((row) => {
      const floorId = row.floor?.id ?? row.assignment.floorId;
      if (!map.has(floorId)) {
        map.set(floorId, []);
      }
      map.get(floorId)!.push(row);
    });
    return map;
  }, [assignments]);

  const assignmentsByFloorDayShift = React.useMemo(() => {
    const map = new Map<string, FloorAssignmentRow[]>();
    assignments.forEach((row) => {
      const floorId = row.floor?.id ?? row.assignment.floorId;
      const day = row.assignment.assignedDay ?? "Mon";
      const shift = row.assignment.shift ?? "Day";
      const key = `${floorId}-${day}-${shift}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
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
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create production floor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-floors"] });
      setFloorModalOpen(false);
      setFloorForm({ floorName: "", blendCategory: "Sweet", maxCapacityKg: "0", blenderCapacityKg: "0" });
      toast({ title: "Floor added", description: "New production floor was created." });
    },
    onError: (error: any) => {
      toast({ title: "Could not add floor", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const updateFloorMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/production-floors/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update production floor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-floors"] });
      setEditFloorModalOpen(false);
      setEditingFloor(null);
      toast({ title: "Floor updated" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update floor", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const deleteFloorMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/production-floors/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete floor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-floors"] });
      toast({ title: "Floor deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Could not delete floor", description: error?.message || "Try again.", variant: "destructive" });
    },
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
    mutationFn: async ({
      assignmentId,
      orderId,
      floorId,
      shift,
      enrichedOrder,
    }: {
      assignmentId: number;
      orderId: number;
      floorId?: number;
      shift?: string;
      enrichedOrder?: ProductionOrder | null;
    }) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments/${assignmentId}/produce`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to mark assignment produced");
      }
      const order = enrichedOrder ?? mdpOrderById.get(orderId);
      await fetch(`${BASE}api/mdp/produced-orders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          productionOrderId: orderId,
          accountName: order?.accountCompany ?? order?.accountName ?? `Account ${order?.accountId ?? orderId}`,
          productName: order?.productName ?? order?.productType ?? "Unknown",
          productType: order?.productType ?? "Unknown",
          volume: Number(order?.volume ?? 0),
          floorId: floorId ?? null,
          producedAt: new Date().toISOString(),
          deliveryStatus: "Pending",
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
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/produced-orders"] });
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

  const handleAddFloor = () => {
    createFloorMutation.mutate({
      floorName: floorForm.floorName,
      blendCategory: floorForm.blendCategory,
      maxCapacityKg: Number(floorForm.maxCapacityKg),
      blenderCapacityKg: Number(floorForm.blenderCapacityKg),
    });
  };

  const handleEditFloor = (floor: ProductionFloor) => {
    setEditingFloor(floor);
    setEditFloorForm({
      floorName: floor.floorName,
      blendCategory: floor.blendCategory,
      maxCapacityKg: String(floor.maxCapacityKg),
      blenderCapacityKg: String(floor.blenderCapacityKg ?? 0),
    });
    setEditFloorModalOpen(true);
  };

  const handleUpdateFloor = () => {
    if (!editingFloor) return;
    updateFloorMutation.mutate({
      id: editingFloor.id,
      floorName: editFloorForm.floorName,
      blendCategory: editFloorForm.blendCategory,
      maxCapacityKg: Number(editFloorForm.maxCapacityKg),
      blenderCapacityKg: Number(editFloorForm.blenderCapacityKg),
    });
  };

  const handleDropOnFloorDayShift = async (floor: ProductionFloor, day: string, shift: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverTarget(null);
    if (!dragged) return;
    const allOrders = productionOrdersQuery.data ?? [];
    const plannedOrder = allOrders.find((o) => o.id === dragged.productionOrderId);
    if (!plannedOrder) return;

    if (dragged.type === "planned") {
      await createAssignmentMutation.mutateAsync({
        floorId: floor.id,
        productionOrderId: dragged.productionOrderId,
        weekLabel: selectedWeekLabel,
        assignedDay: day,
        shift,
        planStatus: "Planned",
      });
      toast({ title: "Order assigned", description: `Assigned to ${floor.floorName} (${shift} Shift) on ${day}.` });
    }

    if (dragged.type === "assigned" && dragged.assignmentId && dragged.floorId !== undefined) {
      if (dragged.floorId !== floor.id) {
        await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
        await createAssignmentMutation.mutateAsync({
          floorId: floor.id,
          productionOrderId: dragged.productionOrderId,
          weekLabel: selectedWeekLabel,
          assignedDay: day,
          shift,
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

  const handleProduce = async (assignmentId: number, orderId: number, floorId?: number, shift?: string, enrichedOrder?: ProductionOrder | null) => {
    try {
      await produceAssignmentMutation.mutateAsync({ assignmentId, orderId, floorId, shift, enrichedOrder });
      toast({ title: "Produced", description: "The assigned order has been moved to production history." });
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

  const handleAssistedPlanning = async () => {
    setAssistedState("optimizing");
    try {
      const unassignedOrders = plannedOrders.filter((order) => !assignedMap.has(order.id));
      const assignmentPayloads = buildOptimizedAssignments(floors, unassignedOrders, selectedWeekLabel);
      await Promise.all(
        assignmentPayloads.map((payload) =>
          fetch(`${BASE}api/mdp/floor-assignments`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              floorId: payload.floor_id,
              productionOrderId: payload.production_order_id,
              weekLabel: payload.week_label,
              assignedDay: payload.assigned_day,
              shift: payload.shift ?? "Day",
              planStatus: "Planned",
            }),
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments", selectedWeekLabel] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      setAssistedState("done");
      window.setTimeout(() => setAssistedState("idle"), 3000);
      toast({ title: "Plan Optimized", description: "Planned orders have been assigned." });
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

  const printStyles = `@media print { body * { visibility: hidden; } #print-schedule, #print-schedule * { visibility: visible; } #print-schedule { position: fixed; top: 0; left: 0; width: 100%; background: white !important; color: black !important; color-adjust: exact; -webkit-print-color-adjust: exact; } }`;

  const getFloorDayShiftRows = (floorId: number, day: string, shift: string) =>
    assignmentsByFloorDayShift.get(`${floorId}-${day}-${shift}`) ?? [];

  const renderFloorCard = (floor: ProductionFloor, day: string, shift: "Day" | "Night") => {
    const rows = getFloorDayShiftRows(floor.id, day, shift);
    const totalKg = rows.reduce((sum, row) => {
      const enriched = mdpOrderById.get(row.assignment.productionOrderId);
      return sum + Number(enriched?.volume ?? row.order?.volume ?? 0);
    }, 0);
    const remaining = (floor.maxCapacityKg ?? 0) - totalKg;
    const progress = Math.min(100, Math.round((totalKg / (floor.maxCapacityKg || 1)) * 100));
    const barClass = progress > 90 ? "bg-red-500" : progress > 70 ? "bg-amber-500" : "bg-emerald-500";
    const isOver = dragOverTarget?.floorId === floor.id && dragOverTarget?.day === day && dragOverTarget?.shift === shift;

    return (
      <div
        key={`${floor.id}-${day}-${shift}`}
        className={`rounded-2xl border p-3 transition-colors ${isOver ? (shift === "Night" ? "border-indigo-500/70 bg-indigo-500/5" : "border-primary/70 bg-primary/5") : "border-white/10 bg-black/5"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOverTarget({ floorId: floor.id, day, shift }); }}
        onDragLeave={() => setDragOverTarget((t) => (t?.floorId === floor.id && t?.day === day && t?.shift === shift ? null : t))}
        onDrop={(e) => handleDropOnFloorDayShift(floor, day, shift, e)}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-xs font-semibold text-foreground leading-tight">{floor.floorName}</p>
            <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">{floor.blendCategory}</Badge>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-foreground">{remaining} KG left</p>
            <p className="text-[10px] text-muted-foreground">of {floor.maxCapacityKg} KG</p>
          </div>
        </div>
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className={`${barClass} h-full transition-all`} style={{ width: `${progress}%` }} />
        </div>
        <div className="min-h-[60px] rounded-xl border border-dashed border-white/10 bg-black/5 p-2 space-y-1.5">
          {rows.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">Drop orders here</p>
          ) : (
            rows.map((row) => {
              const enriched = mdpOrderById.get(row.assignment.productionOrderId) ?? row.order;
              return (
                <div
                  key={row.assignment.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragged({ type: "assigned", productionOrderId: row.assignment.productionOrderId, assignmentId: row.assignment.id, floorId: floor.id });
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{enriched?.accountCompany ?? enriched?.accountName ?? `Account ${enriched?.accountId ?? "?"}`}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{enriched?.productName ?? enriched?.productType ?? "-"}</p>
                    </div>
                    <p className="text-xs font-semibold shrink-0">{Number(enriched?.volume ?? 0)} KG</p>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => handleUnassign(row.assignment.id)}>Unplan</Button>
                    <Button variant="secondary" size="sm" className="h-6 px-2 text-[10px]" onClick={() => handleProduce(row.assignment.id, row.assignment.productionOrderId, floor.id, shift, enriched)}>Produced</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  if (floorsQuery.isLoading || assignmentsQuery.isLoading || productionOrdersQuery.isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <style>{printStyles}</style>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Label htmlFor="week-selector">Choose a week</Label>
          <select
            id="week-selector"
            value={selectedWeekLabel}
            onChange={(event) => setSelectedWeekLabel(event.target.value)}
            className="h-11 rounded-2xl border border-white/10 bg-black/10 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {weeks.map((week) => (
              <option key={week.weekLabel} value={week.weekLabel}>
                {week.weekLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none rounded-xl border border-white/10 px-3 py-2">
            <input
              type="checkbox"
              checked={includeNightShift}
              onChange={(e) => setIncludeNightShift(e.target.checked)}
              className="accent-primary"
            />
            🌙 Night Shift
          </label>
          <Button
            variant="secondary"
            onClick={handleAssistedPlanning}
            disabled={assistedState === "optimizing" || !!assignedMap.size === false}
          >
            {assistedState === "optimizing" ? "Optimizing…" : assistedState === "done" ? "✓ Plan Optimized" : "Assisted Planning"}
          </Button>
          <Button variant="secondary" onClick={() => setPrintOpen(true)}>
            Print Week Schedule
          </Button>
        </div>
      </div>

      <div id="planning-split-container" className="relative flex min-h-[720px] rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
        {/* LEFT: Production Floors — day-first layout */}
        <div style={{ width: `${splitPercent}%` }} className="overflow-y-auto border-r border-white/10 p-5">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Production Floors</h2>
              <p className="text-sm text-muted-foreground">Drag planned orders into floor boxes to schedule production.</p>
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
                      className="h-11 w-full rounded-2xl border border-white/10 bg-black/10 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <option value="Sweet">Sweet</option>
                      <option value="Savory">Savory</option>
                      <option value="Sweet/Savory">Sweet/Savory</option>
                      <option value="Savory/Sweet">Savory/Sweet</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="maxCapacityKg">Max Floor Capacity (KG)</Label>
                      <Input
                        id="maxCapacityKg"
                        type="number"
                        min={0}
                        value={floorForm.maxCapacityKg}
                        onChange={(event) => setFloorForm((prev) => ({ ...prev, maxCapacityKg: event.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="blenderCapacityKg">Blender Capacity (KG)</Label>
                      <Input
                        id="blenderCapacityKg"
                        type="number"
                        min={0}
                        value={floorForm.blenderCapacityKg}
                        onChange={(event) => setFloorForm((prev) => ({ ...prev, blenderCapacityKg: event.target.value }))}
                        placeholder="0"
                      />
                    </div>
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

          {/* Day-first schedule layout */}
          {floors.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/5 p-8 text-center text-sm text-muted-foreground">
              No floors defined yet. Add a production floor to begin scheduling.
            </div>
          ) : weekDays.length === 0 ? (
            <div className="text-sm text-muted-foreground">Select a week to view the schedule.</div>
          ) : (
            <div className="space-y-6">
              {weekDays.map((date, dayIdx) => {
                const dayAbbrev = dayAbbrevs[dayIdx];
                const dateLabel = date.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                });
                return (
                  <div key={dayAbbrev} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-foreground whitespace-nowrap">{dateLabel}</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                    {/* Day Shift */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-amber-400">☀ Day Shift</span>
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${Math.min(floors.length, 3)}, minmax(0, 1fr))` }}
                      >
                        {floors.map((floor) => renderFloorCard(floor, dayAbbrev, "Day"))}
                      </div>
                    </div>
                    {/* Night Shift */}
                    {includeNightShift && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-indigo-400">🌙 Night Shift</span>
                        <div
                          className="grid gap-3"
                          style={{ gridTemplateColumns: `repeat(${Math.min(floors.length, 3)}, minmax(0, 1fr))` }}
                        >
                          {floors.map((floor) => renderFloorCard(floor, dayAbbrev, "Night"))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Floor management strip */}
          {floors.length > 0 && (
            <div className="mt-8 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manage Floors</h3>
              {floors.map((floor) => (
                <div key={floor.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/5 px-4 py-2">
                  <div>
                    <span className="text-sm font-medium text-foreground">{floor.floorName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{floor.blendCategory}</span>
                    {floor.blenderCapacityKg ? <span className="ml-2 text-xs text-muted-foreground">· {floor.blenderCapacityKg} KG blender</span> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditFloor(floor)}>
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => deleteFloorMutation.mutate(floor.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="cursor-col-resize bg-white/10"
          style={{ width: 12, minWidth: 12, maxWidth: 12 }}
          onMouseDown={() => setIsDividerDragging(true)}
        />

        {/* RIGHT: Planned Orders */}
        <div style={{ width: `${100 - splitPercent}%` }} className="overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Planned Orders</h2>
                <p className="text-sm text-muted-foreground">Drag unassigned orders into floors or unassign existing items.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/5 p-4">
              <div
                className="min-h-[260px] rounded-3xl border border-dashed border-white/10 bg-transparent p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={async (event) => {
                  event.preventDefault();
                  if (dragged?.type === "assigned" && dragged.assignmentId) {
                    await deleteAssignmentMutation.mutateAsync(dragged.assignmentId);
                    setDragged(null);
                    toast({ title: "Order unassigned" });
                  }
                }}
              >
                {assignedRightOrders.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No planned orders available.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assignedRightOrders.map(({ order, assigned }) => (
                      <div
                        key={order.id}
                        draggable={!assigned}
                        onDragStart={(event) => {
                          if (!assigned) {
                            event.dataTransfer.effectAllowed = "move";
                            setDragged({ type: "planned", productionOrderId: order.id });
                          }
                        }}
                        className={`rounded-3xl border p-4 ${assigned ? "border-white/10 bg-white/5 opacity-60" : "border-white/10 bg-black/10 hover:border-white/20 cursor-grab"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${getMicrobialColor(order.microbialAnalysis ?? "Normal")}`} />
                              <span className="font-semibold text-foreground truncate">{order.accountCompany ?? order.accountName ?? `Account ${order.accountId ?? order.id}`}</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{order.productName ?? order.productType ?? "Unknown product"}</div>
                            {order.productName && order.productType && (
                              <div className="text-xs text-muted-foreground">{order.productType}</div>
                            )}
                            {order.expectedDeliveryDate && (
                              <div className="text-xs text-muted-foreground">Due: {formatDate(order.expectedDeliveryDate)}</div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold">{Number(order.volume ?? 0)} KG</div>
                          </div>
                        </div>
                        {assigned && (
                          <div className="mt-3 inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                            Assigned ✓
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/5 p-4">
              <h3 className="text-sm font-semibold text-foreground">Planning summary</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Planned orders</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{plannedOrders.length}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Assigned</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{Array.from(assignedMap.keys()).length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Floor Dialog */}
      <Dialog open={editFloorModalOpen} onOpenChange={setEditFloorModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Production Floor</DialogTitle>
            <DialogDescription>Update floor name, blend category, and capacity settings.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editFloorName">Floor Name</Label>
              <Input
                id="editFloorName"
                value={editFloorForm.floorName}
                onChange={(event) => setEditFloorForm((prev) => ({ ...prev, floorName: event.target.value }))}
                placeholder="e.g. Floor 1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editBlendCategory">Blend Category</Label>
              <select
                id="editBlendCategory"
                value={editFloorForm.blendCategory}
                onChange={(event) => setEditFloorForm((prev) => ({ ...prev, blendCategory: event.target.value as ProductionFloor["blendCategory"] }))}
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/10 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <option value="Sweet">Sweet</option>
                <option value="Savory">Savory</option>
                <option value="Sweet/Savory">Sweet/Savory</option>
                <option value="Savory/Sweet">Savory/Sweet</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="editMaxCapacityKg">Max Capacity (KG)</Label>
                <Input
                  id="editMaxCapacityKg"
                  type="number"
                  min={0}
                  value={editFloorForm.maxCapacityKg}
                  onChange={(event) => setEditFloorForm((prev) => ({ ...prev, maxCapacityKg: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editBlenderCapacityKg">Blender Capacity (KG)</Label>
                <Input
                  id="editBlenderCapacityKg"
                  type="number"
                  min={0}
                  value={editFloorForm.blenderCapacityKg}
                  onChange={(event) => setEditFloorForm((prev) => ({ ...prev, blenderCapacityKg: event.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="space-x-2">
            <Button onClick={handleUpdateFloor} disabled={!editFloorForm.floorName.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Week Schedule Dialog */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Week Schedule</DialogTitle>
            <DialogDescription>Review the printable schedule for {selectedWeekLabel}.</DialogDescription>
          </DialogHeader>
          <div id="print-schedule" className="space-y-4 py-4 bg-white text-black rounded-xl p-4">
            <div className="text-center border-b border-gray-200 pb-3 mb-2">
              <h1 className="text-lg font-bold text-gray-900">Production Week Schedule</h1>
              <p className="text-sm text-gray-500 mt-1">{selectedWeekLabel}</p>
            </div>
            {weekDays.map((date, dayIdx) => {
              const dayAbbrev = dayAbbrevs[dayIdx];
              const dateLabel = date.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              });
              const dayShiftHasOrders = floors.some((f) => getFloorDayShiftRows(f.id, dayAbbrev, "Day").length > 0);
              const nightShiftHasOrders = includeNightShift && floors.some((f) => getFloorDayShiftRows(f.id, dayAbbrev, "Night").length > 0);
              return (
                <div key={dayAbbrev} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h2 className="text-sm font-bold text-gray-900">{dateLabel}</h2>
                  </div>
                  {!dayShiftHasOrders && !nightShiftHasOrders ? (
                    <p className="px-4 py-3 text-xs text-gray-400">No orders scheduled.</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {dayShiftHasOrders && (
                        <div className="p-3">
                          <p className="text-xs font-semibold text-amber-700 mb-2">☀ Day Shift</p>
                          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(floors.length, 3)}, minmax(0, 1fr))` }}>
                            {floors.map((floor) => {
                              const fRows = getFloorDayShiftRows(floor.id, dayAbbrev, "Day");
                              if (fRows.length === 0) return null;
                              return (
                                <div key={floor.id} className="border border-gray-200 rounded-lg p-2">
                                  <p className="text-xs font-bold text-gray-800">{floor.floorName}</p>
                                  <p className="text-[10px] text-gray-500 mb-1">{floor.blendCategory}</p>
                                  {fRows.map((row) => {
                                    const enriched = mdpOrderById.get(row.assignment.productionOrderId) ?? row.order;
                                    return (
                                      <div key={row.assignment.id} className="text-[10px] text-gray-700 border-t border-gray-100 pt-1 mt-1">
                                        <p className="font-medium">{enriched?.accountCompany ?? enriched?.accountName ?? `Account ${enriched?.accountId ?? "?"}`}</p>
                                        <p>{enriched?.productName ?? enriched?.productType ?? "-"} · {Number(enriched?.volume ?? 0)} KG</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {nightShiftHasOrders && (
                        <div className="p-3">
                          <p className="text-xs font-semibold text-indigo-700 mb-2">🌙 Night Shift</p>
                          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(floors.length, 3)}, minmax(0, 1fr))` }}>
                            {floors.map((floor) => {
                              const fRows = getFloorDayShiftRows(floor.id, dayAbbrev, "Night");
                              if (fRows.length === 0) return null;
                              return (
                                <div key={floor.id} className="border border-gray-200 rounded-lg p-2">
                                  <p className="text-xs font-bold text-gray-800">{floor.floorName}</p>
                                  <p className="text-[10px] text-gray-500 mb-1">{floor.blendCategory}</p>
                                  {fRows.map((row) => {
                                    const enriched = mdpOrderById.get(row.assignment.productionOrderId) ?? row.order;
                                    return (
                                      <div key={row.assignment.id} className="text-[10px] text-gray-700 border-t border-gray-100 pt-1 mt-1">
                                        <p className="font-medium">{enriched?.accountCompany ?? enriched?.accountName ?? `Account ${enriched?.accountId ?? "?"}`}</p>
                                        <p>{enriched?.productName ?? enriched?.productType ?? "-"} · {Number(enriched?.volume ?? 0)} KG</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter className="space-x-2">
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Close</Button>
            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductionHistoryTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = React.useState<ProductionHistoryView>("weekly");

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
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/produced-orders/${id}/deliver`, {
        method: "PUT",
        headers: authHeaders(),
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
      toast({ title: "Marked Delivered", description: "Production history has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Could not update delivery", description: error?.message || "Try again.", variant: "destructive" });
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(["daily", "weekly", "monthly", "yearly"] as ProductionHistoryView[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === option ? "bg-white text-foreground" : "bg-black/10 text-muted-foreground"}`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Viewing: {rangeLabel}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <DropdownMenuItem onClick={() => downloadProductionHistoryCsv(producedOrders, view)}>
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => downloadProductionHistoryXlsx(producedOrders, view)}>
              Export XLSX
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {producedOrders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/5 p-10 text-center">
          <p className="text-xl font-semibold text-foreground">No production history yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Click "Produced" on any floor assignment in Production Planning to log output.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account/Product</TableHead>
                <TableHead>Product Type</TableHead>
                <TableHead>Volume (KG)</TableHead>
                <TableHead>Produced At</TableHead>
                <TableHead>Delivery Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{order.accountName}</p>
                      <p className="text-sm text-muted-foreground">{order.productName}</p>
                    </div>
                  </TableCell>
                  <TableCell>{order.productType}</TableCell>
                  <TableCell className="font-mono">{order.volume}</TableCell>
                  <TableCell>{formatDateTime(order.producedAt)}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        order.deliveryStatus === "Delivered"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      }`}
                    >
                      {order.deliveryStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {order.deliveryStatus === "Pending" ? (
                      <Button size="sm" onClick={() => deliverMutation.mutate(order.id)}>
                        Mark Delivered
                      </Button>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                        ✓ Delivered
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function MaterialsDemandPlanningPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState("customer-products");
  const [search, setSearch] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState("all");
  const [urgencyFilter, setUrgencyFilter] = React.useState("all");
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<CustomerProduct | null>(null);
  const [formValues, setFormValues] = React.useState({ ...DEFAULT_FORM });

  const productsQuery = useQuery({
    queryKey: ["/api/mdp/customer-products"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/customer-products`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load customer products");
      }
      return res.json() as Promise<CustomerProduct[]>;
    },
    staleTime: 1000 * 60 * 2,
  }) as UseQueryResult<CustomerProduct[], Error>;
  const products = productsQuery.data ?? [];
  const isLoading = productsQuery.isLoading;

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE}api/mdp/customer-products`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to create product request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/customer-products"] });
      setIsAddOpen(false);
      setFormValues({ ...DEFAULT_FORM });
      toast({ title: "Request added", description: "New customer product request was saved." });
    },
    onError: (error: any) => {
      toast({ title: "Could not save request", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!editingProduct) throw new Error("No product selected");
      const res = await fetch(`${BASE}api/mdp/customer-products/${editingProduct.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update customer product");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/customer-products"] });
      setIsEditOpen(false);
      setEditingProduct(null);
      toast({ title: "Request updated", description: "Customer product information was updated." });
    },
    onError: (error: any) => {
      toast({ title: "Could not update request", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/mdp/customer-products/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete customer product");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/customer-products"] });
      toast({ title: "Request removed", description: "The customer product request was deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Could not delete request", description: error?.message || "Try again.", variant: "destructive" });
    },
  });

  const creating = createMutation.status === "pending";
  const updating = updateMutation.status === "pending";

  const filteredProducts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !term ||
        [product.accountName, product.company, product.productType, product.accountManager ?? ""].some((value) =>
          value.toLowerCase().includes(term)
        );
      const matchesPriority = priorityFilter === "all" || product.priority === priorityFilter;
      const matchesUrgency = urgencyFilter === "all" || product.urgency === urgencyFilter;
      return matchesSearch && matchesPriority && matchesUrgency;
    });
  }, [products, search, priorityFilter, urgencyFilter]);

  const summary = React.useMemo(() => {
    const total = products.length;
    const highPriorityCount = products.filter((product) => product.priority === "high").length;
    const averageVolume = total ? Math.round(products.reduce((sum, product) => sum + (product.volume || 0), 0) / total) : 0;
    const recentCount = products.filter((product) => {
      const date = new Date(product.dateAdded);
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);
      return date >= threshold;
    }).length;
    return { total, averageVolume, highPriorityCount, recentCount };
  }, [products]);

  const openEditForm = (product: CustomerProduct) => {
    setEditingProduct(product);
    setFormValues({
      accountName: product.accountName,
      company: product.company,
      productType: product.productType,
      urgency: product.urgency,
      priority: product.priority,
      volume: String(product.volume),
      accountManager: product.accountManager ?? "",
    });
    setIsEditOpen(true);
  };

  const submitForm = async () => {
    const payload = {
      accountName: formValues.accountName,
      company: formValues.company,
      productType: formValues.productType,
      urgency: formValues.urgency,
      priority: formValues.priority,
      volume: Number(formValues.volume),
      accountManager: formValues.accountManager || null,
    };

    if (editingProduct && isEditOpen) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const openAddForm = () => {
    setEditingProduct(null);
    setFormValues({ ...DEFAULT_FORM });
    setIsAddOpen(true);
  };

  const openEditDialog = (product: CustomerProduct) => {
    openEditForm(product);
  };

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="p-3 bg-primary/10 rounded-xl text-primary">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Materials & Demand Planning
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage raw materials, demand forecasting, and procurement planning.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="customer-products">Customer Products</TabsTrigger>
            <TabsTrigger value="production-orders">Production Orders</TabsTrigger>
            <TabsTrigger value="production-planning">Production Planning</TabsTrigger>
            <TabsTrigger value="production-floors">Production Floors</TabsTrigger>
            <TabsTrigger value="floor-assignments">Floor Assignments</TabsTrigger>
            <TabsTrigger value="production-history">Production History</TabsTrigger>
          </TabsList>

          <TabsContent value="customer-products">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Total requests</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{summary.total}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">High priority</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{summary.highPriorityCount}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Average volume</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{summary.averageVolume} kg</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Recent (30d)</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{summary.recentCount}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex-1 grid gap-3 sm:grid-cols-3">
                <div className="col-span-3 sm:col-span-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em]">Search</label>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search account, company or product"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="priority-filter">Priority</Label>
                  <select
                    id="priority-filter"
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <option value="all">All priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="urgency-filter">Urgency</Label>
                  <select
                    id="urgency-filter"
                    value={urgencyFilter}
                    onChange={(event) => setUrgencyFilter(event.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <option value="all">All urgencies</option>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="secondary" onClick={() => downloadCsv(filteredProducts)}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openAddForm}>
                      <Plus className="mr-2 h-4 w-4" /> New request
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-display">New Customer Product Request</DialogTitle>
                      <DialogDescription>
                        Capture the requested product details and add it to the demand planning queue.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="accountName">Account name</Label>
                        <Input
                          id="accountName"
                          value={formValues.accountName}
                          onChange={(event) => setFormValues((prev) => ({ ...prev, accountName: event.target.value }))}
                          placeholder="e.g. Green Peak Labs"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="company">Company</Label>
                        <Input
                          id="company"
                          value={formValues.company}
                          onChange={(event) => setFormValues((prev) => ({ ...prev, company: event.target.value }))}
                          placeholder="e.g. Zentryx Retail"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="productType">Product type</Label>
                        <Input
                          id="productType"
                          value={formValues.productType}
                          onChange={(event) => setFormValues((prev) => ({ ...prev, productType: event.target.value }))}
                          placeholder="e.g. Ingredient blend"
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 sm:grid-flow-col">
                        <div className="grid gap-2">
                          <Label htmlFor="urgency">Urgency</Label>
                          <select
                            id="urgency"
                            value={formValues.urgency}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, urgency: event.target.value }))}
                            className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="priority">Priority</Label>
                          <select
                            id="priority"
                            value={formValues.priority}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, priority: event.target.value }))}
                            className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 sm:grid-flow-col">
                        <div className="grid gap-2">
                          <Label htmlFor="volume">Volume (kg)</Label>
                          <Input
                            id="volume"
                            type="number"
                            min={0}
                            value={formValues.volume}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, volume: event.target.value }))}
                            placeholder="0"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="accountManager">Account manager</Label>
                          <Input
                            id="accountManager"
                            value={formValues.accountManager}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, accountManager: event.target.value }))}
                            placeholder="e.g. Olivia"
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter className="space-x-2">
                      <Button onClick={submitForm} disabled={creating}>
                        {creating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Save request
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="glass-card rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Product type</TableHead>
                      <TableHead>Urgency</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          No customer products match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>{product.accountName}</TableCell>
                          <TableCell>{product.company}</TableCell>
                          <TableCell>{product.productType}</TableCell>
                          <TableCell>{product.urgency}</TableCell>
                          <TableCell>{product.priority}</TableCell>
                          <TableCell>{product.volume}</TableCell>
                          <TableCell>{product.accountManager ?? "—"}</TableCell>
                          <TableCell>{formatDate(product.dateAdded)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="icon" onClick={() => openEditDialog(product)}>
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button variant="destructive" size="icon" onClick={() => deleteMutation.mutate(product.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  <TableCaption className="text-muted-foreground">
                    Showing {filteredProducts.length} of {products.length} requests.
                  </TableCaption>
                </Table>
              </div>
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-display">Edit Product Request</DialogTitle>
                  <DialogDescription>
                    Update urgency, priority, volume, or account manager details.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="editAccountName">Account name</Label>
                    <Input
                      id="editAccountName"
                      value={formValues.accountName}
                      onChange={(event) => setFormValues((prev) => ({ ...prev, accountName: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="editCompany">Company</Label>
                    <Input
                      id="editCompany"
                      value={formValues.company}
                      onChange={(event) => setFormValues((prev) => ({ ...prev, company: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="editProductType">Product type</Label>
                    <Input
                      id="editProductType"
                      value={formValues.productType}
                      onChange={(event) => setFormValues((prev) => ({ ...prev, productType: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 sm:grid-flow-col">
                    <div className="grid gap-2">
                      <Label htmlFor="editUrgency">Urgency</Label>
                      <select
                        id="editUrgency"
                        value={formValues.urgency}
                        onChange={(event) => setFormValues((prev) => ({ ...prev, urgency: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editPriority">Priority</Label>
                      <select
                        id="editPriority"
                        value={formValues.priority}
                        onChange={(event) => setFormValues((prev) => ({ ...prev, priority: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 sm:grid-flow-col">
                    <div className="grid gap-2">
                      <Label htmlFor="editVolume">Volume (kg)</Label>
                      <Input
                        id="editVolume"
                        type="number"
                        min={0}
                        value={formValues.volume}
                        onChange={(event) => setFormValues((prev) => ({ ...prev, volume: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editAccountManager">Account manager</Label>
                      <Input
                        id="editAccountManager"
                        value={formValues.accountManager}
                        onChange={(event) => setFormValues((prev) => ({ ...prev, accountManager: event.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="space-x-2">
                  <Button onClick={submitForm} disabled={updating}>
                    {updating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Edit3 className="mr-2 h-4 w-4" />
                    )}
                    Save changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="production-orders">
            <ProductionOrdersTab />
          </TabsContent>

          <TabsContent value="production-planning">
            <ProductionPlanningTab />
          </TabsContent>

          <TabsContent value="production-floors">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
              <p className="text-xl font-semibold text-foreground">Production Floors</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This section will provide floor capacity, blend assignments, and shop floor utilization planning.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="floor-assignments">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
              <p className="text-xl font-semibold text-foreground">Floor Assignments</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Floor assignment planning and schedule views will be available here soon.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="production-history">
            <ProductionHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
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
