import { motion } from "framer-motion";
import { LayoutGrid, Table2, List } from "lucide-react";

export type ViewType = "portfolio" | "matrix" | "list";

const VIEWS: { id: ViewType; label: string; icon: React.ReactNode }[] = [
  { id: "portfolio", label: "Portfolio", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: "matrix", label: "Matrix", icon: <Table2 className="w-3.5 h-3.5" /> },
  { id: "list", label: "List", icon: <List className="w-3.5 h-3.5" /> },
];

interface ViewSwitcherProps {
  active: ViewType;
  onChange: (v: ViewType) => void;
}

export function ViewSwitcher({ active, onChange }: ViewSwitcherProps) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-2xl border border-white/10"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(10px)" }}
    >
      {VIEWS.map((v) => {
        const isActive = active === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className="relative px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all duration-200 focus:outline-none"
            style={{ color: isActive ? "#fff" : undefined }}
          >
            {isActive && (
              <motion.div
                layoutId="view-tab-indicator"
                className="absolute inset-0 rounded-xl"
                style={{
                  background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
                  boxShadow: "0 0 20px rgba(124,58,237,0.5)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className={`relative z-10 flex items-center gap-1.5 ${isActive ? "text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {v.icon}
              <span className="hidden sm:inline">{v.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
