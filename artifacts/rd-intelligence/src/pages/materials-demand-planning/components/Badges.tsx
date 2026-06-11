import { cn } from "@/lib/utils";
import { SF_URGENCY } from "../lib/constants";

export function UrgencyBadge({ level }: { level: string }) {
  const u = SF_URGENCY.find(x => x.value === level) || SF_URGENCY[2];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border", u.bg, u.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", u.dot)} />{u.label}
    </span>
  );
}

export function VolumeTag({ volume }: { volume: string | null }) {
  const v = parseFloat(volume || "0");
  if (v >= 10000) return <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Very High</span>;
  if (v >= 1000)  return <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">High</span>;
  if (v >= 500)   return <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">Medium</span>;
  return <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Low</span>;
}
