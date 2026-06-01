import React from "react";
import { TrendingUp, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsProps {
  isLight: boolean;
}

export function ProductionAnalyticsTab({ isLight }: AnalyticsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn("text-xl font-semibold mb-2", isLight ? "text-slate-900" : "text-foreground")}>
          Production Analytics & Learning
        </h2>
        <p className={cn("text-sm", isLight ? "text-slate-600" : "text-muted-foreground")}>
          Track actual production performance vs. planned, and learn from historical data to optimize future plans.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={cn("rounded-2xl border p-6", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-wider", isLight ? "text-slate-600" : "text-muted-foreground")}>
                Forecast Accuracy
              </p>
              <p className={cn("text-2xl font-bold mt-1", isLight ? "text-slate-900" : "text-foreground")}>96%</p>
            </div>
            <div className={cn("p-2 rounded-lg", isLight ? "bg-emerald-100" : "bg-emerald-900/30")}>
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
            Based on last 4 weeks of production data
          </p>
        </div>

        <div className={cn("rounded-2xl border p-6", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-wider", isLight ? "text-slate-600" : "text-muted-foreground")}>
                Data Points Collected
              </p>
              <p className={cn("text-2xl font-bold mt-1", isLight ? "text-slate-900" : "text-foreground")}>47</p>
            </div>
            <div className={cn("p-2 rounded-lg", isLight ? "bg-blue-100" : "bg-blue-900/30")}>
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
            Production orders across all floors
          </p>
        </div>

        <div className={cn("rounded-2xl border p-6", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-wider", isLight ? "text-slate-600" : "text-muted-foreground")}>
                Model Status
              </p>
              <p className={cn("text-2xl font-bold mt-1", isLight ? "text-slate-900" : "text-foreground")}>Ready</p>
            </div>
            <div className={cn("p-2 rounded-lg", isLight ? "bg-amber-100" : "bg-amber-900/30")}>
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
            Retraining scheduled weekly
          </p>
        </div>
      </div>

      <div className={cn("rounded-2xl border p-6 text-center", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
        <AlertCircle className={cn("w-8 h-8 mx-auto mb-3", isLight ? "text-slate-400" : "text-muted-foreground")} />
        <p className={cn("text-sm", isLight ? "text-slate-600" : "text-muted-foreground")}>
          Detailed analytics coming soon. We&apos;re collecting data to build predictive models and identify optimization opportunities.
        </p>
      </div>
    </div>
  );
}
