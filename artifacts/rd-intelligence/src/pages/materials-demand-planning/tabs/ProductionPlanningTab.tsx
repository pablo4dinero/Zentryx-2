import * as React from "react";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { AlertTriangle, ChevronDown, Edit3, Loader2, Maximize2, Moon, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useGetCurrentUser } from "@/api-client";
import { displayLabel, useServerProductTypes } from "@/lib/project-options";
import { useCall } from "@/lib/call";
import { useFeatureFlagsContext } from "@/contexts/FeatureFlagsContext";
import { type PlanningSummary } from "../ai-planner";
import { calculateEfficiency, getEfficiencyColor, getEfficiencyLabel } from "../efficiency-calculator";
import { DowntimeAlerts, type IdleTimeAlert } from "../downtime-alerts";
import type { Account, BlendSpeed, FloorAssignmentRow, FloorStatus, ProductionFloor, ProductionOrder } from "../lib/types";
import { BASE, DEFAULT_BLEND_SPEEDS, FLOOR_STATUSES, LS_BLEND_SPEEDS, LS_ORDER_BLENDSPEED, SWITCH_PRESETS } from "../lib/constants";
import { authHeaders, blendSpeedFactor, calcPriorityScore, floorStatusColor, formatSwitchDuration, getMicrobialColor, getWorkingWeeksForMonth, parseBlendSpeedsFromStorage } from "../lib/helpers";
import { VolumeTag } from "../components/Badges";
import { PartialAssignModal } from "../components/PartialAssignModal";

type PlanningViewMode = "weekly" | "daily" | "monthly";

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


