import { motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { blendSpeedColor } from "../lib/helpers";
import type { ProductionFloor, ProductionOrder } from "../lib/types";

export function PartialAssignModal({
  open, onClose, floor, order, suggestedVolume, remainingVolume,
  blendSpeedLabel, blendSpeedTimeTaken, volume, onVolumeChange, onConfirm, isLight, isPending,
}: {
  open: boolean;
  onClose: () => void;
  floor: ProductionFloor | null;
  order: ProductionOrder | null;
  suggestedVolume: number;
  remainingVolume: number;
  blendSpeedLabel: string;
  blendSpeedTimeTaken: string;
  volume: string;
  onVolumeChange: (v: string) => void;
  onConfirm: () => void;
  isLight: boolean;
  isPending: boolean;
}) {
  const numVol = Number(volume);
  const invalid = isNaN(numVol) || numVol <= 0;
  const exceeds = !isNaN(numVol) && numVol > remainingVolume;
  const panelCls = cn("border rounded-2xl shadow-2xl w-full max-w-md flex flex-col",
    isLight ? "bg-white border-gray-200" : "glass-panel border-white/10");
  const inputCls = cn("h-10 rounded-xl border px-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground",
    isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");

  if (!open || !floor || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }} className={panelCls}>
        <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
          <div>
            <h2 className="text-base font-bold text-foreground">Assign Partial Run</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{floor.floorName} · {floor.blendCategory} · {floor.maxCapacityKg.toLocaleString()} KG max</p>
          </div>
          <button onClick={onClose} className={cn("p-1.5 rounded-lg", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className={cn("rounded-xl border p-3 space-y-1", isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.03]")}>
            <p className="text-xs font-semibold text-foreground truncate">{order.accountCompany ?? order.accountName ?? "Order"}</p>
            {order.productName && <p className="text-[11px] text-muted-foreground">{order.productName}</p>}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{Number(order.volume ?? 0).toLocaleString()} KG</span></span>
              <span className="text-[11px] text-muted-foreground">Remaining: <span className={cn("font-semibold", remainingVolume < Number(order.volume ?? 0) ? "text-amber-400" : "text-foreground")}>{remainingVolume.toLocaleString()} KG</span></span>
            </div>
          </div>

          {blendSpeedLabel && (
            <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", blendSpeedColor(blendSpeedLabel.toLowerCase()))}>
              <span className="text-xs font-semibold">{blendSpeedLabel}</span>
              {blendSpeedTimeTaken && <span className="text-[10px] opacity-80">· {blendSpeedTimeTaken}</span>}
              <span className="text-[10px] opacity-70 ml-auto">Blend speed</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Volume to assign (KG)
              <span className="normal-case ml-2 text-muted-foreground/60">Suggested: {suggestedVolume.toLocaleString()}</span>
            </label>
            <input
              type="number" min="1" step="0.1"
              value={volume}
              onChange={e => onVolumeChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !invalid && !exceeds && onConfirm()}
              className={cn(inputCls, exceeds ? "border-amber-500/50 focus:ring-amber-500/30" : "")}
              autoFocus
            />
            {exceeds && (
              <p className="text-xs text-amber-400 mt-1">Exceeds remaining quantity ({remainingVolume.toLocaleString()} KG). You can enter this but it will over-assign.</p>
            )}
          </div>
        </div>

        <div className={cn("flex justify-end gap-2 px-6 py-4 border-t", isLight ? "border-gray-100" : "border-white/5")}>
          <button onClick={onClose}
            className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={invalid || isPending}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Assign {!isNaN(numVol) && numVol > 0 ? `${numVol.toLocaleString()} KG` : ""}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
