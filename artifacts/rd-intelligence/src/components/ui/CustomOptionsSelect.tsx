import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Edit3, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomOptionsHandle } from "@/lib/project-options";

interface CustomOptionsSelectProps {
  value: string;
  onChange: (v: string) => void;
  handle: CustomOptionsHandle;
  displayFn?: (v: string) => string;
  placeholder?: string;
  isLight: boolean;
  /**
   * When true the trigger renders as a compact "ghost" pill suitable for
   * inline use inside a table cell. Defaults to false (full-width input).
   */
  compact?: boolean;
  /**
   * Additional classes to apply to the trigger button. Useful for status pills
   * to apply colored backgrounds inline.
   */
  triggerClassName?: string;
}

// Approximate rendered height of the dropdown panel (search box + option list)
// used only to decide whether to open upward or downward.
const ESTIMATED_PANEL_HEIGHT = 290;

export function CustomOptionsSelect({
  value, onChange, handle, displayFn = v => v, placeholder = "Select...", isLight, compact = false, triggerClassName = "",
}: CustomOptionsSelectProps) {
  const { options, addOption, deleteOption, renameOption } = handle;
  const [open, setOpen] = useState(false);
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Fixed-position coordinates for the portal-rendered panel so it escapes any
  // parent `overflow` clipping (e.g. the scrollable Add Account form).
  const [menuPos, setMenuPos] = useState<{ left: number; width: number; top: number; bottom: number; openUp: boolean } | null>(null);

  const filteredOptions = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;
  const exactMatch = options.some(o => o.toLowerCase() === search.trim().toLowerCase());

  const updateMenuPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    // Prefer opening downward; flip up only when there isn't room below and
    // there's more room above.
    const openUp = spaceBelow < ESTIMATED_PANEL_HEIGHT && spaceAbove > spaceBelow;
    setMenuPos({
      left: r.left,
      width: compact ? 224 : r.width,
      top: r.bottom,
      bottom: window.innerHeight - r.top,
      openUp,
    });
  };

  // Recompute position when opening, and keep it pinned to the trigger while
  // the user scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return; }
    updateMenuPos();
    const onMove = () => updateMenuPos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compact]);

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Keep open when the click is on the trigger or inside the portal panel.
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setEditingOpt(null);
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
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          compact
            ? "inline-flex items-center justify-between rounded-lg px-2 py-1 text-xs focus:outline-none transition-colors min-w-0 max-w-full"
            : "flex h-10 w-full items-center justify-between rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
          !compact && (isLight
            ? "border-gray-200 bg-white text-black hover:border-gray-300"
            : "border-white/10 bg-black/20 text-foreground hover:border-white/20"),
          compact && !triggerClassName && (isLight
            ? "border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700"
            : "border border-transparent hover:border-white/10 hover:bg-white/5 text-foreground"),
          triggerClassName
        )}
      >
        <span className={cn("truncate capitalize", !value && (isLight ? "text-gray-400" : "text-muted-foreground"))}>
          {value ? displayFn(value) : placeholder}
        </span>
        <ChevronDown className={cn(compact ? "w-3 h-3 shrink-0 ml-1" : "w-4 h-4 shrink-0 ml-2", "transition-transform", open && "rotate-180", isLight ? "text-gray-500" : "opacity-50")} />
      </button>

      {open && menuPos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: menuPos.left,
            width: menuPos.width,
            ...(menuPos.openUp
              ? { bottom: menuPos.bottom + 4 }
              : { top: menuPos.top + 4 }),
          }}
          className={cn(
            "z-[120] rounded-xl border shadow-xl overflow-hidden",
            isLight ? "bg-white border-gray-200" : "bg-card border-white/10"
          )}
        >
          {/* Search */}
          <div className={cn("p-2 border-b", isLight ? "border-gray-100" : "border-white/10")}>
            <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/10")}>
              <Search className={cn("w-3 h-3 shrink-0", isLight ? "text-slate-400" : "text-muted-foreground")} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && search.trim() && !exactMatch) {
                    e.preventDefault();
                    addOption(search.trim());
                    onChange(search.trim());
                    setSearch("");
                    setOpen(false);
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Search or add…"
                className={cn("flex-1 min-w-0 text-xs bg-transparent border-none focus:outline-none", isLight ? "text-slate-900 placeholder:text-slate-400" : "text-foreground placeholder:text-muted-foreground")}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredOptions.length === 0 && search.trim() && (
              <button
                type="button"
                onClick={() => { addOption(search.trim()); onChange(search.trim()); setSearch(""); setOpen(false); }}
                className={cn("w-full text-left px-3 py-2 text-xs flex items-center gap-1.5 transition-colors", isLight ? "text-primary hover:bg-slate-50" : "text-primary hover:bg-white/5")}
              >
                <span className="font-medium">+ Add</span> "<span className="font-semibold">{search.trim()}</span>"
              </button>
            )}
            {filteredOptions.length === 0 && !search.trim() && (
              <p className="px-3 py-3 text-xs text-center text-muted-foreground">No options yet — type a name above to add one.</p>
            )}
            {filteredOptions.map(opt => (
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
        </div>,
        document.body
      )}
    </div>
  );
}