export function ProductionPlanningTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { onWsMessage } = useCall();
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = ((currentUser?.role as string | undefined) ?? "").toLowerCase() === "admin";

  // Instant cache invalidation when another user changes planning data
  React.useEffect(() => {
    const off = onWsMessage((msg: any) => {
      if (msg?.type !== "data:changed") return;
      if (msg.resource === "floor-assignments") {
        queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
      }
      if (msg.resource === "production-orders") {
        queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      }
    });
    return off;
  }, [onWsMessage, queryClient]);
  // Shared dynamic product type list (same store as Sales Force "Add Account"
  // and MDP "Add Product"). Add/rename/delete happens via those forms — this
  // hook just reads the current set for the floor allow-list chips.
  const typeOpts = useServerProductTypes();
  const normalizeType = (s: string | null | undefined): string =>
    String(s ?? "").trim().toLowerCase().replace(/[\s&_\-/]+/g, "_").replace(/_+/g, "_");
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [selectedWeekLabel, setSelectedWeekLabel] = React.useState("");
  const [splitPercent, setSplitPercent] = React.useState(55);
  const [isDividerDragging, setIsDividerDragging] = React.useState(false);
  // Tracks whether the viewport is above the md breakpoint (768px). Lets us
  // disable the split-pane inline width on mobile so the two panes stack
  // full-width instead of squeezing into one ~55% column.
  const [isMdUp, setIsMdUp] = React.useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );
  React.useEffect(() => {
    const update = () => setIsMdUp(window.innerWidth >= 1024);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const [floorModalOpen, setFloorModalOpen] = React.useState(false);
  const [floorForm, setFloorForm] = React.useState({
    floorName: "",
    blendCategory: "Sweet" as ProductionFloor["blendCategory"],
    maxCapacityKg: "0",
    allowedProductTypes: [] as string[],
  });
  const [editFloorOpen, setEditFloorOpen] = React.useState(false);
  const [editingFloor, setEditingFloor] = React.useState<ProductionFloor | null>(null);
  const [editFloorForm, setEditFloorForm] = React.useState({ floorName: "", blendCategory: "Sweet" as ProductionFloor["blendCategory"], maxCapacityKg: "0", allowedProductTypes: [] as string[] });
  const [deleteConfirmFloorId, setDeleteConfirmFloorId] = React.useState<number | null>(null);
  const [includeSaturday, setIncludeSaturday] = React.useState(false);
  const [includeNightShift, setIncludeNightShift] = React.useState(false);
  const [planningView, setPlanningView] = React.useState<PlanningViewMode>("weekly");
  const [selectedMonthView, setSelectedMonthView] = React.useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [expandedWeeks, setExpandedWeeks] = React.useState<Set<string>>(new Set());
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
    try { return parseBlendSpeedsFromStorage(JSON.parse(localStorage.getItem(LS_BLEND_SPEEDS) || "null")); }
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
  // Pull working weeks for the current month, plus the previous and next
  // months so the week containing today still resolves correctly at the
  // month boundary (e.g. today is a Saturday whose Monday is in the previous
  // month, or whose week starts in the next).
  const weeks = React.useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    const prev = new Date(y, m - 1, 1);
    const next = new Date(y, m + 1, 1);
    return [
      ...getWorkingWeeksForMonth(prev.getFullYear(), prev.getMonth()),
      ...getWorkingWeeksForMonth(y, m),
      ...getWorkingWeeksForMonth(next.getFullYear(), next.getMonth()),
    ];
  }, [now]);
  const defaultWeekLabel = React.useMemo(() => {
    // Find the working week whose Mon→Sun range contains today. Falling back
    // to weeks[0] meant Saturday/Sunday selections always rendered Week 1 of
    // the month — wrong every weekend.
    const todayMid = new Date(now);
    todayMid.setHours(0, 0, 0, 0);
    const containingWeek = weeks.find(week => {
      const monday = new Date(week.startDate);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return todayMid.getTime() >= monday.getTime() && todayMid.getTime() <= sunday.getTime();
    });
    return containingWeek?.weekLabel ?? weeks[0]?.weekLabel ?? "";
  }, [now, weeks]);

  const selectedWeek = React.useMemo(
    () => weeks.find(w => w.weekLabel === selectedWeekLabel) ?? null,
    [weeks, selectedWeekLabel]
  );

  const monthViewWeeks = React.useMemo(() => {
    const [yr, mo] = selectedMonthView.split("-").map(Number);
    const monthStart = new Date(yr, mo - 1, 1);
    const monthEnd = new Date(yr, mo, 0);
    return weeks.filter(week => {
      const weekStart = new Date(week.startDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return weekStart <= monthEnd && weekEnd >= monthStart;
    }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [weeks, selectedMonthView]);

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
    refetchInterval: 1000 * 60 * 2,
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
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  }) as UseQueryResult<FloorAssignmentRow[], Error>;

  // All assignments across all weeks — used to permanently hide ordered orders from Planned Orders list
  const allAssignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load all floor assignments");
      return res.json() as Promise<FloorAssignmentRow[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
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
    refetchInterval: 1000 * 60 * 2,
  }) as UseQueryResult<ProductionOrder[], Error>;

  const planningAccountsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      return res.json() as Promise<{id: number; company: string; productName: string | null; productType: string | null}[]>;
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  const planningAccountMap = React.useMemo(() => {
    const map: Record<number, {company: string; productName: string | null; productType: string | null}> = {};
    (planningAccountsQuery.data ?? []).forEach(a => { map[a.id] = { company: a.company, productName: a.productName, productType: a.productType }; });
    return map;
  }, [planningAccountsQuery.data]);

  const floors = floorsQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  // Debug logging
  React.useEffect(() => {
    if (floors.length > 0) {
      console.log("Production Floors loaded:", floors.map(f => ({ id: f.id, name: f.floorName, capacity: f.maxCapacityKg })));
    }
  }, [floors]);

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

  // Planned-orders filter must exclude anything already past the planning
  // stage. Orders that have been produced or delivered (either via the
  // is_produced / is_delivered flags or via order_status moving past
  // "Planned") still flow back through this query, so we strip them here
  // to prevent them from re-appearing in the planning list alongside their
  // Production History entry.
  const plannedOrders = React.useMemo(
    () => (productionOrdersQuery.data ?? []).filter((order) => {
      if (!order.isPlanned) return false;
      if (order.isProduced) return false;
      if (order.isDelivered) return false;
      const status = String(order.orderStatus ?? "");
      if (status === "Produced" || status === "Delivered" || status === "Cancelled") return false;
      return true;
    }),
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

  // Keep a per-floor manual ordering of assignment cards, reconciled against the
  // latest server data WITHOUT discarding the user's manual arrangement: preserve
  // the existing order for assignments that still exist, append newly-added ones,
  // and drop removed ones. (Previously this overwrote the order on every refetch,
  // which snapped manually-reordered cards back to server order.)
  React.useEffect(() => {
    setLocalFloorOrder((prev) => {
      const next: Record<number, number[]> = {};
      assignmentsByFloor.forEach((rows, floorId) => {
        const serverIds = rows.map((row) => row.assignment.id);
        const prevOrder = prev[floorId];
        if (!prevOrder || prevOrder.length === 0) {
          next[floorId] = serverIds;
          return;
        }
        const serverSet = new Set(serverIds);
        // Preserve manual order for assignments that still exist…
        const preserved = prevOrder.filter((id) => serverSet.has(id));
        // …then append any newly-added assignments not yet in the local order.
        const preservedSet = new Set(preserved);
        const added = serverIds.filter((id) => !preservedSet.has(id));
        next[floorId] = [...preserved, ...added];
      });
      return next;
    });
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
      setFloorForm({ floorName: "", blendCategory: "Sweet", maxCapacityKg: "0", allowedProductTypes: [] });
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
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
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
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
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
    mutationFn: async ({ assignmentId, orderId, accountName, productName, productType, volume, floorId: fId, weekLabel, assignedDay }: {
      assignmentId: number; orderId: number;
      accountName: string; productName: string; productType: string; volume: number; floorId?: number;
      weekLabel?: string | null; assignedDay?: string | null;
    }) => {
      // Mark this floor assignment as produced
      const res = await fetch(`${BASE}api/mdp/floor-assignments/${assignmentId}/produce`, {
        method: "PUT",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to mark assignment produced");
      }
      // Record the production in history
      await fetch(`${BASE}api/mdp/produced-orders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          productionOrderId: orderId,
          floorAssignmentId: assignmentId,
          weekLabel: weekLabel ?? null,
          assignedDay: assignedDay ?? null,
          accountName,
          productName,
          productType,
          volume,
          floorId: fId ?? null,
          producedAt: new Date().toISOString(),
        }),
      });
      // Only roll the mother order to a "Produced" terminal state when the
      // entire order is done — every assignment is produced AND no volume is
      // left unassigned. Otherwise it would disappear from the planning list
      // while partial volume is still pending.
      const allAssignments = allAssignmentsQuery.data ?? [];
      const siblings = allAssignments.filter(r => r.assignment.productionOrderId === orderId);
      const unproducedRemaining = siblings.filter(r =>
        r.assignment.id !== assignmentId && r.assignment.planStatus !== "Produced"
      ).length;
      const remainingVol = remainingVolumeByOrderId[orderId] ?? 0;
      if (unproducedRemaining === 0 && remainingVol <= 0) {
        await fetch(`${BASE}api/mdp/production-orders/${orderId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ isProduced: true, isPlanned: false, orderStatus: "Produced" }),
        });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      // produced-orders was missing here, so a fresh Produced click after a
      // Return-to-Floor-Planning never refreshed the Production History view
      // until a manual reload.
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
      allowedProductTypes: floorForm.allowedProductTypes,
    });
  };

  const getProductTypeMismatch = (floor: ProductionFloor, order: ProductionOrder): { productLabel: string; allowedLabels: string } | null => {
    const allowed = Array.isArray(floor.allowedProductTypes) ? floor.allowedProductTypes : [];
    if (allowed.length === 0) return null;
    const acc = planningAccountMap[order.accountId ?? 0];
    const rawType = String(acc?.productType ?? order.productType ?? "").trim();
    if (!rawType) return null;
    const orderNorm = normalizeType(rawType);
    const ok = allowed.some(a => normalizeType(a) === orderNorm);
    if (ok) return null;
    const productLabel = displayLabel(rawType);
    const allowedLabels = allowed.map(displayLabel).join(", ");
    return { productLabel, allowedLabels };
  };

  type DragSnapshot = { type: "planned" | "assigned"; productionOrderId: number; assignmentId?: number; floorId?: number };
  const [confirmDrop, setConfirmDrop] = React.useState<{
    floor: ProductionFloor;
    order: ProductionOrder;
    day?: string;
    draggedSnapshot: DragSnapshot;
    productLabel: string;
    allowedLabels: string;
    weekLabelOverride?: string;
  } | null>(null);

  const proceedWithDrop = async (floor: ProductionFloor, order: ProductionOrder, day: string | undefined, draggedSnap: DragSnapshot, weekLabelOverride?: string) => {
    setConfirmDrop(null);
    const weekLabelToUse = weekLabelOverride ?? selectedWeekLabel;
    if (draggedSnap.type === "planned") {
      openPartialAssignModal(floor, order, day);
      return;
    }
    if (draggedSnap.type === "assigned" && draggedSnap.assignmentId && draggedSnap.floorId !== undefined) {
      if (draggedSnap.floorId !== floor.id) {
        const originalRow = assignments.find(r => r.assignment.id === draggedSnap.assignmentId);
        const originalVol = originalRow?.assignment.assignedVolume;
        await deleteAssignmentMutation.mutateAsync(draggedSnap.assignmentId);
        const targetDay = day ?? getAvailableDay(floor, assignmentsByFloor.get(floor.id) ?? [], Number(originalVol ?? order.volume ?? 0));
        await createAssignmentMutation.mutateAsync({
          floorId: floor.id, productionOrderId: order.id,
          weekLabel: weekLabelToUse, assignedDay: targetDay, planStatus: "Planned",
          ...(originalVol != null ? { assignedVolume: Number(originalVol) } : {}),
        });
      }
    }
    setDragged(null);
  };

  const handleDropOnFloor = async (floor: ProductionFloor, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverFloorId(null);
    if (!dragged) return;
    const plannedOrder = plannedOrders.find((order) => order.id === dragged.productionOrderId);
    if (!plannedOrder) return;

    const mismatch = getProductTypeMismatch(floor, plannedOrder);
    if (mismatch) {
      setConfirmDrop({
        floor, order: plannedOrder, day: undefined,
        draggedSnapshot: { ...dragged },
        productLabel: mismatch.productLabel,
        allowedLabels: mismatch.allowedLabels,
      });
      return;
    }
    await proceedWithDrop(floor, plannedOrder, undefined, dragged);
  };

  const handleUnassign = async (assignmentId: number) => {
    await deleteAssignmentMutation.mutateAsync(assignmentId);
    toast({ title: "Order unassigned", description: "The order was returned to the unassigned list." });
  };

  // Track in-flight produce requests so we can disable the button while the
  // mutation is running, on top of the planStatus check below. Prevents
  // accidental double-clicks from creating duplicate history rows even though
  // the backend is now idempotent.
  const [producingIds, setProducingIds] = React.useState<Set<number>>(new Set());

  const handleProduce = async (assignmentId: number, orderId: number, floorId?: number) => {
    const row = (allAssignmentsQuery.data ?? []).find(r => r.assignment.id === assignmentId);
    // Already produced (or already being produced) — bail. The backend is
    // idempotent now too, but this stops the wasted round-trip and the
    // misleading "Produced" toast.
    if (row?.assignment.planStatus === "Produced") return;
    if (producingIds.has(assignmentId)) return;

    setProducingIds(s => { const n = new Set(s); n.add(assignmentId); return n; });
    try {
      const fullOrder = mdpOrderByMdpId.get(orderId);
      const acc = planningAccountMap[fullOrder?.accountId ?? 0];
      const assignedVol = row?.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : Number(fullOrder?.volume ?? 0);
      await produceAssignmentMutation.mutateAsync({
        assignmentId,
        orderId,
        accountName: acc?.company ?? fullOrder?.accountName ?? "Unknown",
        productName: acc?.productName ?? fullOrder?.productName ?? "Unknown",
        productType: acc?.productType ?? fullOrder?.productType ?? "Unknown",
        volume: assignedVol,
        floorId,
        weekLabel: row?.assignment.weekLabel ?? null,
        assignedDay: row?.assignment.assignedDay ?? null,
      });
      toast({ title: "Produced", description: "The order has been moved to production history." });
    } catch (error: any) {
      toast({ title: "Could not produce order", description: error?.message || "Try again.", variant: "destructive" });
    } finally {
      setProducingIds(s => { const n = new Set(s); n.delete(assignmentId); return n; });
    }
  };

  // Persist a floor's manual card order to the server so it survives reloads
  // and is shared across users (writes sort_order = index per assignment).
  const reorderMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments/reorder`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to save order");
      return res.json();
    },
    onError: () => {
      toast({ title: "Couldn't save new order", description: "Please try again.", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
    },
  });

  const handleReorder = (floorId: number, draggedAssignmentId: number, targetAssignmentId: number) => {
    const current = [...(localFloorOrder[floorId] ?? floorOrder(floorId).map(r => r.assignment.id))];
    const fromIndex = current.indexOf(draggedAssignmentId);
    const toIndex = current.indexOf(targetAssignmentId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    current.splice(fromIndex, 1);
    current.splice(toIndex, 0, draggedAssignmentId);
    // Optimistic local update for instant feedback…
    setLocalFloorOrder((prev) => ({ ...prev, [floorId]: current }));
    // …then persist so it sticks across refetches, reloads and other users.
    reorderMutation.mutate(current);
  };

  const handleDropOnFloorDay = async (floor: ProductionFloor, day: string, event: React.DragEvent, weekLabelOverride?: string) => {
    event.preventDefault();
    setDragOverFloorId(null);
    if (!dragged) return;
    const plannedOrder = plannedOrders.find((order) => order.id === dragged.productionOrderId);
    if (!plannedOrder) return;

    const mismatch = getProductTypeMismatch(floor, plannedOrder);
    if (mismatch) {
      setConfirmDrop({
        floor, order: plannedOrder, day,
        draggedSnapshot: { ...dragged },
        productLabel: mismatch.productLabel,
        allowedLabels: mismatch.allowedLabels,
        weekLabelOverride,
      });
      return;
    }
    await proceedWithDrop(floor, plannedOrder, day, dragged, weekLabelOverride);
  };

  const [aiSummary, setAiSummary] = React.useState<PlanningSummary | null>(null);
  const [unassigning, setUnassigning] = React.useState(false);

  // Unassign every assignment in the currently selected week. The `assignments`
  // array is sourced from the week-scoped query (key includes
  // selectedWeekLabel), so this can't touch other weeks. Behind a confirm
  // dialog because it can't be undone.
  const handleUnassignAll = async () => {
    if (assignments.length === 0) {
      toast({ title: "Nothing to unassign", description: "This week has no assignments." });
      return;
    }

    // Quick confirmation dialog
    const ok = window.confirm(
      `Unassign all ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}?`,
    );
    if (!ok) return;

    const assignmentCount = assignments.length;
    const assignmentIds = assignments.map(row => row.assignment.id);
    const idSet = new Set(assignmentIds);
    setUnassigning(true);

    // Cancel any in-flight floor-assignment refetches so a late response can't
    // overwrite our optimistic clear and make the cards reappear.
    await queryClient.cancelQueries({ queryKey: ["/api/mdp/floor-assignments"] });

    // IMMEDIATE: Optimistically clear BOTH floor-assignment caches.
    // The board renders from either the week-scoped query (weekly view) or the
    // all-weeks query (other views), so both must be cleared. The id lives at
    // row.assignment.id — filtering by row.id was a no-op and left cards on screen.
    const dropDeleted = (old: any) =>
      Array.isArray(old) ? old.filter((row: any) => !idSet.has(row?.assignment?.id)) : old;
    queryClient.setQueryData(["/api/mdp/floor-assignments", selectedWeekLabel], dropDeleted);
    queryClient.setQueryData(["/api/mdp/floor-assignments"], dropDeleted);

    // IMMEDIATE: Invalidate production-orders to force refetch (syncs cache)
    queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });

    // Show success immediately (UI is responsive now)
    toast({
      title: "✓ Cleared",
      description: `Unassigned ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"}.`,
    });

    setUnassigning(false);

    // BACKGROUND: Delete on server asynchronously (don't block UI)
    // User won't wait for this - UI is already responsive
    fetch(`${BASE}api/mdp/floor-assignments/batch-delete`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: assignmentIds }),
    })
      .then(res => {
        if (!res.ok) throw new Error("Batch delete failed");
        return res.json();
      })
      .catch((error) => {
        console.error("Background unassign error:", error);
        // On error, refetch BOTH floor-assignment queries to resync the board.
        queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
        toast({
          title: "Background sync error",
          description: "Please refresh page to ensure data consistency.",
          variant: "destructive",
        });
      });
  };

  const handleAssistedPlanning = async () => {
    if (!selectedWeek) {
      toast({ title: "Pick a week first", variant: "destructive" });
      return;
    }
    if (floors.length === 0) {
      toast({ title: "No production floors configured", description: "Please set up production floors first.", variant: "destructive" });
      return;
    }
    setAssistedState("optimizing");

    const workingDays = ["Mon", "Tue", "Wed", "Thu", "Fri", ...(includeSaturday ? ["Sat"] : [])];
    const workingDates = selectedWeek.days.slice(0, workingDays.length);

    // Build planner orders (resolve product type + remaining volume client-side,
    // then send to server — algorithm runs on the server now)
    const plannerOrders = plannedOrders
      .map(order => {
        const acc = planningAccountMap[order.accountId ?? 0];
        const productType = acc?.productType ?? order.productType ?? null;
        const remaining = remainingVolumeByOrderId[order.id] ?? Number(order.volume ?? 0);
        const blendId = blendSpeedByOrderId[order.id] || "fast";
        const microbial = order.microbialAnalysis ?? "Normal";
        const rawMaterial = order.rawMaterialStatus ?? "Pending";
        const priorityScore = calcPriorityScore(rawMaterial, microbial, blendId, Number(order.volume ?? 0), order.expectedDeliveryDateDate);
        const productionLabel = `${acc?.company ?? order.accountName ?? "Unknown"} — ${acc?.productName ?? order.productName ?? "Unknown product"}`;
        return { id: order.id, productionLabel, productType, blendSpeedId: blendId, microbialAnalysis: microbial, rawMaterialStatus: rawMaterial, expectedDeliveryDateDate: order.expectedDeliveryDateDate ?? null, remainingQuantity: remaining, priorityScore };
      })
      .filter(o => o.remainingQuantity > 0);

    // Serialise floor-day statuses for the server
    const floorDayStatuses: Record<string, string> = {};
    for (const floor of floors) {
      for (const day of workingDays) {
        const status = getFloorDayStatus(floor.id, day);
        floorDayStatuses[`${floor.id}|${day}`] = status;
      }
    }

    try {
      const res = await fetch(`${BASE}api/mdp/assisted-planning`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          weekLabel: selectedWeekLabel,
          workingDays,
          workingDates: workingDates.map(d => d instanceof Date ? d.toISOString() : new Date(d).toISOString()),
          includeNightShift,
          includeSaturday,
          plannerOrders,
          existingUsageRaw: {},
          floorDayStatuses,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err.error === "PlanningInProgress") {
          throw new Error(err.message || "Another user is already planning this week. Please wait and try again.");
        }
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const { summary, placementCount } = await res.json();

      queryClient.invalidateQueries({ queryKey: ["/api/mdp/floor-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mdp/product-switch-downtimes"] });

      setAiSummary(summary);
      setAssistedState("done");
      window.setTimeout(() => setAssistedState("idle"), 3000);

      if (placementCount === 0) {
        toast({
          title: "No placements made",
          description: summary.skipped[0]?.reason || "Check floor product-type configuration and order due dates.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `AI placed ${placementCount} assignment${placementCount === 1 ? "" : "s"}`,
          description: `Across ${workingDays.length} day${workingDays.length === 1 ? "" : "s"}. Adjust manually as needed.`,
        });
      }
    } catch (err: any) {
      setAssistedState("idle");
      toast({ title: "Planning failed", description: err.message || "Please try again.", variant: "destructive" });
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

  // For each assignment, compute "remaining to assign" at the moment this
  // assignment was created (running balance against the mother order volume).
  // Sorted by assignedAt ascending so the first chronological partial sees the
  // full total, the second sees what was left after the first, and so on.
  const assignmentRemainingMap = React.useMemo(() => {
    const map: Record<number, { remainingBefore: number; remainingAfter: number }> = {};
    const byOrder = new Map<number, FloorAssignmentRow[]>();
    (allAssignmentsQuery.data ?? []).forEach(row => {
      const list = byOrder.get(row.assignment.productionOrderId) ?? [];
      list.push(row);
      byOrder.set(row.assignment.productionOrderId, list);
    });
    byOrder.forEach((rows, orderId) => {
      const sorted = [...rows].sort((a, b) => {
        const ta = new Date(a.assignment.assignedAt ?? 0).getTime();
        const tb = new Date(b.assignment.assignedAt ?? 0).getTime();
        if (ta !== tb) return ta - tb;
        return a.assignment.id - b.assignment.id;
      });
      const totalVol = Number(mdpOrderByMdpId.get(orderId)?.volume ?? sorted[0]?.order?.volume ?? 0);
      let remainingBefore = totalVol;
      sorted.forEach(row => {
        const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
        const remainingAfter = Math.max(0, remainingBefore - assignedVol);
        map[row.assignment.id] = { remainingBefore, remainingAfter };
        remainingBefore = remainingAfter;
      });
    });
    return map;
  }, [allAssignmentsQuery.data, mdpOrderByMdpId]);

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

  // Get feature flags from context (safe hook pattern)
  const { efficiencyScoreEnabled, downtimeAlertsEnabled } = useFeatureFlagsContext();

  // Calculate efficiency score for current week
  const weekAssignments = (allAssignmentsQuery.data ?? []).filter(row => row.assignment.weekLabel === selectedWeekLabel);
  const floorMap = (floorsQuery.data ?? []).reduce((acc: Record<number, any>, floor) => {
    acc[floor.id] = { name: floor.floorName };
    return acc;
  }, {});
  const { score: efficiencyScore, breakdown: efficiencyBreakdown } = weekAssignments.length > 0
    ? calculateEfficiency(
        weekAssignments.map(row => ({
          id: row.assignment.id,
          floorId: row.assignment.floorId,
          day: row.assignment.assignedDay || "",
          shiftType: (row.assignment.shiftType || "day") as "day" | "night" | "saturday",
          assignedVolume: row.assignment.assignedVolume || 0,
          order: { id: row.order.id, blendSpeedId: row.order.blendSpeedId },
          isWeekend: false,
        })),
        floorMap
      )
    : { score: 0, breakdown: {} };

  // Detect idle time periods (simplified: 4+ hour gap on same floor/day = idle)
  const idleAlerts: IdleTimeAlert[] = [];
  if (downtimeAlertsEnabled && selectedWeekLabel && weekAssignments.length > 0) {
    const assignmentsByFloorDay = new Map<string, number[]>();
    weekAssignments.forEach(row => {
      const key = `${row.assignment.floorId}-${row.assignment.assignedDay}`;
      if (!assignmentsByFloorDay.has(key)) assignmentsByFloorDay.set(key, []);
      assignmentsByFloorDay.get(key)!.push(row.assignment.assignedVolume || 0);
    });
    // Simplified logic: if a floor has <50% capacity used on a day, flag as idle
    assignmentsByFloorDay.forEach((volumes, key) => {
      const [floorId, day] = key.split("-");
      const floor = (floorsQuery.data ?? []).find(f => f.id === parseInt(floorId));
      if (floor) {
        const totalVol = volumes.reduce((a, b) => a + b, 0);
        if (totalVol < (floor.maxCapacityKg || 0) * 0.5) {
          idleAlerts.push({
            day: day || "",
            floorName: floor.floorName,
            startHour: 14,
            durationHours: 4,
            suggestedMaintenance: "Schedule routine maintenance or calibration",
          });
        }
      }
    });
  }

  return (
    <div className="space-y-5">
      <style>{printStyles}</style>
      {downtimeAlertsEnabled && idleAlerts.length > 0 && (
        <DowntimeAlerts alerts={idleAlerts.slice(0, 3)} isLight={isLight} />
      )}
      {efficiencyScoreEnabled && (
        <>
          <div className={cn("rounded-2xl border p-4 flex items-center justify-between", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-wider", isLight ? "text-slate-600" : "text-muted-foreground")}>Current Week Efficiency</p>
              <p className={cn("text-sm mt-1", isLight ? "text-slate-700" : "text-foreground")}>
                {selectedWeekLabel || "Select a week to see efficiency score"}
              </p>
            </div>
            {selectedWeekLabel && (
              <div className={cn("px-4 py-2 rounded-xl border font-semibold text-sm inline-flex items-center gap-2", getEfficiencyColor(efficiencyScore))}>
                <span>{efficiencyScore}%</span>
                <span className="text-xs opacity-75">{getEfficiencyLabel(efficiencyScore)}</span>
              </div>
            )}
          </div>
        </>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          {planningView === "monthly" ? (
            <>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="month-selector-plan">Choose a month</label>
              <select
                id="month-selector-plan"
                value={selectedMonthView}
                onChange={(event) => setSelectedMonthView(event.target.value)}
                className={cn("h-10 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
                  isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/20 text-foreground"
                )}
              >
                {(() => {
                  const options = [];
                  const now = new Date();
                  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
                    for (let m = 1; m <= 12; m++) {
                      const month = String(m).padStart(2, "0");
                      const label = new Date(y, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
                      options.push({ value: `${y}-${month}`, label });
                    }
                  }
                  return options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ));
                })()}
              </select>
            </>
          ) : (
            <>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="week-selector">Choose a week</label>
              <select
                id="week-selector"
                value={selectedWeekLabel}
                onChange={(event) => setSelectedWeekLabel(event.target.value)}
                className={cn("h-10 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
                  isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-black/80 text-foreground"
                )}
              >
                {weeks.map((week) => (
                  <option key={week.weekLabel} value={week.weekLabel} className={isLight ? "bg-white text-slate-700" : "bg-black/90 text-white"}>
                    {week.weekLabel}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-3 custom-scrollbar">
          {planningView === "weekly" && (
            <label className={cn("flex items-center gap-2 px-3 h-9 rounded-xl border text-xs font-medium cursor-pointer transition-all whitespace-nowrap",
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
          <div className="flex gap-1 p-1 rounded-xl border" style={{background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}}>
            {["weekly", "monthly"].map((mode) => (
              <button
                key={mode}
                onClick={() => setPlanningView(mode as PlanningViewMode)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  planningView === mode
                    ? "bg-primary text-white shadow-sm"
                    : isLight
                    ? "text-slate-600 hover:text-slate-900"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <button
            onClick={handleAssistedPlanning}
            disabled={assistedState === "optimizing" || floors.length === 0}
            title={floors.length === 0 ? "No production floors configured" : undefined}
            className={cn("flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50",
              assistedState === "done"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-primary/10 border-primary/30 text-primary hover:bg-primary hover:text-white"
            )}
          >
            {assistedState === "optimizing" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Planning…</> : assistedState === "done" ? "✓ Plan Applied" : "Assisted Planning"}
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

      <div id="planning-split-container" className={cn(
        "relative flex flex-col lg:flex-row h-auto lg:h-[720px] rounded-2xl border overflow-hidden",
        isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5",
      )}>
        <div
          style={isMdUp ? { width: `${splitPercent}%` } : undefined}
          className={cn("overflow-y-auto p-3 sm:p-5 w-full lg:w-auto lg:border-r", isLight ? "border-slate-200" : "border-white/10")}
        >
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Production Floors</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Drag planned orders into floor boxes to schedule production.</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
            {isAdmin && (
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
                  <div className="grid gap-2">
                    <Label>Product Types This Floor Can Blend</Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Pick one or more from the shared product type list. Add new types via Sales Force or MDP Add Product.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {typeOpts.options.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No product types defined yet.</p>
                      ) : typeOpts.options.map(opt => {
                        const selected = floorForm.allowedProductTypes.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFloorForm(prev => ({
                              ...prev,
                              allowedProductTypes: selected
                                ? prev.allowedProductTypes.filter(t => t !== opt)
                                : [...prev.allowedProductTypes, opt],
                            }))}
                            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                              selected
                                ? "bg-primary/15 border-primary/40 text-primary"
                                : isLight
                                  ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                                  : "border-white/10 text-muted-foreground hover:bg-white/5",
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/40")} />
                            {displayLabel(opt)}
                          </button>
                        );
                      })}
                    </div>
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
            )}
            <button
              type="button"
              onClick={handleUnassignAll}
              disabled={unassigning || assignments.length === 0}
              title={assignments.length === 0
                ? "No assignments in this week"
                : `Unassign all ${assignments.length} assignment${assignments.length === 1 ? "" : "s"} in ${selectedWeekLabel}`}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                isLight
                  ? "bg-white border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20",
              )}
            >
              {unassigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {unassigning ? "Unassigning…" : "Unassign all"}
            </button>
          </div>
          </div>

          {/* ── Shared order card renderer ── */}
          {(() => {
            const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", ...(includeSaturday ? ["Sat"] : [])];

            const makeOrderCard = (floorId: number) => (row: FloorAssignmentRow) => {
              const fullOrder = mdpOrderByMdpId.get(row.order.id);
              const acc = planningAccountMap[fullOrder?.accountId ?? 0];
              // Use fullOrder data first (has merged account info from production orders API), then fallback to accountMap, then row data
              const company = fullOrder?.accountName ?? fullOrder?.accountCompany ?? acc?.company ?? row.order.accountName ?? "Unknown";
              const productName = fullOrder?.productName ?? acc?.productName ?? row.order.productName ?? null;
              const productTypeLabel = fullOrder?.productType ?? acc?.productType ?? row.order.productType ?? "—";
              const totalVol = Number(fullOrder?.volume ?? row.order.volume ?? 0);
              const assignedVol = row.assignment.assignedVolume != null ? Number(row.assignment.assignedVolume) : totalVol;
              const runningBefore = assignmentRemainingMap[row.assignment.id]?.remainingBefore ?? totalVol;
              const expected = fullOrder?.expectedDeliveryDateDate ?? null;
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
                      {runningBefore > 0 && runningBefore !== assignedVol && (
                        <div className="text-[9px] text-muted-foreground/60 mt-0.5">of {runningBefore.toLocaleString()} to assign</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleUnassign(row.assignment.id)} className={cn("flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>Unassign</button>
                    {(() => {
                      const alreadyProduced = row.assignment.planStatus === "Produced";
                      const isPending = producingIds.has(row.assignment.id);
                      const disabled = alreadyProduced || isPending;
                      return (
                        <button
                          onClick={() => handleProduce(row.assignment.id, row.order.id, floorId)}
                          disabled={disabled}
                          title={alreadyProduced ? "Already produced — use Production History to revert" : undefined}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors",
                            alreadyProduced
                              ? "bg-emerald-500 border-emerald-500 text-white cursor-default"
                              : isPending
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/60 cursor-wait"
                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20",
                          )}
                        >
                          {alreadyProduced ? "✓ Produced" : isPending ? "Producing…" : "Produced"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            };

            const floorActionButtons = (floor: ProductionFloor, day?: string) => (
              <div className="flex items-center gap-1 shrink-0">
                {day && floorStatusButton(floor, day)}
                <button onClick={() => { setEditingFloor(floor); setEditFloorForm({ floorName: floor.floorName, blendCategory: floor.blendCategory, maxCapacityKg: String(floor.maxCapacityKg), allowedProductTypes: Array.isArray(floor.allowedProductTypes) ? floor.allowedProductTypes : [] }); setEditFloorOpen(true); }}
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

            /* ── MONTHLY VIEW: collapsible weeks ── */
            if (planningView === "monthly") {
              return (
                <div className="space-y-4">
                  {monthViewWeeks.map((week, weekIdx) => {
                    const isExpanded = expandedWeeks.has(week.weekLabel);
                    const toggleWeek = () => {
                      const newSet = new Set(expandedWeeks);
                      if (isExpanded) {
                        newSet.delete(week.weekLabel);
                      } else {
                        newSet.add(week.weekLabel);
                      }
                      setExpandedWeeks(newSet);
                    };

                    return (
                      <div key={week.weekLabel} className={cn("rounded-2xl border overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
                        <button
                          onClick={toggleWeek}
                          className={cn("w-full px-4 py-3 flex items-center justify-between transition-colors",
                            isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-sm text-foreground">Week {weekIdx + 1} — {week.weekLabel}</span>
                          </div>
                          <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
                        </button>

                        {isExpanded && (
                          <div className={cn("px-4 pb-4 pt-1 border-t", isLight ? "bg-slate-50 border-slate-100" : "bg-black/30 border-white/5")}>
                            {/* Render weekly grid for this week */}
                            <div className="space-y-5">
                              {weekDays.map((day, dayIndex) => {
                                const dayDate = week.days?.[dayIndex];
                                const dayFull = dayDate
                                  ? dayDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
                                  : day;

                                // Get assignments for this week and day
                                const weekAssignments = (allAssignmentsQuery.data ?? []).filter(
                                  a => a.assignment.weekLabel === week.weekLabel
                                );

                                const floorOrder = (floorId: number) => {
                                  const assigned = weekAssignments.filter(a => a.assignment.floorId === floorId);
                                  const planned = (plannedOrdersByFloor.get(floorId) || []).filter(
                                    id => !assigned.some(a => a.order.id === id)
                                  );
                                  return {
                                    assigned: assigned.map(a => ({ type: "assigned" as const, ...a })),
                                    planned: planned.map(id => ({ type: "planned" as const, orderId: id })),
                                  };
                                };

                                const totalDayKg = floors.reduce((sum, floor) => {
                                  const rows = weekAssignments.filter(a => a.assignment.floorId === floor.id && a.assignment.assignedDay === day);
                                  return sum + rows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                                }, 0);

                                return (
                                  <div key={day}>
                                    <div className="flex items-center gap-3 mb-3">
                                      <div className={cn("h-px flex-none w-2", isLight ? "bg-slate-300" : "bg-white/20")} />
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className={cn("text-xs font-bold uppercase tracking-widest", isLight ? "text-slate-700" : "text-foreground")}>{dayFull}</span>
                                        {totalDayKg > 0 && (
                                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold",
                                            isLight ? "border-slate-200 text-slate-500 bg-slate-50" : "border-white/10 text-muted-foreground bg-white/5"
                                          )}>{totalDayKg.toLocaleString()} KG total</span>
                                        )}
                                      </div>
                                      <div className={cn("h-px flex-1", isLight ? "bg-slate-200" : "bg-white/10")} />
                                    </div>

                                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${floors.length}, minmax(0, 1fr))` }}>
                                      {floors.map(floor => {
                                        const dayRows = weekAssignments.filter(r => r.assignment.floorId === floor.id && r.assignment.assignedDay === day);
                                        const dayKg = dayRows.reduce((s, r) => s + (r.assignment.assignedVolume != null ? Number(r.assignment.assignedVolume) : Number(mdpOrderByMdpId.get(r.order.id)?.volume ?? r.order.volume ?? 0)), 0);
                                        const dayUtil = Math.min(100, Math.round((dayKg / (floor.maxCapacityKg || 1)) * 100));
                                        const utilBar = dayUtil > 90 ? "bg-red-500" : dayUtil > 70 ? "bg-amber-500" : "bg-emerald-500";

                                        return (
                                          <div key={floor.id}
                                            className={cn("relative rounded-2xl border flex flex-col transition-colors",
                                              dragOverFloorId === floor.id ? "border-primary/50 bg-primary/5" : isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/5"
                                            )}
                                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverFloorId(floor.id); }}
                                            onDragLeave={() => setDragOverFloorId(c => c === floor.id ? null : c)}
                                            onDrop={e => { e.stopPropagation(); handleDropOnFloorDay(floor, day, e, week.weekLabel); }}
                                          >
                                            <div className={cn("px-4 py-3 border-b rounded-t-2xl", isLight ? "bg-slate-100 border-slate-100" : "bg-black/40 border-white/5")}>
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                  <p className="text-sm font-bold text-foreground">{floor.floorName}</p>
                                                  <p className="text-xs text-muted-foreground">{floor.blendCategory}</p>
                                                </div>
                                                <div className="text-right text-xs text-muted-foreground">
                                                  <div className="font-medium">{(floor.maxCapacityKg - dayKg).toLocaleString()} KG left</div>
                                                  <div className={cn("mt-1 h-1.5 w-16 overflow-hidden rounded-full", isLight ? "bg-slate-200" : "bg-white/10")}>
                                                    <div className={`${utilBar} h-full transition-all`} style={{ width: `${dayUtil}%` }} />
                                                  </div>
                                                </div>
                                              </div>
                                            </div>

                                            <div className={cn("flex-1 px-3 py-2 min-h-[80px]",
                                              isLight ? "bg-white" : "bg-black/20"
                                            )}>
                                              {dayRows.length === 0
                                                ? <div className="flex h-full items-center justify-center text-xs text-muted-foreground/60">Drag to assign</div>
                                                : <div className="space-y-1.5">{dayRows.map(row => makeOrderCard(floor.id)(row))}</div>
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
                          </div>
                        )}
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

        {/* Divider is desktop-only — on mobile the two panes stack so there
            is nothing to drag-resize. */}
        <div
          className={cn("hidden lg:block cursor-col-resize", isLight ? "bg-slate-200" : "bg-white/10")}
          style={{ width: 10, minWidth: 10, maxWidth: 10 }}
          onMouseDown={() => setIsDividerDragging(true)}
        />

        <div
          style={isMdUp ? { width: `${100 - splitPercent}%` } : undefined}
          className="flex flex-col overflow-hidden p-3 sm:p-5 gap-4 w-full lg:w-auto"
        >
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
                      // Use order data directly first (has merged account info from API), then fallback to accountMap
                      const company = order.accountName ?? order.accountCompany ?? acc?.company ?? "Unknown account";
                      const productName = order.productName ?? acc?.productName ?? null;
                      const productType = order.productType ?? acc?.productType ?? null;
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
                                {order.expectedDeliveryDateDate && (
                                  <span className="text-[11px] text-muted-foreground">· Due: {order.expectedDeliveryDateDate}</span>
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
                    <div>
                      <label className={lCls}>Product Types This Floor Can Blend</label>
                      <div className="flex flex-wrap gap-2">
                        {typeOpts.options.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No product types defined yet.</p>
                        ) : typeOpts.options.map(opt => {
                          const selected = editFloorForm.allowedProductTypes.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setEditFloorForm(prev => ({
                                ...prev,
                                allowedProductTypes: selected
                                  ? prev.allowedProductTypes.filter(t => t !== opt)
                                  : [...prev.allowedProductTypes, opt],
                              }))}
                              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                selected
                                  ? "bg-primary/15 border-primary/40 text-primary"
                                  : isLight
                                    ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                                    : "border-white/10 text-muted-foreground hover:bg-white/5",
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/40")} />
                              {displayLabel(opt)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>);
                })()}
              </div>
              <div className={cn("px-6 py-4 border-t flex gap-3", isLight ? "border-gray-100" : "border-white/5")}>
                <button onClick={() => updateFloorMutation.mutate({ id: editingFloor.id, floorName: editFloorForm.floorName, blendCategory: editFloorForm.blendCategory, maxCapacityKg: Number(editFloorForm.maxCapacityKg), allowedProductTypes: editFloorForm.allowedProductTypes })}
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
              blendSpeedTimeTaken={speed?.timeTakenMinutes ? `${speed.timeTakenMinutes} min` : ""}
              volume={partialVolume}
              onVolumeChange={setPartialVolume}
              onConfirm={handleConfirmPartialAssign}
              isLight={isLight}
              isPending={createAssignmentMutation.isPending}
            />
          );
        })()}
      </AnimatePresence>

      {/* AI Assisted Planning — summary panel after a run. Non-modal, sits in
          the bottom-right and stays dismissible so the planner can immediately
          adjust assignments manually. */}
      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            className="fixed bottom-6 right-6 z-[60] w-[360px] max-w-[92vw]"
          >
            <div className={cn(
              "rounded-2xl border shadow-2xl overflow-hidden",
              isLight ? "bg-white border-slate-200" : "bg-[#15172a] border-white/10",
            )}>
              <div className={cn(
                "px-4 py-3 border-b flex items-center justify-between gap-3",
                isLight ? "border-slate-100 bg-slate-50" : "border-white/10 bg-white/5",
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">🤖</span>
                  <p className={cn("text-sm font-semibold truncate", isLight ? "text-slate-900" : "text-foreground")}>
                    AI Planning summary
                  </p>
                </div>
                <button
                  onClick={() => setAiSummary(null)}
                  className={cn(
                    "p-1 rounded-lg transition-colors shrink-0",
                    isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/10 text-muted-foreground",
                  )}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-xs">
                {/* Planning Strategy Explanation */}
                <div className={cn("rounded-lg p-2.5", isLight ? "bg-blue-50" : "bg-blue-500/10")}>
                  <p className={cn("text-[11px] font-semibold mb-1", isLight ? "text-blue-700" : "text-blue-400")}>
                    Algorithm: Proactive Grouping
                  </p>
                  <p className={cn("text-[10px] leading-relaxed", isLight ? "text-blue-600" : "text-blue-300/90")}>
                    Orders grouped by product type, sorted by volume (largest first) + deadline (urgent first). Similar products assigned together to minimize product switches.
                  </p>
                </div>

                {/* Metrics */}
                {(() => {
                  const rows: { label: string; value: number; tone: string; description: string }[] = [
                    { label: "Fully scheduled", value: aiSummary.fullyScheduled.length, tone: "text-emerald-500", description: "Complete volume assigned before delivery date" },
                    { label: "Partially scheduled", value: aiSummary.partiallyScheduled.length, tone: "text-amber-500", description: "Assigned but with remaining volume — may need spillover to next week" },
                    { label: "Skipped (no floor / no capacity)", value: aiSummary.skipped.length, tone: "text-rose-500", description: "No capacity available before deadline, or no eligible floor for product type" },
                    { label: "Switching days created", value: aiSummary.switchDays.length, tone: isLight ? "text-slate-700" : "text-foreground", description: "Product transitions between types on same floor — unavoidable, but grouped to minimize" },
                    { label: "At-risk (past buffer)", value: aiSummary.atRisk.length, tone: "text-rose-500", description: "Critical orders with tight deadlines — assigned to earliest available slots" },
                  ];
                  return rows.map(r => (
                    <div key={r.label} className="group">
                      <div className={cn(
                        "flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors",
                        isLight ? "bg-slate-50 group-hover:bg-slate-100" : "bg-white/5 group-hover:bg-white/10",
                      )}>
                        <span className={cn(isLight ? "text-slate-600" : "text-muted-foreground")}>{r.label}</span>
                        <span className={cn("font-bold tabular-nums", r.tone)}>{r.value}</span>
                      </div>
                      <p className={cn("text-[9px] px-2.5 py-1 leading-relaxed", isLight ? "text-slate-500" : "text-muted-foreground/70")}>
                        {r.description}
                      </p>
                    </div>
                  ));
                })()}
                {aiSummary.partiallyScheduled.length > 0 && (
                  <details className={cn("mt-2 rounded-lg p-2", isLight ? "bg-amber-50" : "bg-amber-500/10")}>
                    <summary className="cursor-pointer text-[11px] font-semibold text-amber-500">
                      Partials — {aiSummary.partiallyScheduled.length}
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 text-[10px] text-amber-500/90">
                      {aiSummary.partiallyScheduled.slice(0, 6).map(p => (
                        <li key={p.orderId} className="truncate">{p.label} · {p.leftoverKg.toLocaleString()} KG left</li>
                      ))}
                      {aiSummary.partiallyScheduled.length > 6 && <li>… and {aiSummary.partiallyScheduled.length - 6} more</li>}
                    </ul>
                  </details>
                )}
                {aiSummary.skipped.length > 0 && (
                  <details className={cn("mt-1 rounded-lg p-2", isLight ? "bg-rose-50" : "bg-rose-500/10")}>
                    <summary className="cursor-pointer text-[11px] font-semibold text-rose-500">
                      ⚠️ Skipped — {aiSummary.skipped.length}
                    </summary>
                    <div className={cn("mt-2 text-[9px] p-1.5 rounded mb-2", isLight ? "bg-rose-100/50" : "bg-rose-500/20")}>
                      <p className={cn(isLight ? "text-rose-700" : "text-rose-300")}>
                        These orders couldn't fit before their delivery deadline, or have product type constraints preventing assignment.
                      </p>
                    </div>
                    <ul className="space-y-0.75 text-[10px] text-rose-500/90">
                      {aiSummary.skipped.slice(0, 6).map(p => (
                        <li key={p.orderId} className="flex items-start gap-1">
                          <span className="shrink-0 mt-0.5">•</span>
                          <div className="truncate">
                            <p className="font-medium truncate">{p.label}</p>
                            <p className={cn("text-[9px]", isLight ? "text-rose-600" : "text-rose-400/70")}>{p.reason}</p>
                          </div>
                        </li>
                      ))}
                      {aiSummary.skipped.length > 6 && (
                        <li className={cn("italic", isLight ? "text-rose-600" : "text-rose-400/70")}>
                          … and {aiSummary.skipped.length - 6} more
                        </li>
                      )}
                    </ul>
                    <p className={cn("mt-2 text-[9px] italic", isLight ? "text-rose-600" : "text-rose-400/60")}>
                      💡 Suggestion: Adjust delivery dates or allocate additional capacity to accommodate these orders.
                    </p>
                  </details>
                )}
                {/* Key Insights */}
                <div className={cn("mt-3 pt-3 border-t", isLight ? "border-slate-200" : "border-white/10")}>
                  <div className={cn("rounded-lg p-2", isLight ? "bg-slate-50" : "bg-white/5")}>
                    <p className={cn("text-[10px] font-semibold mb-1", isLight ? "text-slate-700" : "text-slate-300")}>
                      🎯 Planning Insights
                    </p>
                    <ul className={cn("space-y-1 text-[9px]", isLight ? "text-slate-600" : "text-slate-400")}>
                      <li>✓ Product groups kept together to reduce context switching</li>
                      <li>✓ Largest orders in each group assigned first for priority</li>
                      <li>✓ Urgent deadlines (Critical/Important) assigned to early week</li>
                      <li>✓ {aiSummary.switchDays.length} product transitions (minimal after grouping)</li>
                    </ul>
                  </div>
                </div>

                <p className={cn("mt-2 text-[10px] italic", isLight ? "text-slate-400" : "text-muted-foreground/70")}>
                  💡 Adjust any placement by dragging — the AI plan is a smart starting point, but your expertise matters.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDrop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className={cn(
                "border rounded-2xl shadow-2xl w-full max-w-md",
                isLight ? "bg-white border-gray-200" : "glass-panel border-white/10",
              )}
            >
              <div className="p-6">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-foreground">
                      {confirmDrop.floor.floorName} isn't configured for {confirmDrop.productLabel}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      This floor is set up for: <span className="font-medium text-foreground">{confirmDrop.allowedLabels}</span>.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">Continue with the drop anyway?</p>
                  </div>
                </div>
              </div>
              <div className={cn("px-6 py-4 border-t flex gap-3 justify-end", isLight ? "border-gray-100" : "border-white/5")}>
                <button
                  onClick={() => { setConfirmDrop(null); setDragged(null); }}
                  className={cn(
                    "px-4 py-2 border rounded-xl text-sm font-medium transition-colors",
                    isLight ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:bg-white/5",
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={() => proceedWithDrop(confirmDrop.floor, confirmDrop.order, confirmDrop.day, confirmDrop.draggedSnapshot, confirmDrop.weekLabelOverride)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Continue anyway
                </button>
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
                                        const runningBefore = assignmentRemainingMap[row.assignment.id]?.remainingBefore ?? totalVol;
                                        return (
                                          <div key={row.assignment.id} className="border border-slate-200 rounded-lg p-2 bg-white">
                                            <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{company}</p>
                                            {productName && <p className="text-[10px] text-slate-500 truncate">{productName}</p>}
                                            <div className="flex items-center justify-between mt-1.5 gap-1">
                                              <span className="text-[10px] font-semibold text-slate-700">
                                                {assignedVol.toLocaleString()} KG
                                                {runningBefore > 0 && runningBefore !== assignedVol && (
                                                  <span className="text-[9px] font-normal text-slate-400"> / of {runningBefore.toLocaleString()}</span>
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
                                            const runningBefore = assignmentRemainingMap[row.assignment.id]?.remainingBefore ?? totalVol;
                                            return (
                                              <div key={row.assignment.id} className="border border-indigo-200 rounded-lg p-2 bg-white">
                                                <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{company}</p>
                                                {productName && <p className="text-[10px] text-slate-500 truncate">{productName}</p>}
                                                <div className="flex items-center justify-between mt-1.5 gap-1">
                                                  <span className="text-[10px] font-semibold text-slate-700">
                                                    {assignedVol.toLocaleString()} KG
                                                    {runningBefore > 0 && runningBefore !== assignedVol && (
                                                      <span className="text-[9px] font-normal text-slate-400"> / of {runningBefore.toLocaleString()}</span>
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
                                      const runningBefore = assignmentRemainingMap[row.assignment.id]?.remainingBefore ?? totalVol;
                                      return (
                                        <div className={cn("rounded-xl border p-3", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
                                          <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0">
                                              <p className="font-bold text-foreground text-sm truncate">{company}</p>
                                              {productName && <p className="text-xs text-muted-foreground truncate">{productName}</p>}
                                            </div>
                                            <div className="text-right shrink-0">
                                              <span className="text-sm font-bold text-foreground">{assignedVol.toLocaleString()} KG</span>
                                              {runningBefore > 0 && runningBefore !== assignedVol && (
                                                <div className="text-[10px] text-muted-foreground/70 mt-0.5">of {runningBefore.toLocaleString()} to assign</div>
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
                                        const runningBefore = assignmentRemainingMap[row.assignment.id]?.remainingBefore ?? totalVol;
                                        return (
                                          <div className={cn("rounded-xl border p-3", isLight ? "border-indigo-100 bg-white" : "border-indigo-500/20 bg-indigo-500/5")}>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                              <div className="min-w-0">
                                                <p className="font-bold text-foreground text-sm truncate">{company}</p>
                                                {productName && <p className="text-xs text-muted-foreground truncate">{productName}</p>}
                                              </div>
                                              <div className="text-right shrink-0">
                                                <span className="text-sm font-bold text-foreground">{assignedVol.toLocaleString()} KG</span>
                                                {runningBefore > 0 && runningBefore !== assignedVol && (
                                                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">of {runningBefore.toLocaleString()} to assign</div>
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

