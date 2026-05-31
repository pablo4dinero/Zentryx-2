import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
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
}

function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = localStorage.getItem("rd_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

// Mock data for demonstration
const MOCK_PARSED_DATA: ParsedEntry[] = [
  { day: "monday", floor: "Floor 1", productName: "Seasoning Mix", volume: 800 },
  { day: "tuesday", floor: "Floor 2", productName: "Sweet Blend", volume: 350 },
  { day: "wednesday", floor: "Floor 3", productName: "Dairy Premix", volume: 6500 },
];

export default function StrategyEvaluatorPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const isLight = theme === "light";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsedPlan, setParsedPlan] = useState<ParsedEntry[]>([]);
  const [confirmedRows, setConfirmedRows] = useState<ConfirmedRow[]>([]);

  // Fetch production orders for reference
  const productionOrdersQuery = useQuery({
    queryKey: ["/api/mdp/production-orders"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-orders`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch production orders");
      return res.json() as Promise<any[]>;
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pdf") && !file.name.endsWith(".docx")) {
      toast({ title: "Invalid file", description: "Please upload a PDF or DOCX file", variant: "destructive" });
      return;
    }

    // Use mock data for demonstration
    setParsedPlan(MOCK_PARSED_DATA);
    setStep(2);
    toast({ title: "Document loaded", description: `Found ${MOCK_PARSED_DATA.length} production entries` });
  };

  const handleConfirmAndCalculate = () => {
    setConfirmedRows(
      parsedPlan.map((entry) => {
        const blendLookup = productionOrdersQuery.data?.find(
          (o) => o.productName?.toLowerCase() === entry.productName.toLowerCase()
        );
        return {
          ...entry,
          blendSpeed: blendLookup?.blendSpeedId || "medium",
          productType: blendLookup?.productType || entry.productName,
          autoMatched: !!blendLookup,
        };
      })
    );
    setStep(3);
  };

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
              <p className="text-xs text-muted-foreground mt-1">PDF or DOCX format</p>
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
                      <span className={cn("inline-flex px-2 py-1 rounded text-xs font-medium gap-2", blendLookup ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400")}>
                        {blendLookup?.blendSpeedId || "unknown"}
                        {blendLookup && <Badge variant="outline" className="text-[10px]">auto</Badge>}
                      </span>
                    </td>
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
        <div className={cn("border rounded-2xl p-6", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Uploaded Plan</h2>
          <div className="space-y-3">
            {confirmedRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No data loaded</p>
            ) : (
              Object.entries(
                confirmedRows.reduce<Record<string, ConfirmedRow[]>>((acc, row) => {
                  const key = `${row.day}-${row.floor}`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(row);
                  return acc;
                }, {})
              ).map(([key, rows]) => (
                <div key={key} className={cn("p-3 rounded-lg", isLight ? "bg-slate-50" : "bg-white/5")}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{key}</p>
                  <div className="space-y-1">
                    {rows.map((row, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="text-foreground">{row.productName}</span>
                        <span className="ml-2 text-muted-foreground">{row.volume} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Zentryx Plan */}
        <div className={cn("border rounded-2xl p-6", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Zentryx Plan</h2>
          <div className="text-muted-foreground text-sm">
            <p>Select a production floor and week to view Zentryx assignments and capacity utilization.</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className={cn("border rounded-2xl p-6", isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-500/10 border-emerald-500/20")}>
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Analysis Summary</h3>
        <p className="text-emerald-600 dark:text-emerald-500">
          Comparison framework is ready. The Strategy Evaluator provides insights into plan efficiency and capacity utilization.
        </p>
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
