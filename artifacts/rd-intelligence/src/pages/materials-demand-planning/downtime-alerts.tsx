import React from "react";
import { AlertTriangle, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface IdleTimeAlert {
  day: string;
  floorName: string;
  startHour: number;
  durationHours: number;
  suggestedMaintenance: string;
}

interface DowntimeAlertsProps {
  alerts: IdleTimeAlert[];
  isLight: boolean;
  onDismiss?: () => void;
}

export function DowntimeAlerts({ alerts, isLight, onDismiss }: DowntimeAlertsProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || !alerts.length) return null;

  return (
    <div className={cn("rounded-2xl border p-4 relative", isLight ? "border-amber-200 bg-amber-50" : "border-amber-900/30 bg-amber-500/10")}>
      <button
        onClick={() => {
          setDismissed(true);
          onDismiss?.();
        }}
        className="absolute top-3 right-3 p-1 hover:bg-white/10 rounded"
      >
        <X className="w-4 h-4 text-amber-600" />
      </button>

      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-amber-900 mb-2">Downtime & Maintenance Opportunities</h3>
          <div className="space-y-1 text-xs text-amber-800">
            {alerts.map((alert, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Wrench className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
                <span>
                  <strong>{alert.floorName}</strong> on {alert.day}: {alert.durationHours}h idle at {alert.startHour}:00 — {alert.suggestedMaintenance}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
