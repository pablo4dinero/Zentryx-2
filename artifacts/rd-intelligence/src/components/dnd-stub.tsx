import React, { createContext, useContext, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";

export type DropResult = {
  draggableId: string;
  destination?: { droppableId: string; index: number } | null;
  source: { droppableId: string; index: number };
};

const DragDropCtx = createContext<((result: DropResult) => void) | null>(null);

// Track which droppable each draggable belongs to
const itemContainerMap = new Map<string, { droppableId: string; index: number }>();

export function DragDropContext({
  children,
  onDragEnd,
}: {
  children: React.ReactNode;
  onDragEnd: (result: DropResult) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const draggableId = String(active.id);
    const source = itemContainerMap.get(draggableId) || {
      droppableId: "",
      index: 0,
    };

    // over.id could be a droppable container or another draggable
    const destinationDroppableId = String(over.id);

    onDragEnd({
      draggableId,
      source,
      destination: {
        droppableId: destinationDroppableId,
        index: 0,
      },
    });
  }

  return (
    <DragDropCtx.Provider value={onDragEnd}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {children}
      </DndContext>
    </DragDropCtx.Provider>
  );
}

export function Droppable({
  droppableId,
  children,
}: {
  droppableId: string;
  children: (
    provided: { innerRef: any; droppableProps: any; placeholder: null },
    snapshot: { isDraggingOver: boolean }
  ) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <>
      {children(
        {
          innerRef: setNodeRef,
          droppableProps: {},
          placeholder: null,
        },
        { isDraggingOver: isOver }
      )}
    </>
  );
}

export function Draggable({
  draggableId,
  index,
  children,
}: {
  draggableId: string;
  index: number;
  children: (provided: {
    innerRef: any;
    draggableProps: any;
    dragHandleProps: any;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: draggableId });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : "auto",
        cursor: "grabbing",
      }
    : { cursor: "grab" };

  return (
    <>
      {children({
        innerRef: setNodeRef,
        draggableProps: { style },
        dragHandleProps: { ...listeners, ...attributes },
      })}
    </>
  );
}