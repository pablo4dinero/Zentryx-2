import { useState, useEffect, useRef } from "react";
import { ChevronDown, Edit3, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomOptionsHandle } from "@/lib/project-options";

interface CustomOptionsSelectProps {
  value: string;
  onChange: (v: string) => void;
  handle: CustomOptionsHandle;
  displayFn?: (v: string) => string;
  placeholder?: string;
  isLight: boolean;
}

export function CustomOptionsSelect({
  value, onChange, handle, displayFn = v => v, placeholder = "Select...", isLight,
}: CustomOptionsSelectProps) {
  const { options, addOption, deleteOption, renameOption } = handle;
  const [open, setOpen] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingOpt(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commitEdit = (opt: string) => {
    if (editVal.trim()) {
      const renamed = editVal.trim();
      renameOption(opt, renamed);
      if (value === opt) onChange(renamed);
    }
    setEditingOpt(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
          isLight
            ? "border-gray-200 bg-white text-black hover:border-gray-300"
            : "border-white/10 bg-black/20 text-foreground hover:border-white/20"
        )}
      >
        <span className={cn("truncate capitalize", !value && (isLight ? "text-gray-400" : "text-muted-foreground"))}>
          {value ? displayFn(value) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 ml-2 transition-transform", open && "rotate-180", isLight ? "text-gray-500" : "opacity-50")} />
      </button>

      {open && (
        <div className={cn(
          "absolute top-[calc(100%+4px)] left-0 right-0 z-[200] rounded-xl border shadow-xl overflow-hidden",
          isLight ? "bg-white border-gray-200" : "bg-card border-white/10"
        )}>
          <div className="max-h-48 overflow-y-auto">
            {options.length === 0 && (
              <p className="px-3 py-3 text-xs text-center text-muted-foreground">No options yet</p>
            )}
            {options.map(opt => (
              <div key={opt} className={cn("flex items-center group", isLight ? "hover:bg-slate-50" : "hover:bg-white/5")}>
                {editingOpt === opt ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={() => commitEdit(opt)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); commitEdit(opt); }
                      if (e.key === "Escape") setEditingOpt(null);
                    }}
                    className={cn("flex-1 px-3 py-2 text-sm bg-transparent border-none focus:outline-none", isLight ? "text-black" : "text-foreground")}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { onChange(opt); setOpen(false); }}
                    className={cn(
                      "flex-1 text-left px-3 py-2 text-sm capitalize transition-colors",
                      value === opt ? "text-primary font-semibold" : isLight ? "text-black" : "text-foreground"
                    )}
                  >
                    {displayFn(opt)}
                  </button>
                )}
                <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Rename"
                    onClick={e => { e.stopPropagation(); setEditingOpt(opt); setEditVal(opt); }}
                    className={cn("p-1 rounded transition-colors text-muted-foreground", isLight ? "hover:bg-slate-200 hover:text-slate-800" : "hover:bg-white/10 hover:text-foreground")}
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={e => { e.stopPropagation(); deleteOption(opt); if (value === opt) onChange(""); }}
                    className="p-1 rounded transition-colors text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={cn("border-t p-2 flex gap-1.5", isLight ? "border-gray-100" : "border-white/10")}>
            <input
              type="text"
              value={newOption}
              onChange={e => setNewOption(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); addOption(newOption); setNewOption(""); }
              }}
              placeholder="Add custom option..."
              className={cn(
                "flex-1 h-7 px-2 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-primary/50",
                isLight
                  ? "border-gray-200 bg-slate-50 text-black placeholder:text-slate-400"
                  : "border-white/10 bg-white/5 text-foreground placeholder:text-muted-foreground"
              )}
            />
            <button
              type="button"
              onClick={() => { addOption(newOption); setNewOption(""); }}
              disabled={!newOption.trim()}
              className="h-7 px-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
