export type DropResult = {
  draggableId: string;
  destination?: { droppableId: string; index: number } | null;
  source: { droppableId: string; index: number };
};

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React, { createContext, useContext } from "react";

// Context to pass onDragEnd up
const DragDropCtx = createContext<((result: DropResult) => void) | null>(null);
const DroppableCtx = createContext<string>("");

export function DragDropContext({
  children,
  onDragEnd,
}: {
  children: React.ReactNode;
  onDragEnd: (result: DropResult) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const draggableId = String(active.id);
    const destination = over.data.current as {
      droppableId: string;
      index: number;
    };
    const source = active.data.current as {
      droppableId: string;
      index: number;
    };

    onDragEnd({ draggableId, source, destination });
  }

  return (
    <DragDropCtx.Provider value={onDragEnd}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
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
    provided: {
      innerRef: any;
      droppableProps: any;
      placeholder: null;
    },
    snapshot: { isDraggingOver: boolean }
  ) => React.ReactNode;
}) {
  return (
    <DroppableCtx.Provider value={droppableId}>
      <SortableContext
        id={droppableId}
        items={[]}
        strategy={verticalListSortingStrategy}
      >
        {children(
          { innerRef: null, droppableProps: {}, placeholder: null },
          { isDraggingOver: false }
        )}
      </SortableContext>
    </DroppableCtx.Provider>
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
  const droppableId = useContext(DroppableCtx);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: draggableId,
      data: { droppableId, index },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      {children({
        innerRef: setNodeRef,
        draggableProps: { style, ...attributes },
        dragHandleProps: listeners,
      })}
    </>
  );
}