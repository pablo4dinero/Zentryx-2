import { useState, useMemo, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useLocation } from "wouter";

type SortKey = "name" | "productType" | "costTarget" | "sensory" | "progress" | "status";
type SortDir = "asc" | "desc";

interface Props { projects: any[] }

function defaultSensory(project: any): number {
  const map: Record<string, number> = {
    in_progress: 60, approved: 95, pushed_to_live: 92, awaiting_feedback: 70,
    on_hold: 45, new_inventory: 55, cancelled: 30, testing: 75,
  };
  return map[project.status] ?? 60;
}

function SensoryBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const computeValue = useCallback((clientX: number) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    onChange(Math.round(pct * 100));
  }, [onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    computeValue(e.clientX);

    const onMove = (ev: MouseEvent) => { if (dragging.current) computeValue(ev.clientX); };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) computeValue(e.clientX);
  };

  const filledDots = Math.round((value / 100) * 5);

  return (
    <div className="flex items-center gap-2.5" onClick={e => e.stopPropagation()}>
      <div
        ref={barRef}
        className="relative flex gap-0.5 cursor-pointer group/sensory"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        title={`Sensory score: ${value} — click or drag to adjust`}
      >
        {[1, 2, 3, 4, 5].map(s => (
          <div
            key={s}
            data-dot={s}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(s * 20);
            }}
            className={`w-4 h-4 rounded-sm transition-all duration-150 cursor-pointer ${
              s <= filledDots
                ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                : "bg-white/10 hover:bg-amber-400/40"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-7">{value}</span>
    </div>
  );
}

export function MatrixView({ projects }: Props) {
  const [, navigate] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("progress");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sensoryScores, setSensoryScores] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    projects.forEach(p => { init[p.id] = defaultSensory(p); });
    return init;
  });

  const getSensory = (p: any) => sensoryScores[p.id] ?? defaultSensory(p);

  const setSensory = (id: number, val: number) => {
    setSensoryScores(prev => ({ ...prev, [id]: val }));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "progress") {
        av = a.taskCount > 0 ? (a.completedTaskCount / a.taskCount) * 100 : 0;
        bv = b.taskCount > 0 ? (b.completedTaskCount / b.taskCount) * 100 : 0;
      } else if (sortKey === "costTarget") {
        av = parseFloat(a.costTarget || "0");
        bv = parseFloat(b.costTarget || "0");
      } else if (sortKey === "sensory") {
        av = getSensory(a); bv = getSensory(b);
      } else {
        av = (a[sortKey] || "").toString().toLowerCase();
        bv = (b[sortKey] || "").toString().toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [projects, sortKey, sortDir, sensoryScores]);

  const maxCost = useMemo(() => Math.max(...projects.map(p => parseFloat(p.costTarget || "0")), 1), [projects]);

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-primary" /> : <ArrowDown className="w-3.5 h-3.5 text-primary" />;
  };

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => handleSort(k)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <SortIcon k={k} />
      </div>
    </th>
  );

  const STATUS_COLOR: Record<string, string> = {
    approved: "text-green-400",
    in_progress: "text-blue-400",
    awaiting_feedback: "text-yellow-400",
    on_hold: "text-orange-400",
    cancelled: "text-red-400",
    pushed_to_live: "text-emerald-400",
    new_inventory: "text-purple-400",
  };

  const topProgress = sorted.length > 0
    ? sorted.reduce((best, p) => {
        const pg = p.taskCount > 0 ? (p.completedTaskCount / p.taskCount) * 100 : 0;
        const bestPg = best.taskCount > 0 ? (best.completedTaskCount / best.taskCount) * 100 : 0;
        return pg > bestPg ? p : best;
      }, sorted[0])
    : null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
                <Th k="name" label="Project" />
                <Th k="productType" label="Ingredient Profile" />
                <Th k="costTarget" label="Cost Target" />
                <Th k="sensory" label="Sensory Score" />
                <Th k="progress" label="Performance" />
                <Th k="status" label="Status" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0;
                const cost = parseFloat(p.costTarget || "0");
                const sensory = getSensory(p);
                const isBest = topProgress?.id === p.id;

                return (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className={`border-b border-white/5 hover:bg-white/[0.05] transition-colors cursor-pointer group ${isBest ? "bg-violet-500/5" : ""}`}
                  >
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">{p.name}</p>
                          {p.customerName && <p className="text-[11px] text-muted-foreground">{p.customerName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground">{p.productType || "—"}</span>
                      {p.stage && (
                        <span className="ml-1 text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded capitalize">{p.stage.replace(/_/g, " ")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {cost > 0 ? (
                        <div>
                          <p className="text-sm font-medium text-foreground">${cost.toLocaleString()}</p>
                          <div className="h-1 w-16 bg-black/30 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(cost / maxCost) * 100}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <SensoryBar value={sensory} onChange={val => setSensory(p.id, val)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden w-16">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: progress >= 80 ? "#10b981" : progress >= 50 ? "#7c3aed" : "#f59e0b" }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground w-8">{progress}%</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.completedTaskCount}/{p.taskCount} tasks</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium capitalize ${STATUS_COLOR[p.status] || "text-muted-foreground"}`}>
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No projects to compare.</div>
          )}
        </div>

        {sorted.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs text-muted-foreground">{sorted.length} project{sorted.length !== 1 ? "s" : ""} — click any row to open</p>
            <p className="text-xs text-muted-foreground">Drag sensory bars to adjust scores</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
