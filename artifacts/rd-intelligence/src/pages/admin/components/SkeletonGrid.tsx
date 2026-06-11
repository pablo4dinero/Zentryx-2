import { cn } from "@/lib/utils";

export function SkeletonGrid({ isLight }: { isLight: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={cn("rounded-2xl border p-5 animate-pulse h-28", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/[0.02]")} />
      ))}
    </div>
  );
}
