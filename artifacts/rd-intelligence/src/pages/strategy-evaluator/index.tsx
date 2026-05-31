import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, AlertTriangle, ChevronDown, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

interface ParsedDay {
  dayName: string;
  date: string;
  isWeekend: boolean;
  floors: { floorName: string; products: { name: string; volume: number }[] }[];
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

export default function StrategyEvaluatorTab() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const isLight = theme === "light";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsedDays, setParsedDays] = useState<ParsedDay[]>([]);
  const [confirmedProducts, setConfirmedProducts] = useState<ConfirmedProduct[]>([]);
  const [selectedZentryxWeek, setSelectedZentryxWeek] = useState<string>("");
  const [aiInsight, setAiInsight] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Fetch production orders for blend speed lookup
  const ordersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json() as Promise<any[]>;
    },
  });

  // Fetch floor assignments for Zentryx plan
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

  // Get unique weeks from assignments
  const allWeeks = useMemo(() => {
    const weeks = new Set<string>();
    assignmentsQuery.data?.forEach((row: any) => {
      if (row.assignment?.weekLabel) weeks.add(row.assignment.weekLabel);
    });
    return Array.from(weeks).sort();
  }, [assignmentsQuery.data]);

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
        toast({ title: "Document uploaded", description: "Proceeding to confirm details" });
        setStep(2);
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
    parsedDays.forEach((day) => {
      day.floors.forEach((floor) => {
        floor.products.forEach((product) => {
          const lookup = productLookup.get(product.name.toLowerCase());
          const blendSpeed = (lookup?.blendSpeedId || "medium") as "fast" | "medium" | "slow";
          const productType = lookup?.productType || "Unknown";
          const floorWarning = !checkFloorCompatibility(floor.floorName, productType, product.volume);

          products.push({
            dayName: day.dayName,
            date: day.date,
            isWeekend: day.isWeekend,
            floorName: floor.floorName,
            productName: product.name,
            volume: product.volume,
            blendSpeed,
            productType,
            floorWarning,
          });
        });
      });
    });
    setConfirmedProducts(products);
    setStep(3);
  }, [parsedDays]);

  // Group products for display
  const uploadedDaySummaries = useMemo(() => {
    const summaries: DayProductionSummary[] = [];
    parsedDays.forEach((day) => {
      let totalVolume = 0;
      const floorBreakdowns: { floorName: string; volume: number; switchCount: number }[] = [];

      day.floors.forEach((floor) => {
        const floorVolume = floor.products.reduce((sum, p) => sum + p.volume, 0);
        totalVolume += floorVolume;
        floorBreakdowns.push({
          floorName: floor.floorName,
          volume: floorVolume,
          switchCount: Math.max(0, floor.products.length - 1),
        });
      });

      summaries.push({
        dayName: day.dayName,
        totalVolume,
        floorBreakdowns,
        totalSwitches: floorBreakdowns.reduce((sum, fb) => sum + fb.switchCount, 0),
      });
    });
    return summaries;
  }, [parsedDays]);

  // Group Zentryx assignments
  const zentryxDaySummaries = useMemo(() => {
    const summaries: DayProductionSummary[] = [];
    const dayMap = new Map<string, { volume: number; floorProducts: Map<string, number> }>();

    assignmentsQuery.data?.forEach((row: any) => {
      if (row.assignment?.weekLabel === selectedZentryxWeek) {
        const day = row.assignment.assignedDay || "Unknown";
        const volume = Number(row.assignment.assignedVolume || 0);
        const floor = row.floor?.floorName || "Unknown";

        if (!dayMap.has(day)) {
          dayMap.set(day, { volume: 0, floorProducts: new Map() });
        }
        const dayData = dayMap.get(day)!;
        dayData.volume += volume;
        const currentCount = dayData.floorProducts.get(floor) || 0;
        dayData.floorProducts.set(floor, currentCount + 1);
      }
    });

    Array.from(dayMap.entries()).forEach(([dayName, data]) => {
      const floorBreakdowns: { floorName: string; volume: number; switchCount: number }[] = [];
      Array.from(data.floorProducts.entries()).forEach(([floorName, productCount]) => {
        const floorAssignments = assignmentsQuery.data?.filter(
          (row: any) => row.assignment?.weekLabel === selectedZentryxWeek && row.assignment?.assignedDay === dayName && row.floor?.floorName === floorName
        );
        const floorVolume = floorAssignments?.reduce((sum: number, row: any) => sum + Number(row.assignment?.assignedVolume || 0), 0) || 0;
        floorBreakdowns.push({
          floorName,
          volume: floorVolume,
          switchCount: Math.max(0, productCount - 1),
        });
      });

      summaries.push({
        dayName,
        totalVolume: data.volume,
        floorBreakdowns,
        totalSwitches: floorBreakdowns.reduce((sum, fb) => sum + fb.switchCount, 0),
      });
    });

    return summaries.sort((a, b) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(a.dayName) - ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(b.dayName));
  }, [assignmentsQuery.data, selectedZentryxWeek]);

  // Calculate totals
  const uploadedTotal = uploadedDaySummaries.reduce((sum, d) => sum + d.totalVolume, 0);
  const zentryxTotal = zentryxDaySummaries.reduce((sum, d) => sum + d.totalVolume, 0);
  const uploadedTotalSwitches = uploadedDaySummaries.reduce((sum, d) => sum + d.totalSwitches, 0);
  const zentryxTotalSwitches = zentryxDaySummaries.reduce((sum, d) => sum + d.totalSwitches, 0);

  const getAIInsight = useCallback(async () => {
    if (!selectedZentryxWeek || uploadedTotal === 0 || zentryxTotal === 0) return;
    setAiLoading(true);

    try {
      const uploadedSummary = `${uploadedDaySummaries.length} days planned, ${uploadedTotalSwitches} total product switches`;
      const zentryxSummary = `${zentryxDaySummaries.length} days planned, ${zentryxTotalSwitches} total product switches`;

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
  }, [selectedZentryxWeek, uploadedTotal, zentryxTotal, uploadedDaySummaries, zentryxDaySummaries, uploadedTotalSwitches, zentryxTotalSwitches, toast]);

  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Upload Production Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">Upload your weekly production plan (PDF or DOCX format)</p>
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
      </div>
    );
  }

  if (step === 2) {
    // Compute table rows inline
    const tableRows: Array<any> = [];
    parsedDays.forEach((day) => {
      day.floors.forEach((floor) => {
        floor.products.forEach((product) => {
          tableRows.push({
            dayName: day.dayName,
            date: day.date,
            isWeekend: day.isWeekend,
            floorName: floor.floorName,
            productName: product.name,
            volume: product.volume,
          });
        });
      });
    });
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Confirm Product Details</h2>
          <p className="text-sm text-muted-foreground mt-1">Review extracted products and confirm blend speeds and types</p>
        </div>

        <div className={cn("rounded-lg overflow-hidden border", isLight ? "border-slate-200" : "border-white/10")}>
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
                const productType = lookup?.productType || "Unknown";
                const floorWarning = !checkFloorCompatibility(row.floorName, productType, row.volume);

                return (
                <tr key={idx} className={isLight ? "border-t border-slate-200" : "border-t border-white/5"}>
                  <td className="px-4 py-2 text-xs">{row.dayName}</td>
                  <td className="px-4 py-2 text-xs">{row.floorName}</td>
                  <td className="px-4 py-2 text-xs font-medium">{row.productName}</td>
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
                    </select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {floorWarning && (
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

        <div className="flex gap-3">
          <button
            onClick={() => setStep(1)}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium border", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}
          >
            Back
          </button>
          <button
            onClick={handleConfirmProducts}
            className="ml-auto px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Compare Plans →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Comparison Results</h2>
        <p className="text-sm text-muted-foreground mt-1">Select Zentryx week to compare against your uploaded plan</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground py-2">Zentryx week:</span>
        {allWeeks.map((week) => (
          <button
            key={week}
            onClick={() => setSelectedZentryxWeek(week)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
              selectedZentryxWeek === week
                ? "border-blue-500 bg-blue-500/10 text-blue-600"
                : isLight
                ? "border-slate-200 hover:bg-slate-50"
                : "border-white/10 hover:bg-white/5"
            )}
          >
            {week}
          </button>
        ))}
      </div>

      {/* Comparison Grids */}
      <div className="grid grid-cols-2 gap-6">
        {/* Uploaded Plan */}
        <div className={cn("rounded-lg border p-4", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wide">Uploaded Plan</h3>
          <div className="space-y-3">
            {uploadedDaySummaries.map((day) => (
              <div key={day.dayName} className={cn("rounded p-3", isLight ? "bg-slate-50" : "bg-white/5")}>
                <p className="text-xs text-muted-foreground mb-1">{day.dayName}</p>
                <p className="text-lg font-bold text-foreground">{Math.round(day.totalVolume).toLocaleString()} kg</p>
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  {day.floorBreakdowns.map((fb, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{fb.floorName}</span>
                      <span>{Math.round(fb.volume).toLocaleString()} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Zentryx Plan */}
        <div className={cn("rounded-lg border p-4", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wide">Zentryx Plan — {selectedZentryxWeek}</h3>
          <div className="space-y-3">
            {assignmentsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : zentryxDaySummaries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No assignments for this week</p>
            ) : (
              zentryxDaySummaries.map((day) => (
                <div key={day.dayName} className={cn("rounded p-3", isLight ? "bg-slate-50" : "bg-white/5")}>
                  <p className="text-xs text-muted-foreground mb-1">{day.dayName}</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{Math.round(day.totalVolume).toLocaleString()} kg</p>
                  <div className="text-xs text-muted-foreground mt-2 space-y-1">
                    {day.floorBreakdowns.map((fb, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{fb.floorName}</span>
                        <span>{Math.round(fb.volume).toLocaleString()} kg</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Comparison Summary */}
      <div className={cn("rounded-lg border p-4", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
        <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wide">Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Planned Output (KG)</span>
            <div className="flex gap-12">
              <span className="font-medium">{Math.round(uploadedTotal).toLocaleString()}</span>
              <span className="font-medium text-blue-600">{Math.round(zentryxTotal).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Product Switches</span>
            <div className="flex gap-12">
              <span className="font-medium">{uploadedTotalSwitches}</span>
              <span className="font-medium text-blue-600">{zentryxTotalSwitches}</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active Production Days</span>
            <div className="flex gap-12">
              <span className="font-medium">{uploadedDaySummaries.length}</span>
              <span className="font-medium text-blue-600">{zentryxDaySummaries.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Verdict */}
      {uploadedTotal > 0 && zentryxTotal > 0 && (
        <div
          className={cn("rounded-lg p-4 flex gap-3", zentryxTotal > uploadedTotal ? (isLight ? "bg-emerald-50 border border-emerald-200" : "bg-emerald-500/10 border border-emerald-500/20") : isLight ? "bg-amber-50 border border-amber-200" : "bg-amber-500/10 border border-amber-500/20")}
        >
          <Check className={cn("w-5 h-5 flex-shrink-0 mt-0.5", zentryxTotal > uploadedTotal ? "text-emerald-600" : "text-amber-600")} />
          <div>
            <p className={cn("text-sm font-medium", zentryxTotal > uploadedTotal ? "text-emerald-900 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200")}>
              {zentryxTotal > uploadedTotal ? "Zentryx plan is more efficient" : "Uploaded plan is more efficient"}
            </p>
            <p className={cn("text-xs mt-1", zentryxTotal > uploadedTotal ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
              {((Math.abs(zentryxTotal - uploadedTotal) / Math.max(uploadedTotal, zentryxTotal)) * 100).toFixed(1)}% difference with{" "}
              {Math.abs(zentryxTotalSwitches - uploadedTotalSwitches)} fewer switches
            </p>
          </div>
        </div>
      )}

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
          onClick={() => setStep(2)}
          className={cn("px-4 py-2 rounded-lg text-sm font-medium border", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}
        >
          Back
        </button>
      </div>
    </div>
  );
}
