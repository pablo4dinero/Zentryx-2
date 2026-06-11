// Shared pure helpers for the Materials & Demand Planning module.
import type { ProductionOrder, ProductionHistoryView, WorkingWeek, BlendSpeed, FloorStatus } from "./types";
import { DEFAULT_BLEND_SPEEDS } from "./constants";

export function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = localStorage.getItem("rd_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getCurrentWeekLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - oneJan.getTime()) / 86400000) + 1;
  const week = Math.ceil((dayOfYear + oneJan.getDay()) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const formattedDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formattedDate} · ${formattedTime}`;
}

export function formatHistoryFileDate(date: Date) {
  const formatted = date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  return formatted.toLowerCase().replace(/\s+/g, "-").replace(/,/g, "");
}

export function getHistoryRangeLabel(view: ProductionHistoryView, now = new Date()) {
  const cutoff = new Date(now);

  switch (view) {
    case "weekly":
      cutoff.setDate(now.getDate() - 7);
      break;
    case "monthly":
      cutoff.setMonth(now.getMonth() - 1);
      break;
    case "yearly":
      cutoff.setFullYear(now.getFullYear() - 1);
      break;
    default:
      cutoff.setDate(now.getDate() - 1);
      break;
  }

  const startLabel = cutoff.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endLabel = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return view === "daily" ? endLabel : `${startLabel} – ${endLabel}`;
}

export function getHistoryFileRange(view: ProductionHistoryView, now = new Date()) {
  const cutoff = new Date(now);

  switch (view) {
    case "weekly":
      cutoff.setDate(now.getDate() - 7);
      break;
    case "monthly":
      cutoff.setMonth(now.getMonth() - 1);
      break;
    case "yearly":
      cutoff.setFullYear(now.getFullYear() - 1);
      break;
    default:
      cutoff.setDate(now.getDate() - 1);
      break;
  }

  return `${formatHistoryFileDate(cutoff)}-${formatHistoryFileDate(now)}`;
}

export function getRawMaterialStatus(order: ProductionOrder) {
  if (order.rawMaterialStatus) {
    return order.rawMaterialStatus;
  }
  return order.orderStatus === "Planned" || order.orderStatus === "Produced" || order.orderStatus === "Delivered"
    ? "Available"
    : "Pending";
}

export function getStatusBadgeVariant(status?: string) {
  switch (status) {
    case "Planned":
      return "warning";
    case "Produced":
      return "success";
    case "Dispatched":
      return "info";
    case "Delivered":
      return "secondary";
    default:
      return "default";
  }
}

export function getStatusClasses(status?: string) {
  switch (status) {
    case "Planned":
      return "bg-amber-500/10 text-amber-300 border border-amber-500/20";
    case "Produced":
      return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20";
    case "Dispatched":
      return "bg-sky-500/10 text-sky-300 border border-sky-500/20";
    case "Delivered":
      return "bg-green-500/10 text-green-200 border border-green-500/20";
    default:
      return "bg-slate-500/10 text-slate-200 border border-slate-500/20";
  }
}

export function getMicrobialColor(value?: string) {
  switch (value) {
    case "Important":
      return "bg-emerald-500";
    case "Critical":
      return "bg-red-500";
    default:
      return "bg-blue-500";
  }
}

export function getOrderAccountText(order: ProductionOrder) {
  return order.accountName ?? order.accountCompany ?? `Account ${order.accountId ?? order.id}`;
}

export function getOrderProductText(order: ProductionOrder) {
  return order.productName ?? order.productType ?? "Unknown product";
}

export function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getWorkingWeeksForMonth(year: number, month: number): WorkingWeek[] {
  const weeks: WorkingWeek[] = [];
  const firstOfMonth = new Date(year, month, 1);
  let firstMonday = new Date(firstOfMonth);

  while (firstMonday.getMonth() === month && firstMonday.getDay() !== 1) {
    firstMonday.setDate(firstMonday.getDate() + 1);
  }

  if (firstMonday.getMonth() !== month || firstMonday.getDay() !== 1) {
    return weeks;
  }

  let weekNumber = 1;
  let currentStart = new Date(firstMonday);

  while (currentStart.getMonth() === month) {
    const days = Array.from({ length: 5 }, (_, index) => {
      const day = new Date(currentStart);
      day.setDate(day.getDate() + index);
      return day;
    });
    const endDate = new Date(currentStart);
    endDate.setDate(endDate.getDate() + 4);
    const formattedStart = currentStart.toLocaleDateString(undefined, {
      weekday: "short",
      month: "long",
      day: "numeric",
    });
    const formattedEnd = endDate.toLocaleDateString(undefined, {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    weeks.push({
      weekLabel: `Week ${weekNumber}: ${formattedStart} – ${formattedEnd}`,
      weekNumber,
      days,
      startDate: new Date(currentStart),
      endDate,
    });
    weekNumber += 1;
    currentStart = new Date(currentStart);
    currentStart.setDate(currentStart.getDate() + 7);
  }

  return weeks;
}

export function formatSwitchDuration(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "0mins";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}mins`;
  if (min === 0) return `${h}${h === 1 ? "hr" : "hrs"}`;
  return `${h}${h === 1 ? "hr" : "hrs"} ${min}mins`;
}

