import { useState, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@/components/dnd-stub";
import type { DropResult } from "@/components/dnd-stub";import { motion } from "framer-motion";
import { format } from "date-fns";
import { Calendar, GripVertical } from "lucide-react";

const COLUMNS: { id: string; label: string; color: string; glow: string }[] = [
  { id: "ideation", label: "Ideation", color: "from-violet-500/20 to-violet-500/5", glow: "rgba(139,92,246,0.3)" },
  { id: "in_progress", label: "In Progress", color: "from-blue-500/20 to-blue-500/5", glow: "rgba(59,130,246,0.3)" },
  { id: "testing", label: "Testing", color: "from-amber-500/20 to-amber-500/5", glow: "rgba(245,158,11,0.3)" },
  { id: "commercialization", label: "Commercialization", color: "from-emerald-500/20 to-emerald-500/5", glow: "rgba(16,185,129,0.3)" },
];

const STATUS_TO_COLUMN: Record<string, string> = {
  new_inventory: "ideation",
  awaiting_feedback: "ideation",
  innovation: "ideation",
  in_progress: "in_progress",
  on_hold: "in_progress",
  testing: "testing",
  approved: "commercialization",
  pushed_to_live: "commercialization",
  cancelled: "ideation",
};

const STAGE_TO_COLUMN: Record<string, string> = {
  innovation: "ideation",
  testing: "testing",
  reformulation: "in_progress",
  cost_optimization: "in_progress",
  modification: "in_progress",
};

interface Props {
  projects: any[];
}

export function KanbanView({ projects }: Props) {
  const [order, setOrder] = useState<Record<string, number[]>>(() => {
    const cols: Record<string, number[]> = { ideation: [], in_progress: [], testing: [], commercialization: [] };
    projects.forEach((p) => {
      const col = STATUS_TO_COLUMN[p.status] || STAGE_TO_COLUMN[p.stage] || "in_progress";
      cols[col].push(p.id);
    });
    return cols;
  });

  const projectMap = useMemo(() => {
    const m: Record<number, any> = {};
    projects.forEach((p) => (m[p.id] = p));
    return m;
  }, [projects]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const srcCol = [...(order[source.droppableId] || [])];
    const dstCol = source.droppableId === destination.droppableId ? srcCol : [...(order[destination.droppableId] || [])];

    const [moved] = srcCol.splice(source.index, 1);
    dstCol.splice(destination.index, 0, moved);

    setOrder((prev) => ({
      ...prev,
      [source.droppableId]: srcCol,
      [destination.droppableId]: dstCol,
    }));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const ids = order[col.id] || [];
          return (
            <div key={col.id} className="flex flex-col gap-3">
              <div
                className={`rounded-2xl p-3 border border-white/10 bg-gradient-to-b ${col.color}`}
                style={{ backdropFilter: "blur(10px)" }}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">{ids.length}</span>
                </div>

                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex flex-col gap-2 min-h-[80px] rounded-xl transition-all duration-200"
                      style={{ background: snapshot.isDraggingOver ? `${col.glow}22` : "transparent" }}
                    >
                      {ids.map((id, index) => {
                        const p = projectMap[id];
                        if (!p) return null;
                        const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0;
                        return (
                          <Draggable key={String(id)} draggableId={String(id)} index={index}>
                            {(drag, dragSnapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                className={`glass-card rounded-xl p-3.5 border border-white/10 transition-all duration-200 ${dragSnapshot.isDragging ? "shadow-2xl scale-[1.02] rotate-1 border-white/20" : "hover:border-white/20"}`}
                                style={{
                                  ...drag.draggableProps.style,
                                  boxShadow: dragSnapshot.isDragging ? `0 0 30px ${col.glow}` : undefined,
                                }}
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{p.name}</p>
                                  <div {...drag.dragHandleProps} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 mt-0.5">
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                </div>

                                {p.productType && (
                                  <p className="text-[11px] text-muted-foreground mb-2">📦 {p.productType}</p>
                                )}

                                <div className="space-y-1.5 mb-2">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">Progress</span>
                                    <span className="text-foreground font-medium">{progress}%</span>
                                  </div>
                                  <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${progress}%`,
                                        background: `linear-gradient(90deg, #7c3aed, #3b82f6)`,
                                      }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between">
                                  {(p as any).assignees?.length > 0 && (
                                    <div className="flex -space-x-1">
                                      {(p as any).assignees.slice(0, 3).map((a: any) => (
                                        <div key={a.id} className="w-5 h-5 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 border border-white/20 flex items-center justify-center text-[9px] font-bold text-white" title={a.name}>
                                          {a.name.charAt(0)}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {p.targetDate && (
                                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                                      <Calendar className="w-3 h-3" />
                                      {format(new Date(p.targetDate), "MMM d")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {ids.length === 0 && !snapshot.isDraggingOver && (
                        <div className="text-center py-6 text-xs text-muted-foreground/50 border-2 border-dashed border-white/5 rounded-xl">
                          Drop here
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
