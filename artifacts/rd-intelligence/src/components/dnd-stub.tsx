export type DropResult = {
  draggableId: string;
  destination?: { droppableId: string; index: number } | null;
  source: { droppableId: string; index: number };
};
export const DragDropContext = ({ children }: any) => children;
export const Droppable = ({ children }: any) => children({ innerRef: null, droppableProps: {}, placeholder: null }, {});
export const Draggable = ({ children }: any) => children({ innerRef: null, draggableProps: {}, dragHandleProps: {} }, {});