import { memo, useMemo } from "react";
import { Link } from "wouter";
import { Calendar, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awaiting_feedback: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  on_hold: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  new_inventory: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  pushed_to_live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const STAGE_COLORS: Record<string, string> = {
  testing: "text-cyan-400 bg-cyan-500/10",
  reformulation: "text-amber-400 bg-amber-500/10",
  innovation: "text-violet-400 bg-violet-500/10",
  cost_optimization: "text-green-400 bg-green-500/10",
  modification: "text-rose-400 bg-rose-500/10",
};

interface Props {
  projects: any[];
  onDelete: (id: number, name: string, e: React.MouseEvent) => void;
  onDateChange: (id: number, date: string) => void;
  groupByType?: boolean;
}

const CircularProgress = memo(function CircularProgress({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = Math.min((pct / 100) * circ, circ);
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#7c3aed" : "#f59e0b";
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
        {pct}%
      </text>
    </svg>
  );
});

const ProjectCard = memo(function ProjectCard({ project, onDelete, onDateChange }: { project: any; onDelete: Props["onDelete"]; onDateChange: Props["onDateChange"] }) {
  const progress = project.taskCount > 0 ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0;
  const sp = project.sellingPrice ? parseFloat(project.sellingPrice) : null;
  const vol = project.volumeKgPerMonth ? parseFloat(project.volumeKgPerMonth) : null;
  const revenue = sp && vol ? sp * vol : null;

  return (
    <div className="relative group">
      <Link href={`/projects/${project.id}`} className="block">
        <div className="glass-card h-full rounded-2xl p-5 relative overflow-hidden flex flex-col hover:border-white/20 transition-colors duration-200 hover:shadow-[0_0_24px_rgba(124,58,237,0.12)]">
          <div className={`absolute top-0 left-0 right-0 h-1 ${
            project.priority === "critical" ? "bg-destructive" :
            project.priority === "high" ? "bg-orange-500" : "bg-primary"
          }`} />

          <div className="flex justify-between items-start mb-3">
            <span className={`px-2 py-0.5 rounded-md text-xs font-medium capitalize ${STAGE_COLORS[project.stage] || "text-muted-foreground bg-white/5"}`}>
              {project.stage.replace(/_/g, " ")}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_COLORS[project.status] || "bg-white/5 text-muted-foreground border-white/10"}`}>
              {project.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold font-display text-foreground group-hover:text-primary transition-colors line-clamp-1">{project.name}</h3>
              {project.productType && <p className="text-xs text-muted-foreground mt-0.5">📦 {project.productType}</p>}
              {project.customerName && <p className="text-xs text-muted-foreground">👤 {project.customerName}</p>}
            </div>
            <div className="shrink-0">
              <CircularProgress pct={progress} />
            </div>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">{project.description || "No description."}</p>

          {sp && (
            <div className="mb-3 p-2 rounded-lg bg-black/20 border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Selling Price</span>
                <span className="text-xs font-semibold text-green-400">${sp.toLocaleString()}</span>
              </div>
              {revenue && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5" /> Revenue/mo
                  </span>
                  <span className="text-xs font-bold text-violet-400">${revenue.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {project.assignees?.length > 0 && (
            <div className="flex items-center gap-1 mb-3">
              {project.assignees.slice(0, 3).map((a: any) => (
                <div key={a.id} className="w-5 h-5 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 border border-white/20 flex items-center justify-center text-white text-[9px] font-bold" title={a.name}>
                  {a.name.charAt(0)}
                </div>
              ))}
              {project.assignees.length > 3 && (
                <div className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px] text-muted-foreground">
                  +{project.assignees.length - 3}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto pt-3 border-t border-white/5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <input
              type="date"
              value={project.targetDate ? format(new Date(project.targetDate), "yyyy-MM-dd") : ""}
              onChange={(e) => { e.stopPropagation(); onDateChange(project.id, e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/50 rounded cursor-pointer text-muted-foreground text-xs hover:text-foreground transition-colors w-full"
            />
          </div>
        </div>
      </Link>
      <button
        onClick={(e) => onDelete(project.id, project.name, e)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg transition-all z-10"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

const GRID = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";

export function PortfolioView({ projects, onDelete, onDateChange, groupByType }: Props) {
  const grouped = useMemo(() => {
    if (!groupByType) return null;
    const map: Record<string, any[]> = {};
    projects.forEach(p => {
      const key = p.productType || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [projects, groupByType]);

  if (projects.length === 0) {
    return (
      <div className="text-center py-20 glass-card rounded-2xl">
        <h3 className="text-lg font-medium text-foreground">No projects found</h3>
        <p className="text-muted-foreground">Adjust your filters or create a new project.</p>
      </div>
    );
  }

  if (groupByType && grouped) {
    return (
      <div className="space-y-8">
        {grouped.map(([type, projs]) => (
          <div key={type}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-3 py-1 rounded-full bg-white/5 border border-white/10">
                📦 {type} <span className="text-primary ml-1">({projs.length})</span>
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className={GRID}>
              {projs.map(p => <ProjectCard key={p.id} project={p} onDelete={onDelete} onDateChange={onDateChange} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={GRID}>
      {projects.map(p => <ProjectCard key={p.id} project={p} onDelete={onDelete} onDateChange={onDateChange} />)}
    </div>
  );
}