export function floorStatusColor(status: FloorStatus | string | null | undefined): { dot: string; chip: string; ring: string } {
  const s = (status ?? "Running") as FloorStatus;
  if (s === "Under Maintenance") return {
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 border-amber-500/30 text-amber-500",
    ring: "ring-amber-500/40",
  };
  if (s === "On Hold") return {
    dot: "bg-red-500",
    chip: "bg-red-500/10 border-red-500/30 text-red-500",
    ring: "ring-red-500/40",
  };
  return {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
    ring: "ring-emerald-500/40",
  };
}

// Backward-compatible reader: earlier versions stored timeTaken as a free-text
// string ("40 mins", "1hr"). New code stores timeTakenMinutes as a number.
// Parse old values, fall back to the default minutes when nothing readable.
export function parseBlendSpeedsFromStorage(raw: unknown): BlendSpeed[] {
  if (!Array.isArray(raw)) return DEFAULT_BLEND_SPEEDS;
  const defaultsById = new Map(DEFAULT_BLEND_SPEEDS.map(s => [s.id, s.timeTakenMinutes]));
  return raw.map((entry: any) => {
    const id = String(entry?.id ?? `custom_${Math.random().toString(36).slice(2, 7)}`);
    const label = String(entry?.label ?? id);
    let minutes: number = 0;
    if (typeof entry?.timeTakenMinutes === "number" && Number.isFinite(entry.timeTakenMinutes)) {
      minutes = entry.timeTakenMinutes;
    } else if (typeof entry?.timeTaken === "string") {
      const s = entry.timeTaken.toLowerCase().trim();
      // Pull a number out of strings like "40", "40 mins", "1hr", "1h 30m"
      const hrMatch = s.match(/(\d+(?:\.\d+)?)\s*h(?:r|our)?s?/);
      const minMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?:in)?/);
      const bareMatch = s.match(/^(\d+(?:\.\d+)?)\s*$/);
      if (hrMatch || minMatch) {
        minutes = (hrMatch ? Number(hrMatch[1]) * 60 : 0) + (minMatch ? Number(minMatch[1]) : 0);
      } else if (bareMatch) {
        minutes = Number(bareMatch[1]);
      }
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
      minutes = defaultsById.get(id) ?? 40;
    }
    return { id, label, timeTakenMinutes: minutes };
  });
}

export function blendSpeedColor(id: string) {
  if (id === "fast")   return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (id === "medium") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  if (id === "slow")   return "bg-blue-500/10 border-blue-500/20 text-blue-400";
  return "bg-slate-500/10 border-slate-500/20 text-slate-400";
}

export function blendSpeedFactor(speedId: string): number {
  if (speedId === "fast")   return 1.0;
  if (speedId === "medium") return 0.7;
  if (speedId === "slow")   return 0.5;
  return 1.0;
}

export function calcPriorityScore(
  rawMaterial: string,
  microbial: string,
  blendSpeedId: string,
  volume: number,
  expectedDeliveryDateDate: string | null | undefined,
): number {
  let score = 0;

  // Raw Material
  if (rawMaterial === "Available") score += 3;
  else if (rawMaterial === "Pending") score -= 5;

  // Due date urgency
  if (expectedDeliveryDateDate) {
    const due = new Date(expectedDeliveryDateDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 5) score += 4;
    else if (diffDays <= 10) score += 2;
    // >10 days = +0
  }

  // Microbial
  if (microbial === "Critical") score += 3;
  else if (microbial === "Important") score += 1;

  // Volume tiers
  if (volume > 100000) score += 6;
  else if (volume >= 50000) score += 5;
  else if (volume >= 20000) score += 4;
  else if (volume >= 10000) score += 3;
  else if (volume >= 1000) score += 2;

  // Blend Speed
  if (blendSpeedId === "slow") score += 3;
  else if (blendSpeedId === "medium") score += 1;

  return score;
}

export function priorityScoreStyle(score: number): string {
  if (score < 0)  return "bg-red-500/10 border-red-500/20 text-red-400";
  if (score >= 8) return "bg-red-500/10 border-red-500/20 text-red-400";
  if (score >= 5) return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  if (score >= 2) return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
  return "bg-slate-500/10 border-slate-500/20 text-slate-400";
}
