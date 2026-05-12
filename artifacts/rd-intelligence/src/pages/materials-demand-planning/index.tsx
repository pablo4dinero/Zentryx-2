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

type PlanningViewMode = "weekly" | "daily";

function ProductionPlanningTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedWeekLabel, setSelectedWeekLabel] = React.useState("");
  const [splitPercent, setSplitPercent] = React.useState(55);
  const [isDividerDragging, setIsDividerDragging] = React.useState(false);
  const [floorModalOpen, setFloorModalOpen] = React.useState(false);
  const [floorForm, setFloorForm] = React.useState({
    floorName: "",
    blendCategory: "Sweet" as ProductionFloor["blendCategory"],
    maxCapacityKg: "0",
  });
  const [planningView, setPlanningView] = React.useState<PlanningViewMode>("weekly");
  const [assistedState, setAssistedState] = React.useState<"idle" | "optimizing" | "done">("idle");
  const [printOpen, setPrintOpen] = React.useState(false);
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
      setFloorForm({ floorName: "", blendCategory: "Sweet", maxCapacityKg: "0" });
      toast({ title: "Floor added", description: "New production floor was created." });
    },
    onError: (error: any) => {
      toast({ title: "Could not add floor", description: error?.message || "Try again.", variant: "destructive" });
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
    mutationFn: async ({ assignmentId, orderId }: { assignmentId: number; orderId: number }) => {
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
        body: JSON.stringify({ productionOrderId: orderId, assignedAt: new Date().toISOString() }),
      });
      await fetch(`${BASE}api/mdp/production-orders/${orderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ is_produced: true, order_status: "Produced" }),
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

  const handleProduce = async (assignmentId: number, orderId: number) => {
    try {
      await produceAssignmentMutation.mutateAsync({ assignmentId, orderId });
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

  const printStyles = `@media print { body * { visibility: hidden; } #print-schedule, #print-schedule * { visibility: visible; } #print-schedule { position: absolute; top: 0; left: 0; width: 100%; } }`;

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

          <div className="space-y-4">
            {floors.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/5 p-8 text-center text-sm text-muted-foreground">
                No floors defined yet. Add a production floor to begin scheduling.
              </div>
            ) : (
              floors.map((floor) => {
                const assignedRows = floorOrder(floor.id);
                const totalKg = assignedRows.reduce((sum, row) => sum + Number(row.order.volume ?? 0), 0);
                const progress = Math.min(100, Math.round((totalKg / (floor.maxCapacityKg || 1)) * 100));
                const barClass =
                  progress > 90 ? "bg-red-500" : progress > 70 ? "bg-amber-500" : "bg-emerald-500";

                return (
                  <div
                    key={floor.id}
                    className={`rounded-3xl border ${dragOverFloorId === floor.id ? "border-primary/70 bg-primary/5" : "border-white/10 bg-black/5"} p-4`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverFloorId(floor.id);
                    }}
                    onDragLeave={() => setDragOverFloorId((current) => (current === floor.id ? null : current))}
                    onDrop={(event) => handleDropOnFloor(floor, event)}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-foreground">{floor.floorName}</h3>
                          <Badge variant="secondary" className="mt-2">
                            {floor.blendCategory}
                          </Badge>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <div>{totalKg} / {floor.maxCapacityKg} KG</div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                            <div className={`${barClass} h-full`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="min-h-[180px] rounded-3xl border border-dashed border-white/10 bg-black/5 p-3">
                        {assignedRows.length === 0 ? (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            Drop orders here
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {assignedRows.map((row) => (
                              <div
                                key={row.assignment.id}
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDragged({
                                    type: "assigned",
                                    productionOrderId: row.order.id,
                                    assignmentId: row.assignment.id,
                                    floorId: floor.id,
                                  });
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (dragged?.type === "assigned" && dragged.assignmentId && dragged.floorId === floor.id) {
                                    handleReorder(floor.id, dragged.assignmentId, row.assignment.id);
                                  }
                                }}
                                className="rounded-3xl border border-white/10 bg-white/5 p-3"
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="font-medium text-foreground">{row.order.accountName ?? "Unknown account"}</div>
                                      <div className="text-sm text-muted-foreground">{row.order.productType ?? "Unknown product"}</div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">{Number(row.order.volume ?? 0)} KG</div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleUnassign(row.assignment.id)}
                                    >
                                      Unplan
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleProduce(row.assignment.id, row.order.id)}
                                    >
                                      Produced
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          className="cursor-col-resize bg-white/10"
          style={{ width: 12, minWidth: 12, maxWidth: 12 }}
          onMouseDown={() => setIsDividerDragging(true)}
        />

        <div style={{ width: `${100 - splitPercent}%` }} className="overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Planned Orders</h2>
                <p className="text-sm text-muted-foreground">Drag unassigned orders into floors or unassign existing items.</p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/5 p-1">
                {(["weekly", "daily"] as PlanningViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPlanningView(mode)}
                    className={`rounded-2xl px-4 py-2 text-sm ${planningView === mode ? "bg-white text-foreground" : "text-muted-foreground"}`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
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
                    toast({ title: "Order unassigned", description: "The order was returned to unassigned." });
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
                        className={`rounded-3xl border p-4 ${assigned ? "border-white/10 bg-white/5 text-muted-foreground opacity-60" : "border-white/10 bg-black/10 hover:border-white/20"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className={`h-2.5 w-2.5 rounded-full ${getMicrobialColor(order.microbialAnalysis ?? "Normal")}`} />
                              <span className="font-semibold text-foreground">{order.accountName ?? "Unknown account"}</span>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">{order.productType ?? "Unknown product"}</div>
                          </div>
                          <div className="text-sm font-semibold">{Number(order.volume ?? 0)} KG</div>
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

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Week Schedule</DialogTitle>
            <DialogDescription>Review the printable schedule for {selectedWeekLabel}.</DialogDescription>
          </DialogHeader>
          <div id="print-schedule" className="space-y-4 py-4">
            {floors.map((floor) => {
              const assignedRows = floorOrder(floor.id);
              return (
                <div key={floor.id} className="rounded-3xl border border-white/10 bg-black/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{floor.floorName}</p>
                      <p className="text-sm text-muted-foreground">{floor.blendCategory}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Max {floor.maxCapacityKg} KG / day</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {assignedRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No orders assigned.</p>
                    ) : (
                      assignedRows.map((row) => (
                        <div key={row.assignment.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                            <div>
                              <p className="font-medium text-foreground">{row.order.accountName}</p>
                              <p className="text-muted-foreground">{row.order.productType}</p>
                            </div>
                            <div>{Number(row.order.volume ?? 0)} KG</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="space-x-2">
            <Button onClick={() => window.print()}>Print</Button>
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
