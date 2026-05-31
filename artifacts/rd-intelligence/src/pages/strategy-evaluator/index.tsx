import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, AlertTriangle, ChevronDown, Loader2, Check, Edit2, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

interface ParsedDay {
  dayName: string;
  date: string;
  isWeekend: boolean;
  floors: { floorName: string; products: { name: string; volume: number; detectedType?: string }[] }[];
}

interface ConfirmedProduct {
  dayName: string;
  date: string;
  isWeekend: boolean;
  floorName: string;
  productName: string;
  volume: number;
  blendSpeed: "fast" | "medium" | "slow";
  productType: string;
  floorWarning: boolean;
}

interface DayProductionSummary {
  dayName: string;
  totalVolume: number;
  floorBreakdowns: { floorName: string; volume: number; switchCount: number }[];
  totalSwitches: number;
}

function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = localStorage.getItem("rd_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

const FLOOR_RULES: Record<string, { allowed: string[]; maxVolume: number | null; minVolumeForType: Record<string, number> }> = {
  "Floor 1": {
    allowed: ["Seasoning", "Pasta Sauce", "Breading", "Savoury Flavour", "Marinade", "Spice Mix"],
    maxVolume: null,
    minVolumeForType: { "Savoury Flavour": 500, "Marinade": 500, "Spice Mix": 500 },
  },
  "Floor 2": {
    allowed: [],
    maxVolume: 400,
    minVolumeForType: {},
  },
  "Floor 3": {
    allowed: ["Dairy Premix", "Sweet Flavour", "Snack Dusting", "Dough Premix", "Bread Premix"],
    maxVolume: null,
    minVolumeForType: { "Sweet Flavour": 500 },
  },
};

const CAPACITY = {
  "Floor 1": { fast: 20900, medium: 12000, slow: 7500 },
  "Floor 2": { fast: 400, medium: 400, slow: 400 },
  "Floor 3": { fast: 7000, medium: 7000, slow: 7000 },
};

const SHIFT_HOURS = { day: 7.5, night: 6.5, saturday: 6.5 };

function calcFloorOutput(floor: string, blendSpeed: string, shiftType: "day" | "night" | "saturday", switchCount: number): number {
  const base = (CAPACITY as any)[floor]?.[blendSpeed] ?? 0;
  if (switchCount === 0) return base;
  const hours = SHIFT_HOURS[shiftType];
  return (base / hours) * Math.max(0, hours - switchCount);
}

function checkFloorCompatibility(floor: string, productType: string, volume: number): boolean {
  const rule = FLOOR_RULES[floor];
  if (!rule) return false;
  if (rule.allowed.length > 0 && !rule.allowed.includes(productType)) return false;
  if (rule.maxVolume && volume > rule.maxVolume) return false;
  const minRequired = rule.minVolumeForType[productType];
  if (minRequired && volume < minRequired) return false;
  return true;
}

function generateWeeksForDateRange(startDate: Date, endDate: Date): string[] {
  const weeks: string[] = [];
  const current = new Date(startDate);
  current.setDate(current.getDate() - current.getDay() + 1); // Start from Monday

  while (current <= endDate) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 4); // Friday of the same week

    const startFormatted = weekStart.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const endFormatted = weekEnd.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // Get day name
    const dayName = weekStart.toLocaleDateString("en-US", { weekday: "short" });
    const endDayName = weekEnd.toLocaleDateString("en-US", { weekday: "short" });

    weeks.push(`Week ${Math.ceil((current.getDate() + 6) / 7)}: ${dayName}, ${startFormatted} - ${endDayName}, ${endFormatted}`);
    current.setDate(current.getDate() + 7); // Move to next week
  }

  return weeks;
}

