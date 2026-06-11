// Shared constants for the Materials & Demand Planning module.
import type { FloorStatus, BlendSpeed } from "./types";

export const BASE = import.meta.env.BASE_URL;

export const SF_URGENCY = [
  { value: "urgent", label: "Urgent", color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20",       dot: "bg-red-500" },
  { value: "medium", label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-500" },
  { value: "normal", label: "Normal", color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20",   dot: "bg-green-500" },
];

export const DEFAULT_FORM = {
  company: "",
  productName: "",
  productType: "",
  customerType: "new",
  contactPerson: "",
  cpPhone: "",
  cpEmail: "",
  application: "",
  targetPrice: "",
  volume: "",
  urgencyLevel: "normal",
  competitorReference: "",
  accountManagers: [] as number[],
};

export const STATUS_OPTIONS = ["Ordered", "Planned", "Produced", "Dispatched", "Delivered"] as const;

export const MICROBIAL_OPTIONS = [
  { value: "Normal", label: "Normal", color: "bg-blue-500" },
  { value: "Important", label: "Important", color: "bg-emerald-500" },
  { value: "Critical", label: "Critical", color: "bg-red-500" },
];

export const FLOOR_STATUSES: FloorStatus[] = ["Running", "Under Maintenance", "On Hold"];

export const SWITCH_PRESETS = [30, 60, 90, 120, 150, 180];

export const DEFAULT_BLEND_SPEEDS: BlendSpeed[] = [
  { id: "fast",   label: "Fast",   timeTakenMinutes: 40 },
  { id: "medium", label: "Medium", timeTakenMinutes: 50 },
  { id: "slow",   label: "Slow",   timeTakenMinutes: 60 },
];

export const LS_BLEND_SPEEDS     = "zentryx-blend-speeds";
export const LS_ORDER_BLENDSPEED = "zentryx-order-blendspeed";
