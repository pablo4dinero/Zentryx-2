// Shared types for the Materials & Demand Planning module.

export type Account = {
  id: number;
  company: string;
  productName: string | null;
  productType: string | null;
  urgencyLevel: string;
  volume: string | null;
  accountManagerNames: string[];
  contactPerson: string | null;
  cpPhone: string | null;
  cpEmail: string | null;
  customerType: string | null;
  application: string | null;
  targetPrice: string | null;
  competitorReference: string | null;
  accountManagers: number[];
  createdAt: string;
  updatedAt: string;
};

export type MonthlyOrder = {
  id: number;
  month: string;
  accountId: number;
  customerName: string;
  productDescription: string;
  volumeKg: number;
  dateOrdered: string;
  expectedDeliveryDateDate: string;
  productionStatus: "Pending" | "In Process" | "Produced" | "Warehouse" | "Dispatch" | string;
  distributionType: "Pick Up" | "Delivery" | string;
  packingStatus: "Not Packed" | "Partially Packed" | "Completed" | string;
  deliveryStatus: "Yes" | "No" | string;
  createdAt: string;
  updatedAt: string;
};

export type ProductionOrder = {
  id: number;
  salesOrderId?: number;
  accountId?: number;
  accountName?: string;
  accountCompany?: string | null;
  productName?: string | null;
  productType?: string | null;
  volume?: number | string | null;
  rawMaterialStatus?: "Available" | "Not Available" | "Pending" | string;
  microbialAnalysis?: string | null;
  remarks?: string | null;
  orderStatus?: string | null;
  isPlanned?: boolean;
  isProduced?: boolean;
  isDelivered?: boolean;
  expectedDeliveryDateDate?: string | null;
};

export type SFOrder = {
  id: number;
  productionOrderId: number;
  accountId: number;
  accountCompany: string | null;
  productName: string | null;
  price: string | null;
  volume: string | null;
  dateOrdered: string | null;
  expectedDeliveryDate: string | null;
  dateDelivered: string | null;
  createdAt: string;
};

export type MergedOrder = ProductionOrder & {
  sfId: number;
  accountId: number;
  dateOrdered: string | null;
  expectedDeliveryDate: string | null;
  createdAt: string;
};

export type ProductionHistoryView = "daily" | "weekly" | "monthly" | "yearly";

export type ProducedOrder = {
  id: number;
  productionOrderId?: number | null;
  floorAssignmentId?: number | null;
  floorId?: number | null;
  weekLabel?: string | null;
  assignedDay?: string | null;
  accountName: string;
  productName: string;
  productType: string;
  volume: number;
  producedAt: string;
  deliveryStatus: string;
  deliveredAt?: string | null;
};

export type WorkingWeek = {
  weekLabel: string;
  weekNumber: number;
  days: Date[];
  startDate: Date;
  endDate: Date;
};

export type FloorStatus = "Running" | "Under Maintenance" | "On Hold";

export type ProductionFloor = {
  id: number;
  floorName: string;
  blendCategory: "Sweet" | "Savory" | "Sweet/Savory" | "Savory/Sweet";
  maxCapacityKg: number;
  status?: FloorStatus | string | null;
  allowedProductTypes?: string[] | null;
};

export type FloorAssignmentRow = {
  assignment: {
    id: number;
    floorId: number;
    productionOrderId: number;
    weekLabel: string;
    assignedDay: string;
    planStatus: string;
    assignedVolume?: string | null;
    assignedAt?: string | null;
  };
  floor: ProductionFloor;
  order: ProductionOrder;
};

export interface BlendSpeed {
  id: string;
  label: string;
  timeTakenMinutes: number;
}
