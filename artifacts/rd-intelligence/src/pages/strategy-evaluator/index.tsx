import React, { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, AlertTriangle, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL;

interface ParsedEntry {
  day: string;
  floor: string;
  productName: string;
  volume: number;
}

interface ConfirmedRow extends ParsedEntry {
  blendSpeed: string;
  productType: string;
  autoMatched: boolean;
  edited: boolean;
  floorWarning: boolean;
}

function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = localStorage.getItem("rd_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

const FLOOR_RULES: Record<string, string[]> = {
  "Floor 1": ["Seasoning", "Pasta Sauce", "Breading", "Savoury Flavour", "Marinade", "Spice Mix"],
  "Floor 2": [],
  "Floor 3": ["Dairy Premix", "Sweet Flavour", "Snack Dusting", "Dough Premix", "Bread Premix"],
};

const CAPACITY = {
  1: { fast: 20900, medium: 12000, slow: 7500 },
  2: { any: 400 },
  3: { any: 7000 },
};

const SHIFT_HOURS = { day: 7.5, night: 6.5, sat: 6.5 };

async function parsePdf(file: File): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument(arrayBuffer).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ");
    }
    return text;
  } catch (err) {
    throw new Error("PDF parsing library not available. Please use DOCX format.");
  }
}

async function parseDocx(file: File): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    throw new Error("DOCX parsing library not available. Please use PDF format.");
  }
}

function extractParsedEntries(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const dayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
  const floorPattern = /\b(floor\s*[123]|main\s*line|2nd\s*line|new\s*floor)\b/i;
  const volumePattern = /(\d[\d,.]*)\s*(kg|kilograms?)?/i;

  const lines = text.split(/[\n;]/);
  let currentDay = "";
  let currentFloor = "";

  for (const line of lines) {
    const dayMatch = line.match(dayPattern);
    if (dayMatch) {
      currentDay = dayMatch[1].toLowerCase();
      continue;
    }

    const floorMatch = line.match(floorPattern);
    if (floorMatch) {
      currentFloor = floorMatch[1];
      continue;
    }

    if (currentDay && currentFloor) {
      const volumeMatch = line.match(volumePattern);
      if (volumeMatch) {
        const productNameMatch = line.match(/^[^0-9]*/)?.[0]?.trim() || "Product";
        const volume = parseFloat(volumeMatch[1].replace(/,/g, ""));
        entries.push({
          day: currentDay,
          floor: currentFloor,
          productName: productNameMatch,
          volume: isNaN(volume) ? 0 : volume,
        });
      }
    }
  }

  return entries;
}

