import * as React from "react";

type PlannedOrdersContextType = {
  plannedOrderIds: Set<number>;
  addPlannedOrder: (orderId: number) => void;
  removePlannedOrder: (orderId: number) => void;
  isPlanningOrder: (orderId: number) => boolean;
};

const PlannedOrdersContext = React.createContext<PlannedOrdersContextType | undefined>(undefined);

export function PlannedOrdersProvider({ children }: { children: React.ReactNode }) {
  const [plannedOrderIds, setPlannedOrderIds] = React.useState<Set<number>>(new Set());

  const addPlannedOrder = React.useCallback((orderId: number) => {
    setPlannedOrderIds((prev) => new Set([...prev, orderId]));
  }, []);

  const removePlannedOrder = React.useCallback((orderId: number) => {
    setPlannedOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  }, []);

  const isPlanningOrder = React.useCallback((orderId: number) => {
    return plannedOrderIds.has(orderId);
  }, [plannedOrderIds]);

  return (
    <PlannedOrdersContext.Provider
      value={{ plannedOrderIds, addPlannedOrder, removePlannedOrder, isPlanningOrder }}
    >
      {children}
    </PlannedOrdersContext.Provider>
  );
}

export function usePlannedOrders() {
  const context = React.useContext(PlannedOrdersContext);
  if (!context) {
    throw new Error("usePlannedOrders must be used within PlannedOrdersProvider");
  }
  return context;
}