export default function StrategyEvaluatorTab() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const isLight = theme === "light";

  const [step, setStep] = useState<1 | 2>(1);
  const [parsedDays, setParsedDays] = useState<ParsedDay[]>([]);
  const [confirmedProducts, setConfirmedProducts] = useState<ConfirmedProduct[]>([]);
  const [selectedZentryxWeek, setSelectedZentryxWeek] = useState<string>("");
  const [aiInsight, setAiInsight] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [floorOverrides, setFloorOverrides] = useState<Map<string, string>>(new Map());
  const [dayRenames, setDayRenames] = useState<Map<string, string>>(new Map());
  const [productRenames, setProductRenames] = useState<Map<string, string>>(new Map());
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null);
  const [showProductTypeManager, setShowProductTypeManager] = useState(false);
  const [customProductTypes, setCustomProductTypes] = useState<any[]>([]);
  const [newTypeForm, setNewTypeForm] = useState({ name: "", keywords: "" });
  const [showTypeModal, setShowTypeModal] = useState(false);

  // Fetch production orders for blend speed lookup
  const ordersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json() as Promise<any[]>;
    },
  });

  // Fetch ALL floor assignments to get available weeks (always enabled)
  const allAssignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments/all"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json() as Promise<any[]>;
    },
  });

  // Fetch floor assignments filtered by selected week for detailed view
  const assignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments", selectedZentryxWeek],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments${selectedZentryxWeek ? `?week=${selectedZentryxWeek}` : ""}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json() as Promise<any[]>;
    },
    enabled: !!selectedZentryxWeek,
  });

  // Fetch custom product types
  const productTypesQuery = useQuery({
    queryKey: ["/api/mdp/product-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/product-types`, { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json() as Promise<any[]>;
    },
  });

  React.useEffect(() => {
    setCustomProductTypes(productTypesQuery.data || []);
  }, [productTypesQuery.data]);

  // Generate all weeks for date range (Jan 2026 to Dec 2026)
  const allWeeks = useMemo(() => {
    const startDate = new Date("2026-01-01");
    const endDate = new Date("2026-12-31");
    return generateWeeksForDateRange(startDate, endDate);
  }, []);

  // Auto-select first week if available
  React.useEffect(() => {
    if (allWeeks.length > 0 && !selectedZentryxWeek) {
      setSelectedZentryxWeek(allWeeks[0]);
    }
  }, [allWeeks, selectedZentryxWeek]);

  // Build product lookup from orders
  const productLookup = useMemo(() => {
    const map = new Map<string, { blendSpeedId: string; productType: string }>();
    ordersQuery.data?.forEach((order: any) => {
      if (order.productName) {
        map.set(order.productName.toLowerCase(), {
          blendSpeedId: order.blendSpeedId || "medium",
          productType: order.productType || "Unknown",
        });
      }
    });
    return map;
  }, [ordersQuery.data]);

  // Organize confirmed products by day and floor
  const uploadedPlanByDay = useMemo(() => {
    const dayMap = new Map<string, { date: string; isWeekend: boolean; floors: Map<string, { products: Array<{ name: string; volume: number; type: string }>; volume: number; productCount: number }> }>();
    confirmedProducts.forEach((product) => {
      if (!dayMap.has(product.dayName)) {
        dayMap.set(product.dayName, {
          date: product.date,
          isWeekend: product.isWeekend,
          floors: new Map(),
        });
      }
      const dayData = dayMap.get(product.dayName)!;
      const floorName = product.floorName;
      if (!dayData.floors.has(floorName)) {
        dayData.floors.set(floorName, { products: [], volume: 0, productCount: 0 });
      }
      const floorData = dayData.floors.get(floorName)!;
      floorData.products.push({ name: product.productName, volume: product.volume, type: product.productType });
      floorData.volume += product.volume;
      floorData.productCount += 1;
    });
    return dayMap;
  }, [confirmedProducts]);

  // Organize Zentryx assignments by day and shift
  const zentryxPlanByDay = useMemo(() => {
    const dayMap = new Map<string, {
      shifts: Map<string, { floors: Map<string, { products: Array<{ name: string; volume: number; type: string }>; volume: number; productCount: number }> }>
    }>();
    assignmentsQuery.data?.forEach((row: any) => {
      if (row.assignment?.weekLabel === selectedZentryxWeek) {
        const dayName = row.assignment.assignedDay || "Unknown";
        const shift = row.assignment.assignedShift || "Day";
        const floorName = row.floor?.floorName || "Unknown";
        const volume = Number(row.assignment.assignedVolume || 0);
        const productName = row.order?.productName || "Unknown Product";
        const productType = row.order?.productType || "Unknown";

        if (!dayMap.has(dayName)) {
          dayMap.set(dayName, { shifts: new Map() });
        }
        const dayData = dayMap.get(dayName)!;
        if (!dayData.shifts.has(shift)) {
          dayData.shifts.set(shift, { floors: new Map() });
        }
        const shiftData = dayData.shifts.get(shift)!;
        if (!shiftData.floors.has(floorName)) {
          shiftData.floors.set(floorName, { products: [], volume: 0, productCount: 0 });
        }
        const floorData = shiftData.floors.get(floorName)!;
        floorData.products.push({ name: productName, volume, type: productType });
        floorData.volume += volume;
        floorData.productCount += 1;
      }
    });
    return dayMap;
  }, [assignmentsQuery.data, selectedZentryxWeek]);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".docx") && !file.name.endsWith(".pdf")) {
        toast({ title: "Unsupported format", description: "Please upload a DOCX or PDF file", variant: "destructive" });
        return;
      }

      setUploading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let fileData = "";
        for (let i = 0; i < uint8Array.length; i++) {
          fileData += String.fromCharCode(uint8Array[i]);
        }
        const base64Data = btoa(fileData);

        const res = await fetch(`${BASE}api/mdp/parse-plan-document`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ fileData: base64Data, fileName: file.name }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Parse failed");
        }
        const { days } = await res.json();
        setParsedDays(days);
        toast({ title: "Document uploaded", description: "Review and confirm details below" });
      } catch (err) {
        console.error(err);
        toast({ title: "Upload failed", description: "Could not parse document", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [toast]
  );

  const handleConfirmProducts = useCallback(() => {
    const products: ConfirmedProduct[] = [];
    let rowIdx = 0;
    parsedDays.forEach((day) => {
      day.floors.forEach((floor) => {
        floor.products.forEach((product) => {
          const lookup = productLookup.get(product.name.toLowerCase());
          const blendSpeed = (lookup?.blendSpeedId || "medium") as "fast" | "medium" | "slow";
          const productType = lookup?.productType || "Unknown";

          // Use overridden floor if available, otherwise use parsed floor
          const rowKey = `${rowIdx}-${day.dayName}-${product.name}`;
          const finalFloor = floorOverrides.get(rowKey) || floor.floorName;
          const floorWarning = !checkFloorCompatibility(finalFloor, productType, product.volume);

          products.push({
            dayName: day.dayName,
            date: day.date,
            isWeekend: day.isWeekend,
            floorName: finalFloor,
            productName: product.name,
            volume: product.volume,
            blendSpeed,
            productType,
            floorWarning,
          });
          rowIdx++;
        });
      });
    });
    setConfirmedProducts(products);
    setStep(2);
  }, [parsedDays, floorOverrides]);

  const getAIInsight = useCallback(async () => {
    const uploadedTotal = confirmedProducts.reduce((sum, p) => sum + p.volume, 0);
    const zentryxTotal = Array.from(zentryxPlanByDay.values())
      .flatMap((d) => Array.from(d.shifts.values()))
      .flatMap((s) => Array.from(s.floors.values()))
      .reduce((sum, f) => sum + f.volume, 0);

    if (!selectedZentryxWeek || uploadedTotal === 0 || zentryxTotal === 0) return;
    setAiLoading(true);

    try {
      const uploadedSummary = `${uploadedPlanByDay.size} days planned, ${uploadedTotal.toLocaleString()} KG total volume`;
      const zentryxSummary = `${zentryxPlanByDay.size} days planned, ${zentryxTotal.toLocaleString()} KG total volume`;

      const res = await fetch(`${BASE}api/mdp/strategy-insight`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadedSummary,
          zentryxSummary,
          uploadedTotal: Math.round(uploadedTotal),
          zentryxTotal: Math.round(zentryxTotal),
          weekLabel: selectedZentryxWeek,
        }),
      });

      if (!res.ok) throw new Error("Insight generation failed");
      const { insight } = await res.json();
      setAiInsight(insight);
    } catch (err) {
      console.error(err);
      toast({ title: "AI analysis failed", description: "Could not generate insight", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }, [selectedZentryxWeek, confirmedProducts, uploadedPlanByDay, zentryxPlanByDay, toast]);

  if (step === 1) {
    // Compute table rows inline
    const tableRows: Array<any> = [];
    parsedDays.forEach((day, dayIdx) => {
      day.floors.forEach((floor) => {
        floor.products.forEach((product, prodIdx) => {
          tableRows.push({
            dayIdx,
            prodIdx,
            dayName: dayRenames.get(`day-${dayIdx}`) || day.dayName,
            originalDayName: day.dayName,
            date: day.date,
            isWeekend: day.isWeekend,
            floorName: floor.floorName,
            productName: productRenames.get(`product-${dayIdx}-${prodIdx}`) || product.name,
            originalProductName: product.name,
            volume: product.volume,
            productType: product.detectedType,
          });
        });
      });
    });

    const handleAddCustomType = async () => {
      if (!newTypeForm.name.trim()) return;
      const keywords = newTypeForm.keywords.split(",").map((k) => k.trim()).filter((k) => k);
      try {
        const res = await fetch(`${BASE}api/mdp/product-types`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ name: newTypeForm.name, keywords }),
        });
        if (res.ok) {
          await productTypesQuery.refetch();
          setNewTypeForm({ name: "", keywords: "" });
        }
      } catch (err) {
        console.error(err);
      }
    };

    const handleDeleteCustomType = async (id: string) => {
      try {
        const res = await fetch(`${BASE}api/mdp/product-types/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (res.ok) {
          await productTypesQuery.refetch();
        }
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <div className="space-y-6">
        {/* Upload Section */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Upload & Review Production Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">Upload your weekly production plan (PDF or DOCX format) and review extracted details</p>
        </div>

        <div
          className={cn(
            "border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer hover:border-primary/50",
            isLight ? "border-slate-300 bg-slate-50" : "border-white/20 bg-black/20"
          )}
        >
          <label className="cursor-pointer flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-primary" />
            <div>
              <p className="text-base font-semibold text-foreground">
                {uploading ? "Parsing document..." : "Upload your plan"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF or DOCX format</p>
            </div>
            {uploading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <input
              type="file"
              accept=".docx,.pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        <div className={cn("rounded-lg p-3 flex gap-2", isLight ? "bg-blue-50 border border-blue-200" : "bg-blue-500/10 border border-blue-500/20")}>
          <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            This document is processed server-side only and never stored on disk. It is used solely to extract production data for comparison.
          </p>
        </div>

        {/* Confirmation Section (shown only if document is uploaded) */}
        {parsedDays.length > 0 && (
          <>
            <div className="border-t pt-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground">Confirm Product Details</h3>
                <p className="text-sm text-muted-foreground mt-1">Review extracted products and confirm blend speeds and types</p>
              </div>

              {/* Custom Product Types Button */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowTypeModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                  style={isLight ? { borderColor: "#e2e8f0", backgroundColor: "#f8fafc", color: "#334155" } : { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", color: "#e2e8f0" }}
                >
                  <Plus className="w-4 h-4" /> Manage Product Types ({customProductTypes.length})
                </button>
              </div>

              {/* Modal Overlay */}
              {showTypeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className={cn("rounded-lg p-6 max-w-md w-full mx-4 space-y-4", isLight ? "bg-white" : "bg-slate-900")}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-foreground">Manage Product Types</h3>
                      <button
                        onClick={() => setShowTypeModal(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Add Form */}
                    <div className="space-y-3 pb-4 border-b" style={isLight ? { borderColor: "#e2e8f0" } : { borderColor: "rgba(255,255,255,0.1)" }}>
                      <input
                        type="text"
                        placeholder="Type name"
                        value={newTypeForm.name}
                        onChange={(e) => setNewTypeForm({ ...newTypeForm, name: e.target.value })}
                        className="w-full text-sm px-3 py-2 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
                      />
                      <input
                        type="text"
                        placeholder="Keywords (comma-separated)"
                        value={newTypeForm.keywords}
                        onChange={(e) => setNewTypeForm({ ...newTypeForm, keywords: e.target.value })}
                        className="w-full text-sm px-3 py-2 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
                      />
                      <button
                        onClick={handleAddCustomType}
                        className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700"
                      >
                        Add Custom Type
                      </button>
                    </div>

                    {/* List */}
                    {customProductTypes.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {customProductTypes.map((type) => (
                          <div key={type.id} className={cn("flex items-center justify-between p-3 rounded", isLight ? "bg-slate-50" : "bg-white/5")}>
                            <div className="flex-1">
                              <p className="font-semibold text-sm">{type.name}</p>
                              <p className="text-xs text-muted-foreground">{type.keywords.join(", ")}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteCustomType(type.id)}
                              className="p-2 hover:bg-red-500/20 rounded text-red-600 ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No custom types yet</p>
                    )}
                  </div>
                </div>
              )}

              <div className={cn("rounded-lg overflow-hidden border", isLight ? "border-slate-200 bg-white" : "border-white/10")}>
                <table className="w-full text-sm">
                  <thead className={cn("", isLight ? "bg-slate-100" : "bg-white/5")}>
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-xs uppercase">Day</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs uppercase">Floor</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs uppercase">Product</th>
                      <th className="px-4 py-2 text-right font-semibold text-xs uppercase">Volume (kg)</th>
                      <th className="px-4 py-2 text-center font-semibold text-xs uppercase">Blend Speed</th>
                      <th className="px-4 py-2 text-center font-semibold text-xs uppercase">Product Type</th>
                      <th className="px-4 py-2 text-center font-semibold text-xs uppercase"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => {
                      const lookup = productLookup.get(row.productName.toLowerCase());
                      const blendSpeed = (lookup?.blendSpeedId || "medium") as "fast" | "medium" | "slow";
                      const productType = row.productType || lookup?.productType || "Unknown";
                      const floorWarning = !checkFloorCompatibility(row.floorName, productType, row.volume);

                      const rowKey = `${idx}-${row.dayName}-${row.productName}`;
                      const selectedFloor = floorOverrides.get(rowKey) || row.floorName;
                      const adjustedFloorWarning = !checkFloorCompatibility(selectedFloor, productType, row.volume);

                      const dayKey = `day-${row.dayIdx}`;
                      const productKey = `product-${row.dayIdx}-${row.prodIdx}`;
                      const isEditingDay = editingDayIdx === row.dayIdx;
                      const isEditingProduct = editingProductKey === productKey;

                      return (
                      <tr key={idx} className={isLight ? "border-t border-slate-200" : "border-t border-white/5"}>
                        <td className="px-4 py-2 text-xs">
                          {isEditingDay ? (
                            <div className="flex gap-1 items-center">
                              <input
                                autoFocus
                                type="text"
                                defaultValue={row.dayName}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    setDayRenames(new Map(dayRenames).set(dayKey, e.target.value));
                                  }
                                  setEditingDayIdx(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    if (e.currentTarget.value.trim()) {
                                      setDayRenames(new Map(dayRenames).set(dayKey, e.currentTarget.value));
                                    }
                                    setEditingDayIdx(null);
                                  } else if (e.key === "Escape") {
                                    setEditingDayIdx(null);
                                  }
                                }}
                                className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-white/20 bg-white dark:bg-black/30 w-20"
                              />
                            </div>
                          ) : (
                            <div className="flex gap-1 items-center group">
                              <span>{row.dayName}</span>
                              <button
                                onClick={() => setEditingDayIdx(row.dayIdx)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={selectedFloor}
                            onChange={(e) => {
                              const newMap = new Map(floorOverrides);
                              newMap.set(rowKey, e.target.value);
                              setFloorOverrides(newMap);
                            }}
                            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
                          >
                            <option value="Floor 1">Floor 1</option>
                            <option value="Floor 2">Floor 2</option>
                            <option value="Floor 3">Floor 3</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-xs font-medium">
                          {isEditingProduct ? (
                            <div className="flex gap-1 items-center">
                              <input
                                autoFocus
                                type="text"
                                defaultValue={row.productName}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    setProductRenames(new Map(productRenames).set(productKey, e.target.value));
                                  }
                                  setEditingProductKey(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    if (e.currentTarget.value.trim()) {
                                      setProductRenames(new Map(productRenames).set(productKey, e.currentTarget.value));
                                    }
                                    setEditingProductKey(null);
                                  } else if (e.key === "Escape") {
                                    setEditingProductKey(null);
                                  }
                                }}
                                className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-white/20 bg-white dark:bg-black/30 flex-1"
                              />
                            </div>
                          ) : (
                            <div className="flex gap-1 items-center group">
                              <span>{row.productName}</span>
                              <button
                                onClick={() => setEditingProductKey(productKey)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-right">{Math.round(row.volume).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <select
                            defaultValue={blendSpeed}
                            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
                          >
                            <option value="fast">Fast</option>
                            <option value="medium">Medium</option>
                            <option value="slow">Slow</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            defaultValue={productType}
                            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
                          >
                            <option value="Seasoning">Seasoning</option>
                            <option value="Pasta Sauce">Pasta Sauce</option>
                            <option value="Breading">Breading</option>
                            <option value="Savoury Flavour">Savoury Flavour</option>
                            <option value="Marinade">Marinade</option>
                            <option value="Spice Mix">Spice Mix</option>
                            <option value="Dairy Premix">Dairy Premix</option>
                            <option value="Sweet Flavour">Sweet Flavour</option>
                            <option value="Snack Dusting">Snack Dusting</option>
                            <option value="Dough Premix">Dough Premix</option>
                            <option value="Bread Premix">Bread Premix</option>
                            <option value="Unknown">Unknown</option>
                            {customProductTypes.length > 0 && (
                              <>
                                <option disabled>─ Custom ─</option>
                                {customProductTypes.map((type) => (
                                  <option key={type.id} value={type.name}>
                                    {type.name}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {adjustedFloorWarning && (
                            <div title="Floor compatibility warning" className="inline-block">
                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleConfirmProducts}
                  className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Compare Plans →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (step === 2) {
    return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Comparison Results</h2>
        <p className="text-sm text-muted-foreground mt-1">Select Zentryx week to compare against your uploaded plan</p>
      </div>

      <div className="flex gap-4 items-center">
        <label className="text-xs text-muted-foreground">Choose a week:</label>
        <select
          value={selectedZentryxWeek || ""}
          onChange={(e) => setSelectedZentryxWeek(e.target.value)}
          className={cn(
            "px-4 py-2 rounded-lg text-sm border transition-all",
            isLight
              ? "bg-white border-slate-200 text-foreground"
              : "bg-black/20 border-white/10 text-foreground"
          )}
        >
          <option value="">Select a week...</option>
          {allWeeks.map((week) => (
            <option key={week} value={week}>
              {week}
            </option>
          ))}
        </select>
      </div>

      {/* Day-by-Day Comparison */}
      <div className="grid grid-cols-2 gap-6">
        {/* Uploaded Plan */}
        <div className={cn("rounded-lg border p-4 space-y-4", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Uploaded Plan — Day by Day</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {confirmedProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No products confirmed yet</p>
            ) : (
              Array.from(
                new Map([...uploadedPlanByDay.entries()].sort((a, b) => {
                  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                  return dayOrder.indexOf(a[0]) - dayOrder.indexOf(b[0]);
                }))
              ).map(([dayName, dayData]) => (
                <div key={dayName} className={cn("rounded p-3", isLight ? "bg-slate-50" : "bg-white/5")}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-foreground">{dayName}</span>
                    <span className="text-xs text-muted-foreground">{dayData.date}</span>
                  </div>
                  <div className="text-lg font-bold text-green-600 mb-2">
                    {Array.from(dayData.floors.values()).reduce((sum, f) => sum + f.volume, 0).toLocaleString()} kg
                  </div>
                  <div className="space-y-2">
                    {Array.from(dayData.floors.entries()).map(([floorName, floorData]) => (
                      <div key={floorName}>
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-foreground">{floorName}</span>
                          <span className="text-muted-foreground">{floorData.volume.toLocaleString()} kg</span>
                        </div>
                        {floorData.products.length > 0 && (
                          <div className="ml-2 space-y-0.5">
                            {floorData.products.map((prod, idx) => (
                              <div key={idx} className="text-xs text-muted-foreground">
                                • {prod.name}: {prod.volume.toLocaleString()} kg
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Zentryx Plan */}
        <div className={cn("rounded-lg border p-4 space-y-4", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h3 className="text-sm font-bold text-blue-500 uppercase tracking-wide">Zentryx Plan — {selectedZentryxWeek || "Select Week"}</h3>
          {selectedZentryxWeek && zentryxPlanByDay.size === 0 ? (
            <p className="text-xs text-muted-foreground">No assignments for this week</p>
          ) : !selectedZentryxWeek ? (
            <p className="text-xs text-muted-foreground">Select a week to view assignments</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {Array.from(
                new Map([...zentryxPlanByDay.entries()].sort((a, b) => {
                  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                  return dayOrder.indexOf(a[0]) - dayOrder.indexOf(b[0]);
                }))
              ).map(([dayName, dayData]) => (
                <div key={dayName} className={cn("rounded p-3", isLight ? "bg-slate-50" : "bg-white/5")}>
                  <div className="text-xs font-semibold text-foreground mb-2">{dayName}</div>
                  <div className="text-lg font-bold text-blue-600 mb-2">
                    {Array.from(dayData.shifts.values()).flatMap((s) => Array.from(s.floors.values())).reduce((sum, f) => sum + f.volume, 0).toLocaleString()} kg
                  </div>
                  <div className="space-y-2">
                    {Array.from(dayData.shifts.entries()).map(([shift, shiftData]) => {
                      const shiftVolume = Array.from(shiftData.floors.values()).reduce((sum, f) => sum + f.volume, 0);
                      return (
                        <div key={shift}>
                          <div className="text-xs text-blue-600 font-medium">{shift}: {shiftVolume.toLocaleString()} kg</div>
                          {Array.from(shiftData.floors.entries()).map(([floorName, floorData]) => (
                            <div key={floorName} className="ml-2 space-y-1">
                              <div className="flex justify-between text-xs font-medium">
                                <span>{floorName}</span>
                                <span className="text-muted-foreground">{floorData.volume.toLocaleString()} kg</span>
                              </div>
                              {floorData.products.length > 0 && (
                                <div className="ml-2 space-y-0.5">
                                  {floorData.products.map((prod, idx) => (
                                    <div key={idx} className="text-xs text-muted-foreground">
                                      • {prod.name}: {prod.volume.toLocaleString()} kg
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary Table */}
      <div className={cn("rounded-lg border overflow-x-auto", isLight ? "border-slate-200" : "border-white/10")}>
        <table className="w-full text-sm">
          <thead className={cn("", isLight ? "bg-slate-100" : "bg-white/5")}>
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-xs uppercase">Metric</th>
              <th className="px-4 py-2 text-center font-semibold text-xs uppercase">Uploaded</th>
              <th className="px-4 py-2 text-center font-semibold text-xs uppercase">Zentryx</th>
            </tr>
          </thead>
          <tbody>
            <tr className={isLight ? "border-t border-slate-200" : "border-t border-white/5"}>
              <td className="px-4 py-2 text-xs font-medium">Total Volume (KG)</td>
              <td className="px-4 py-2 text-center text-xs font-semibold text-green-600">
                {confirmedProducts.reduce((sum, p) => sum + p.volume, 0).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-center text-xs font-semibold text-blue-600">
                {Array.from(zentryxPlanByDay.values())
                  .flatMap((d) => Array.from(d.shifts.values()))
                  .flatMap((s) => Array.from(s.floors.values()))
                  .reduce((sum, f) => sum + f.volume, 0)
                  .toLocaleString()}
              </td>
            </tr>
            <tr className={isLight ? "border-t border-slate-200" : "border-t border-white/5"}>
              <td className="px-4 py-2 text-xs font-medium">Active Days</td>
              <td className="px-4 py-2 text-center text-xs font-semibold">{uploadedPlanByDay.size}</td>
              <td className="px-4 py-2 text-center text-xs font-semibold">{zentryxPlanByDay.size}</td>
            </tr>
            <tr className={isLight ? "border-t border-slate-200" : "border-t border-white/5"}>
              <td className="px-4 py-2 text-xs font-medium">Total Product Switches</td>
              <td className="px-4 py-2 text-center text-xs font-semibold text-green-600">
                {Array.from(uploadedPlanByDay.values())
                  .reduce((total, dayData) => {
                    return (
                      total +
                      Array.from(dayData.floors.values()).reduce(
                        (dayTotal, floorData) => dayTotal + Math.max(0, floorData.productCount - 1),
                        0
                      )
                    );
                  }, 0)}
              </td>
              <td className="px-4 py-2 text-center text-xs font-semibold text-blue-600">
                {Array.from(zentryxPlanByDay.values())
                  .reduce((total, dayData) => {
                    return (
                      total +
                      Array.from(dayData.shifts.values()).reduce((dayTotal, shiftData) => {
                        return (
                          dayTotal +
                          Array.from(shiftData.floors.values()).reduce(
                            (shiftTotal, floorData) => shiftTotal + Math.max(0, floorData.productCount - 1),
                            0
                          )
                        );
                      }, 0)
                    );
                  }, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* AI Insight */}
      <button
        onClick={getAIInsight}
        disabled={aiLoading || !selectedZentryxWeek}
        className="w-full px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {aiLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        Get AI Analysis
      </button>

      {aiInsight && (
        <div className={cn("rounded-lg p-4", isLight ? "bg-blue-50 border border-blue-200" : "bg-blue-500/10 border border-blue-500/20")}>
          <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">{aiInsight}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className={cn("px-4 py-2 rounded-lg text-sm font-medium border", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}
        >
          Back
        </button>
      </div>
    </div>
  );
}
