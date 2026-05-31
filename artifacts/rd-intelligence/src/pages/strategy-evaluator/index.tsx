import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, Download, Settings, BarChart3, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

interface DayProduction {
  day: string;
  date: string;
  floors: FloorAssignment[];
  totalVolume: number;
}

interface FloorAssignment {
  floorId: number;
  floorName: string;
  shift: "Day" | "Night";
  products: number;
  volume: number;
}

interface WeekData {
  weekLabel: string;
  days: DayProduction[];
}

function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = localStorage.getItem("rd_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function parseDocx(file: File): Promise<string> {
  // For now, just accept the file - parsing will be enhanced later
  return file.name;
}

export default function StrategyEvaluatorPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const isLight = theme === "light";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedWeek, setSelectedWeek] = useState("Week 1");

  // Fetch floor assignments for real data
  const assignmentsQuery = useQuery({
    queryKey: ["/api/mdp/floor-assignments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/floor-assignments`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json() as Promise<any[]>;
    },
  });

  // Fetch production floors
  const floorsQuery = useQuery({
    queryKey: ["/api/mdp/production-floors"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/mdp/production-floors`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch floors");
      return res.json() as Promise<any[]>;
    },
  });

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".docx")) {
        const text = await parseDocx(file);
        if (!text.trim()) {
          toast({ title: "Empty document", description: "Please upload a document with content", variant: "destructive" });
          return;
        }
        setStep(2);
        toast({ title: "Document uploaded", description: "Ready to compare with Zentryx plan" });
      } else {
        toast({ title: "Unsupported format", description: "Please upload a DOCX file", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Upload failed", description: "Could not parse document", variant: "destructive" });
    }
  }, [toast]);

  // Get unique weeks from assignments
  const weeks = Array.from(new Set(assignmentsQuery.data?.map((a: any) => a.assignment?.weekLabel) || []))
    .filter(Boolean)
    .sort()
    .slice(0, 4);

  const weekKey = weeks[0] || "Week 1";

  // Group assignments by day for the selected week
  const uploadedPlanDays: DayProduction[] = assignmentsQuery.data
    ?.filter((a: any) => a.assignment?.weekLabel === weekKey)
    .reduce((acc: DayProduction[], assignment: any) => {
      const existing = acc.find((d) => d.day === assignment.assignment?.assignedDay);
      const floor = floorsQuery.data?.find((f: any) => f.id === assignment.assignment?.floorId);

      if (existing) {
        existing.totalVolume += Number(assignment.assignment?.assignedVolume || assignment.order?.volume || 0);
      } else {
        acc.push({
          day: assignment.assignment?.assignedDay || "Unknown",
          date: "",
          totalVolume: Number(assignment.assignment?.assignedVolume || assignment.order?.volume || 0),
          floors: floor
            ? [
                {
                  floorId: floor.id,
                  floorName: floor.floorName,
                  shift: assignment.assignment?.assignedDay?.includes("-NS") ? "Night" : "Day",
                  products: 1,
                  volume: Number(assignment.assignment?.assignedVolume || assignment.order?.volume || 0),
                },
              ]
            : [],
        });
      }
      return acc;
    }, []) || [];

  if (step === 1) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Strategy Evaluator</h1>
          <p className="text-muted-foreground">Upload your production plan (DOCX) to compare with Zentryx assignments</p>
        </div>

        <div className={cn("border-2 border-dashed rounded-2xl p-16 text-center transition-colors", isLight ? "border-slate-300 bg-slate-50" : "border-white/20 bg-black/20")}>
          <label className="cursor-pointer flex flex-col items-center gap-4">
            <Upload className="w-12 h-12 text-primary" />
            <div>
              <p className="text-lg font-semibold text-foreground">Upload your plan</p>
              <p className="text-sm text-muted-foreground mt-1">DOCX format only</p>
            </div>
            <input type="file" accept=".docx" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Confirm plan details</h1>
          <p className="text-muted-foreground">Review the uploaded production plan before comparison</p>
        </div>

        <div className={cn("border rounded-xl p-6 mb-6", isLight ? "bg-blue-50 border-blue-200" : "bg-blue-500/10 border-blue-500/20")}>
          <p className="text-sm text-blue-700 dark:text-blue-400">Document uploaded successfully. Click below to proceed to comparison.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep(1)}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium border", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}
          >
            Back
          </button>
          <button
            onClick={() => setStep(3)}
            className="ml-auto px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Compare Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Strategy Evaluator</h1>
        <div className="flex gap-2">
          <button className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}>
            AI-assisted
          </button>
          <button className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}>
            <Settings className="w-3 h-3" />
            Edit blend speeds
          </button>
          <button className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5", isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}>
            <Download className="w-3 h-3" />
            Export report
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <span className="text-sm text-muted-foreground">Upload document</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <span className="text-sm text-muted-foreground">Confirm blend speeds</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">3</div>
          <span className="text-sm font-medium text-foreground">View comparison</span>
        </div>
      </div>

      {/* Week selector */}
      <div className="flex gap-2">
        <span className="text-xs text-muted-foreground py-2">Zentryx plan week:</span>
        {weeks.map((week, idx) => (
          <button
            key={week}
            onClick={() => setSelectedWeek(week)}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all", selectedWeek === week ? "border-blue-500 bg-blue-500/10 text-blue-600" : isLight ? "border-slate-200 hover:bg-slate-50" : "border-white/10 hover:bg-white/5")}
          >
            Week {idx + 1}
          </button>
        ))}
      </div>

      {/* Comparison grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Uploaded Plan */}
        <div className={cn("border rounded-xl p-6", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wide">Uploaded Plan — Day by Day</h3>
          <div className="space-y-4">
            {uploadedPlanDays.map((day) => (
              <div key={day.day} className={cn("rounded-lg p-3", isLight ? "bg-slate-50" : "bg-white/5")}>
                <p className="text-xs text-muted-foreground mb-2">{day.day}</p>
                <p className="text-lg font-bold text-foreground mb-3">{day.totalVolume.toLocaleString()} kg</p>
                <div className="space-y-1.5">
                  {day.floors.map((floor) => (
                    <div key={`${day.day}-${floor.floorId}`} className="flex items-center justify-between">
                      <div className="text-xs">
                        <span className="inline-block bg-primary/10 text-primary px-2 py-1 rounded text-[10px] font-medium">{floor.floorName}</span>
                        <span className="ml-2 text-muted-foreground">{floor.shift}</span>
                        <span className="ml-2 text-muted-foreground">{floor.products} product</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{floor.volume.toLocaleString()} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Zentryx Plan */}
        <div className={cn("border rounded-xl p-6", isLight ? "bg-white border-slate-200" : "bg-black/20 border-white/10")}>
          <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wide">Zentryx Plan — {selectedWeek}</h3>
          <div className="space-y-4">
            {assignmentsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading assignments...</p>
            ) : assignmentsQuery.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              uploadedPlanDays.map((day) => (
                <div key={day.day} className={cn("rounded-lg p-3", isLight ? "bg-slate-50" : "bg-white/5")}>
                  <p className="text-xs text-muted-foreground mb-2">{day.day}</p>
                  <p className="text-lg font-bold text-blue-500 mb-3">{day.totalVolume.toLocaleString()} kg</p>
                  <div className="space-y-1.5">
                    {day.floors.map((floor) => (
                      <div key={`zentryx-${day.day}-${floor.floorId}`} className="flex items-center justify-between">
                        <div className="text-xs">
                          <span className="inline-block bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-[10px] font-medium">{floor.floorName}</span>
                          <span className="ml-2 text-muted-foreground">{floor.shift}</span>
                          <span className="ml-2 text-muted-foreground">{floor.products} product</span>
                        </div>
                        <span className="text-xs font-semibold text-blue-500">{floor.volume.toLocaleString()} kg</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
