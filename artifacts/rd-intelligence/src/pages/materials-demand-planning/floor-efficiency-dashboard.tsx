import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloorEfficiencyData {
  floorId: number;
  floorName: string;
  utilization: number; // 0-100
  plannedKg: number;
  capacityKg: number;
}

interface FloorEfficiencyDashboardProps {
  floors: FloorEfficiencyData[];
  isLight: boolean;
}

export function FloorEfficiencyDashboard({ floors, isLight }: FloorEfficiencyDashboardProps) {
  if (!floors.length) {
    return (
      <div className={cn("rounded-2xl border p-6 text-center", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5")}>
        <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>
          No floors assigned for this week yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className={cn("text-sm font-semibold", isLight ? "text-slate-900" : "text-foreground")}>Floor Capacity Utilization</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {floors.map((floor) => {
          const isUnderutilized = floor.utilization < 80;
          const bgColor =
            floor.utilization >= 90
              ? "bg-emerald-500/10 border-emerald-500/20"
              : floor.utilization >= 75
                ? "bg-blue-500/10 border-blue-500/20"
                : floor.utilization >= 60
                  ? "bg-yellow-500/10 border-yellow-500/20"
                  : "bg-orange-500/10 border-orange-500/20";

          const textColor =
            floor.utilization >= 90
              ? "text-emerald-600"
              : floor.utilization >= 75
                ? "text-blue-600"
                : floor.utilization >= 60
                  ? "text-yellow-600"
                  : "text-orange-600";

          return (
            <div key={floor.floorId} className={cn("rounded-xl border p-4", bgColor)}>
              <div className="flex items-start justify-between mb-2">
                <p className={cn("font-semibold text-sm", textColor)}>{floor.floorName}</p>
                {isUnderutilized && <AlertTriangle className={cn("w-4 h-4", textColor)} />}
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
                    {floor.plannedKg.toLocaleString()} / {floor.capacityKg.toLocaleString()} kg
                  </span>
                  <span className={cn("text-xs font-semibold", textColor)}>{floor.utilization}%</span>
                </div>
                <div className={cn("h-2 rounded-full overflow-hidden", isLight ? "bg-slate-200" : "bg-white/10")}>
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      floor.utilization >= 90
                        ? "bg-emerald-500"
                        : floor.utilization >= 75
                          ? "bg-blue-500"
                          : floor.utilization >= 60
                            ? "bg-yellow-500"
                            : "bg-orange-500"
                    )}
                    style={{ width: `${Math.min(100, floor.utilization)}%` }}
                  />
                </div>
              </div>

              {isUnderutilized && (
                <p className={cn("text-xs", isLight ? "text-slate-600" : "text-muted-foreground")}>
                  ⚡ {Math.round(floor.capacityKg - floor.plannedKg)} kg available
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
