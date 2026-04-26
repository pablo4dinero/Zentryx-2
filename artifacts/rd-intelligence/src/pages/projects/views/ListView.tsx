import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "name" | "stage" | "status" | "productType" | "customerName" | "targetDate" | "progress";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awaiting_feedback: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  on_hold: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  new_inventory: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  pushed_to_live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

interface Props { projects: any[] }

export function ListView({ projects }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "progress") {
        av = a.taskCount > 0 ? (a.completedTaskCount / a.taskCount) : 0;
        bv = b.taskCount > 0 ? (b.completedTaskCount / b.taskCount) : 0;
      } else if (sortKey === "targetDate") {
        av = a.targetDate ? new Date(a.targetDate).getTime() : 0;
        bv = b.targetDate ? new Date(b.targetDate).getTime() : 0;
      } else {
        av = (a[sortKey] || "").toLowerCase();
        bv = (b[sortKey] || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [projects, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const Th = ({ k, label, cls = "" }: { k: SortKey; label: string; cls?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors ${cls}`}
      onClick={() => handleSort(k)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <SortIcon k={k} />
      </div>
    </th>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
                <Th k="name" label="Name" />
                <Th k="productType" label="Type" cls="hidden md:table-cell" />
                <Th k="customerName" label="Customer" cls="hidden lg:table-cell" />
                <Th k="stage" label="Stage" cls="hidden sm:table-cell" />
                <Th k="progress" label="Progress" />
                <Th k="status" label="Status" />
                <Th k="targetDate" label="Due Date" cls="hidden xl:table-cell" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0;
                return (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.025 }}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group"
                  >
                    <td className="px-4 py-3.5">
                      <Link href={`/projects/${p.id}`}>
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">{p.name}</p>
                        {p.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">{p.productType || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <div>
                        <p className="text-xs text-foreground">{p.customerName || "—"}</p>
                        {p.customerEmail && <p className="text-[10px] text-muted-foreground">{p.customerEmail}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground capitalize">{p.stage.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-black/30 rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7c3aed, #3b82f6)" }}
                          />
                        </div>
                        <span className="text-xs text-foreground w-8">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${STATUS_COLORS[p.status] || "bg-white/5 text-muted-foreground border-white/10"}`}>
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {p.targetDate ? format(new Date(p.targetDate), "MMM d, yyyy") : "—"}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No projects to display.</div>
          )}
        </div>

        {sorted.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs text-muted-foreground">{sorted.length} project{sorted.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">Click column headers to sort</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