export default function StrategyEvaluatorPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isLight = theme === "light";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsedPlan, setParsedPlan] = useState<ParsedEntry[]>([]);
  const [confirmedRows, setConfirmedRows] = useState<ConfirmedRow[]>([]);
  const [selectedZentryxWeek, setSelectedZentryxWeek] = useState("");

  // Fetch production orders for blend speed lookup
  const productionOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch production orders");
      return res.json() as Promise<any[]>;
    },
  });

  // Fetch floor assignments for Zentryx plan
  const zentryxAssignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments", selectedZentryxWeek],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments?week=${encodeURIComponent(selectedZentryxWeek)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json() as Promise<any[]>;
    },
    enabled: !!selectedZentryxWeek,
  });

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let text = "";
      if (file.name.endsWith(".pdf")) {
        text = await parsePdf(file);
      } else if (file.name.endsWith(".docx")) {
        text = await parseDocx(file);
      } else {
        toast({ title: "Invalid file", description: "Please upload a PDF or DOCX file", variant: "destructive" });
        return;
      }

      const entries = extractParsedEntries(text);
      if (entries.length === 0) {
        toast({ title: "No data found", description: "Could not extract production data from document", variant: "destructive" });
        return;
      }

      setParsedPlan(entries);
      setStep(2);
      toast({ title: "Document parsed", description: `Found ${entries.length} production entries` });
    } catch (err) {
      console.error(err);
      toast({ title: "Parse error", description: "Failed to parse document", variant: "destructive" });
    }
  }, [toast]);

  const handleConfirmAndCalculate = useCallback(() => {
    setConfirmedRows(
      parsedPlan.map((entry) => {
        const blendLookup = productionOrdersQuery.data?.find(
          (o) => o.productName?.toLowerCase() === entry.productName.toLowerCase()
        );

        const productType = blendLookup?.productType || entry.productName;
        const floorRules = FLOOR_RULES[entry.floor] || [];
        const floorWarning =
          entry.volume > 500 && entry.floor === "Floor 1" && !floorRules.includes(productType);

        return {
          ...entry,
          blendSpeed: blendLookup?.blendSpeedId || "medium",
          productType,
          autoMatched: !!blendLookup,
          edited: false,
          floorWarning,
        };
      })
    );
    setStep(3);
  }, [parsedPlan, productionOrdersQuery.data]);

  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Strategy Evaluator</h1>
          <p className="text-muted-foreground">Upload your production plan and compare it with Zentryx assignments</p>
        </div>

        <div className={cn("border-2 border-dashed rounded-2xl p-12 text-center transition-colors", isLight ? "border-slate-300 bg-slate-50 hover:border-primary/50" : "border-white/20 bg-black/20 hover:border-primary/50")}>
          <label className="cursor-pointer flex flex-col items-center gap-4">
            <div className={cn("p-4 rounded-xl", isLight ? "bg-white" : "bg-black/40")}>
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Upload your plan</p>
              <p className="text-xs text-muted-foreground mt-1">PDF or DOCX only</p>
            </div>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        <div className={cn("mt-8 p-4 rounded-xl flex gap-3", isLight ? "bg-blue-50 border border-blue-100" : "bg-blue-500/10 border border-blue-500/20")}>
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-400">
            This document is never stored or transmitted — it is parsed locally in your browser only.
          </p>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Confirm Blend Speeds</h1>
          <p className="text-muted-foreground">Review and adjust auto-matched blend speeds</p>
        </div>

        <div className={cn("border rounded-2xl overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <table className="w-full text-sm">
            <thead>
              <tr className={cn("border-b", isLight ? "bg-slate-50 border-slate-100" : "bg-black/40 border-white/5")}>
                <th className="px-4 py-3 text-left font-semibold">Day</th>
                <th className="px-4 py-3 text-left font-semibold">Floor</th>
                <th className="px-4 py-3 text-left font-semibold">Product</th>
                <th className="px-4 py-3 text-left font-semibold">Volume</th>
                <th className="px-4 py-3 text-left font-semibold">Blend Speed</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {parsedPlan.map((entry, idx) => {
                const blendLookup = productionOrdersQuery.data?.find(
                  (o) => o.productName?.toLowerCase() === entry.productName.toLowerCase()
                );

                return (
                  <tr key={idx} className={cn("border-b", isLight ? "border-slate-100 hover:bg-slate-50" : "border-white/5 hover:bg-white/[0.02]")}>
                    <td className="px-4 py-3 capitalize">{entry.day}</td>
                    <td className="px-4 py-3">{entry.floor}</td>
                    <td className="px-4 py-3">{entry.productName}</td>
                    <td className="px-4 py-3">{entry.volume} KG</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex px-2 py-1 rounded text-xs font-medium", blendLookup ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400")}>
                        {blendLookup?.blendSpeedId || "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{blendLookup?.productType || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={() => setStep(1)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold border transition-colors", isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}
          >
            <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
          </button>
          <button
            onClick={handleConfirmAndCalculate}
            className="ml-auto px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white text-sm font-semibold transition-all"
          >
            Continue <ChevronRight className="w-4 h-4 inline ml-1" />
          </button>
        </div>
      </div>
    );
  }

  if (productionOrdersQuery.isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Strategy Comparison</h1>
        <p className="text-muted-foreground">Side-by-side analysis of uploaded plan vs Zentryx assignments</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Uploaded Plan */}
        <div className={cn("border rounded-2xl p-6 overflow-hidden", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Uploaded Plan</h2>
          <div className="space-y-4">
            {confirmedRows.reduce<Record<string, ConfirmedRow[]>>((acc, row) => {
              const key = `${row.day}-${row.floor}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(row);
              return acc;
            }, {})).map(([key, rows]) => (
                <div key={key} className={cn("p-3 rounded-lg", isLight ? "bg-slate-50" : "bg-white/5")}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{key}</p>
                  <div className="space-y-1">
                    {rows.map((row, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="text-foreground">{row.productName}</span>
                        <span className="ml-2 text-muted-foreground">{row.volume} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Zentryx Plan */}
        <div className={cn("border rounded-2xl p-6", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Zentryx Plan</h2>
          <div className="text-muted-foreground text-sm">
            <p>Select a week to view Zentryx assignments</p>
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div className={cn("border rounded-2xl p-6", isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-500/10 border-emerald-500/20")}>
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Comparison Summary</h3>
        <p className="text-emerald-600 dark:text-emerald-500">Ready to compare strategies. Select a week in the Zentryx plan to view analysis.</p>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={() => setStep(2)}
          className={cn("px-4 py-2 rounded-xl text-sm font-semibold border transition-colors", isLight ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
        </button>
      </div>
    </div>
  );
}
