import * as React from "react";
import { motion } from "framer-motion";
import { X, Edit3, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { BlendSpeed } from "../lib/types";

export function ConfigurationDialog({
  open, onClose, blendSpeeds, onSave,
}: {
  open: boolean;
  onClose: () => void;
  blendSpeeds: BlendSpeed[];
  onSave: (speeds: BlendSpeed[]) => void;
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [draft, setDraft]         = React.useState<BlendSpeed[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [newLabel, setNewLabel]   = React.useState("");

  React.useEffect(() => {
    if (open) { setDraft(blendSpeeds.map(s => ({ ...s }))); setEditingId(null); setNewLabel(""); }
  }, [open, blendSpeeds]);

  const commitRename = (id: string) => {
    if (editLabel.trim()) setDraft(d => d.map(s => s.id === id ? { ...s, label: editLabel.trim() } : s));
    setEditingId(null);
  };

  const startRename = (s: BlendSpeed) => { setEditingId(s.id); setEditLabel(s.label); };

  const addNew = () => {
    if (!newLabel.trim()) return;
    setDraft(d => [...d, { id: `custom_${Date.now()}`, label: newLabel.trim(), timeTakenMinutes: 0 }]);
    setNewLabel("");
  };

  if (!open) return null;

  const panelCls = cn("border rounded-2xl shadow-2xl w-full max-w-md flex flex-col",
    isLight ? "bg-white border-gray-200" : "glass-panel border-white/10");
  const rowCls = cn("rounded-xl border p-3 space-y-2",
    isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.02]");
  const inputCls = cn("h-8 rounded-lg border px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground",
    isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/30");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className={panelCls}>
        <div className={cn("flex items-center justify-between px-6 py-4 border-b", isLight ? "border-gray-100" : "border-white/5")}>
          <div>
            <h2 className="text-lg font-bold text-foreground">Configuration</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Manage blend speed definitions and time metadata</p>
          </div>
          <button onClick={onClose} className={cn("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-gray-100 text-gray-500" : "hover:bg-white/10 text-muted-foreground")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blend Speed</h3>
          <div className="space-y-2">
            {draft.map(speed => (
              <div key={speed.id} className={rowCls}>
                <div className="flex items-center gap-2">
                  {editingId === speed.id ? (
                    <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => commitRename(speed.id)} onKeyDown={e => e.key === "Enter" && commitRename(speed.id)}
                      className={cn(inputCls, "flex-1 h-7 text-sm")} />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-foreground">{speed.label}</span>
                  )}
                  <button onClick={() => startRename(speed)} title="Rename"
                    className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDraft(d => d.filter(s => s.id !== speed.id))} title="Remove"
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Time per batch (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={speed.timeTakenMinutes || ""}
                    onChange={e => setDraft(d => d.map(s => s.id === speed.id ? { ...s, timeTakenMinutes: Number(e.target.value) || 0 } : s))}
                    placeholder="e.g. 40"
                    className={cn(inputCls, "w-full text-xs")}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className={cn("rounded-xl border p-3", isLight ? "border-slate-200" : "border-white/10")}>
            <p className="text-xs text-muted-foreground mb-2">Add new blend speed</p>
            <div className="flex gap-2">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addNew()}
                placeholder="Label (e.g. Extra Fast)" className={cn(inputCls, "flex-1")} />
              <button onClick={addNew} disabled={!newLabel.trim()}
                className="flex items-center gap-1 px-3 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </div>

        <div className={cn("flex justify-end gap-2 px-6 py-4 border-t", isLight ? "border-gray-100" : "border-white/5")}>
          <button onClick={onClose}
            className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all", isLight ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}>
            Cancel
          </button>
          <button onClick={() => { onSave(draft); onClose(); }}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all">
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}
