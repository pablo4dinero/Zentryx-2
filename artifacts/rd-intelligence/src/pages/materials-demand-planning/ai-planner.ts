// ─────────────────────────────────────────────────────────────────────────────
// AI Assisted Planning — pure client-side scheduler
//
// Given the planned-orders list, the floor configuration, the user-defined
// blend-speed times, the active week, and the include-night-shift /
// include-saturday toggles, this function produces a list of floor-assignment
// placements that the caller can then POST through the normal /api/mdp/
// floor-assignments endpoint.
//
// Everything is computed locally. No external API calls.
// ─────────────────────────────────────────────────────────────────────────────

export type BlendSpeed = { id: string; label: string; timeTakenMinutes: number };

export type Floor = {
  id: number;
  floorName: string;
  maxCapacityKg: number;
  allowedProductTypes?: string[] | null;
};

export type Order = {
  id: number;
  productionLabel: string;        // e.g. "FMN — Party Jollof"
  productType: string | null;     // resolved through account map by caller
  blendSpeedId: string;           // "fast" | "medium" | "slow" | custom
  microbialAnalysis: string;      // "Critical" | "Important" | "Normal" | other
  rawMaterialStatus: string;      // "Available" | "Pending" | "Not Available"
  expectedDeliveryDate: string | null;
  remainingQuantity: number;      // KG left to assign (mother volume − Σ assigned)
  priorityScore: number;          // already-computed score (display & sort key)
};

export type ExistingCellUsage = {
  // For a given (floorId, day) cell: minutes already consumed by manual
  // assignments and the product types already on the floor that day.
  minutesUsed: number;
  productTypes: Set<string>;      // normalised
};

export type PlanningInputs = {
  floors: Floor[];
  orders: Order[];
  blendSpeeds: BlendSpeed[];
  /** Mon→Sat short labels (e.g. ["Mon","Tue","Wed","Thu","Fri"], +Sat if on). */
  workingDays: string[];
  /** Date for each working day, aligned by index with workingDays. */
  workingDates: Date[];
  includeNightShift: boolean;
  /** existingUsage[`${floorId}|${day}`] — day is "Mon" or "Mon-NS". */
  existingUsage: Map<string, ExistingCellUsage>;
  /** Skip these (floorId, day) cells — floor is Under Maintenance / On Hold. */
  isFloorDayBlocked: (floorId: number, day: string) => boolean;
  /** Today's date at 00:00 — used for at-risk + future delivery filtering. */
  today: Date;
};

export type Placement = {
  floorId: number;
  productionOrderId: number;
  assignedDay: string;            // "Mon" or "Mon-NS"
  assignedVolume: number;
};

export type PlanningSummary = {
  fullyScheduled: { orderId: number; label: string }[];
  partiallyScheduled: { orderId: number; label: string; leftoverKg: number }[];
  skipped: { orderId: number; label: string; reason: string }[];
  atRisk: { orderId: number; label: string }[];
  switchDays: { floorName: string; day: string }[];
};

export type PlanningOutput = {
  placements: Placement[];
  summary: PlanningSummary;
};

// Constants from the spec
const STANDARD_DAY_MINUTES = 450;
const NIGHT_SHIFT_MINUTES = 450;
const SLOW_BLEND_CAP_KG = 8_000;
const DEFAULT_SWITCH_MINUTES = 60;

function normalizeType(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase().replace(/[\s&_\-/]+/g, "_");
}

function calendarDaysBefore(dateIso: string | null, days: number): Date | null {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (isNaN(d.getTime())) return null;
  const out = new Date(d);
  out.setDate(out.getDate() - days);
  out.setHours(0, 0, 0, 0);
  return out;
}

function blendMinutesById(blendSpeeds: BlendSpeed[], id: string): number {
  const found = blendSpeeds.find(b => b.id === id);
  if (found && found.timeTakenMinutes > 0) return found.timeTakenMinutes;
  // Fallback to Fast — same behaviour as the existing blendSpeedFactor
  const fast = blendSpeeds.find(b => b.id === "fast");
  return fast?.timeTakenMinutes ?? 40;
}

// Daily capacity for a floor at a given blend speed. Spec:
//   fast:   floor.maxCapacityKg
//   medium: floor.maxCapacityKg × (fastMin / mediumMin)
//   slow:   min(floor.maxCapacityKg × (fastMin / slowMin), 8000)
function dailyCapacityKg(floor: Floor, blendSpeedId: string, blendSpeeds: BlendSpeed[]): number {
  const fastMin = blendMinutesById(blendSpeeds, "fast");
  const thisMin = blendMinutesById(blendSpeeds, blendSpeedId);
  if (blendSpeedId === "fast") return floor.maxCapacityKg;
  const scaled = floor.maxCapacityKg * (fastMin / thisMin);
  if (blendSpeedId === "slow") return Math.min(scaled, SLOW_BLEND_CAP_KG);
  return scaled;
}

// Batches that fit in a day's full Fast schedule — defines the batch size used
// for any blend speed on this floor.
function batchSizeKg(floor: Floor, blendSpeeds: BlendSpeed[]): number {
  const fastMin = blendMinutesById(blendSpeeds, "fast");
  const fastBatches = Math.max(1, Math.floor(STANDARD_DAY_MINUTES / fastMin));
  return floor.maxCapacityKg / fastBatches;
}

// Cell key helper
const cellKey = (floorId: number, day: string) => `${floorId}|${day}`;

// Sort orders: priority desc, then remaining desc, then exp date asc
function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.remainingQuantity !== a.remainingQuantity) return b.remainingQuantity - a.remainingQuantity;
    const da = a.expectedDeliveryDate ? new Date(a.expectedDeliveryDate).getTime() : Infinity;
    const db = b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate).getTime() : Infinity;
    return da - db;
  });
}

// Microbial buffer per spec
function microbialBufferDays(microbial: string): number {
  if (microbial === "Critical") return 5;
  if (microbial === "Important") return 2;
  return 0;
}

// Floor eligibility for an order's product type. Empty list = unrestricted.
function isFloorEligible(floor: Floor, orderProductType: string | null): boolean {
  const allowed = floor.allowedProductTypes ?? [];
  if (allowed.length === 0) return true;
  if (!orderProductType) return true;
  const norm = normalizeType(orderProductType);
  return allowed.some(a => normalizeType(a) === norm);
}

export function runAssistedPlanning(input: PlanningInputs): PlanningOutput {
  const { floors, orders, blendSpeeds, workingDays, workingDates, includeNightShift, existingUsage, isFloorDayBlocked, today } = input;

  // ── Step 1: filter eligible orders ────────────────────────────────────────
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);

  const eligibleOrders: Order[] = [];
  const skipped: PlanningSummary["skipped"] = [];

  for (const order of orders) {
    if (order.remainingQuantity <= 0) continue;
    if (order.rawMaterialStatus !== "Available") {
      skipped.push({ orderId: order.id, label: order.productionLabel, reason: `Raw material ${order.rawMaterialStatus}` });
      continue;
    }
    if (order.expectedDeliveryDate) {
      const exp = new Date(order.expectedDeliveryDate);
      exp.setHours(0, 0, 0, 0);
      if (exp.getTime() < todayMidnight.getTime()) {
        skipped.push({ orderId: order.id, label: order.productionLabel, reason: "Delivery date has passed" });
        continue;
      }
    }
    eligibleOrders.push(order);
  }

  // ── Step 2: microbial buffer + at-risk flag ───────────────────────────────
  const latestCompletion = new Map<number, Date | null>();
  const atRisk: PlanningSummary["atRisk"] = [];

  for (const order of eligibleOrders) {
    const buffer = microbialBufferDays(order.microbialAnalysis);
    const dueBy = calendarDaysBefore(order.expectedDeliveryDate, buffer);
    latestCompletion.set(order.id, dueBy);
    if (dueBy && dueBy.getTime() < todayMidnight.getTime()) {
      atRisk.push({ orderId: order.id, label: order.productionLabel });
    }
  }

  // ── Step 3: sort by priority ──────────────────────────────────────────────
  const sortedOrders = sortOrders(eligibleOrders);

  // ── Step 5: per-cell minute budget (Step 4 capacities computed inline) ────
  // We model day-shift and night-shift as separate cells (existing UI layout).
  // Available minutes start at STANDARD_DAY_MINUTES, minus what manual
  // assignments already consumed.
  const cellMinutesRemaining = new Map<string, number>();
  const cellProductTypes = new Map<string, Set<string>>();

  const eligibleCells: { floorId: number; day: string; dayIndex: number; isNS: boolean }[] = [];

  for (let i = 0; i < workingDays.length; i++) {
    const day = workingDays[i];
    for (const floor of floors) {
      // Day shift
      if (!isFloorDayBlocked(floor.id, day)) {
        const key = cellKey(floor.id, day);
        const used = existingUsage.get(key);
        cellMinutesRemaining.set(key, Math.max(0, STANDARD_DAY_MINUTES - (used?.minutesUsed ?? 0)));
        cellProductTypes.set(key, new Set(used?.productTypes ?? []));
        eligibleCells.push({ floorId: floor.id, day, dayIndex: i, isNS: false });
      }
      // Night shift — only if the toggle is on
      if (includeNightShift) {
        const nsDay = `${day}-NS`;
        if (!isFloorDayBlocked(floor.id, nsDay)) {
          const key = cellKey(floor.id, nsDay);
          const used = existingUsage.get(key);
          cellMinutesRemaining.set(key, Math.max(0, NIGHT_SHIFT_MINUTES - (used?.minutesUsed ?? 0)));
          cellProductTypes.set(key, new Set(used?.productTypes ?? []));
          eligibleCells.push({ floorId: floor.id, day: nsDay, dayIndex: i, isNS: true });
        }
      }
    }
  }

  // ── Step 6: assign orders ─────────────────────────────────────────────────
  const placements: Placement[] = [];
  const fullyScheduled: PlanningSummary["fullyScheduled"] = [];
  const partiallyScheduled: PlanningSummary["partiallyScheduled"] = [];
  const switchDays: PlanningSummary["switchDays"] = [];

  // Helper: ordered list of cells for a floor up to latestCompletion (or
  // through all workingDays if no deadline). Day-shift first, then NS.
  const cellsForFloorByDeadline = (floorId: number, deadline: Date | null) => {
    const out: { day: string; dayIndex: number; isNS: boolean }[] = [];
    for (let i = 0; i < workingDays.length; i++) {
      const date = workingDates[i];
      if (deadline && date.getTime() > deadline.getTime()) break;
      if (!isFloorDayBlocked(floorId, workingDays[i])) {
        out.push({ day: workingDays[i], dayIndex: i, isNS: false });
      }
      if (includeNightShift) {
        const nsDay = `${workingDays[i]}-NS`;
        if (!isFloorDayBlocked(floorId, nsDay)) {
          out.push({ day: nsDay, dayIndex: i, isNS: true });
        }
      }
    }
    return out;
  };

  const tryAssignOnFloor = (order: Order, floor: Floor): number => {
    // Returns KG remaining after exhausting this floor's available cells.
    const deadline = latestCompletion.get(order.id) ?? null;
    const blendMins = blendMinutesById(blendSpeeds, order.blendSpeedId || "fast");
    const dailyCap = dailyCapacityKg(floor, order.blendSpeedId || "fast", blendSpeeds);
    const bSize = batchSizeKg(floor, blendSpeeds);
    const orderType = normalizeType(order.productType);

    for (const cell of cellsForFloorByDeadline(floor.id, deadline)) {
      if (order.remainingQuantity <= 0) break;
      const key = cellKey(floor.id, cell.day);
      let availableMin = cellMinutesRemaining.get(key) ?? 0;
      if (availableMin <= 0) continue;

      // Switch cost if a different product is already on this cell
      const existingTypes = cellProductTypes.get(key) ?? new Set();
      const hasOtherType = orderType && [...existingTypes].some(t => t && t !== orderType);
      if (hasOtherType) {
        availableMin -= DEFAULT_SWITCH_MINUTES;
        if (availableMin <= 0) continue;
        switchDays.push({ floorName: floor.floorName, day: cell.day });
      }

      const batches = Math.floor(availableMin / blendMins);
      if (batches <= 0) continue;
      const assignable = Math.min(
        batches * bSize,
        order.remainingQuantity,
        dailyCap,
      );
      if (assignable <= 0) continue;

      placements.push({
        floorId: floor.id,
        productionOrderId: order.id,
        assignedDay: cell.day,
        assignedVolume: Math.round(assignable * 10) / 10,
      });

      // Consume minutes proportional to the volume actually placed
      const minutesUsed = Math.ceil(assignable / bSize) * blendMins + (hasOtherType ? DEFAULT_SWITCH_MINUTES : 0);
      cellMinutesRemaining.set(key, Math.max(0, (cellMinutesRemaining.get(key) ?? 0) - minutesUsed));
      if (orderType) cellProductTypes.set(key, new Set([...existingTypes, orderType]));
      order.remainingQuantity -= assignable;
    }

    return order.remainingQuantity;
  };

  for (const order of sortedOrders) {
    if (order.remainingQuantity <= 0) continue;

    const candidates = floors.filter(f => isFloorEligible(f, order.productType));
    if (candidates.length === 0) {
      skipped.push({ orderId: order.id, label: order.productionLabel, reason: "No eligible floor for this product type" });
      continue;
    }

    // Best-floor heuristic
    candidates.sort((a, b) => {
      if (order.remainingQuantity > 5_000) {
        // Prefer largest floor
        return b.maxCapacityKg - a.maxCapacityKg;
      }
      // Prefer floor with the most matching daily capacity but smaller overall
      const aCap = dailyCapacityKg(a, order.blendSpeedId || "fast", blendSpeeds);
      const bCap = dailyCapacityKg(b, order.blendSpeedId || "fast", blendSpeeds);
      // Favour a floor whose capacity is closest above the remaining
      const aFit = aCap >= order.remainingQuantity ? aCap - order.remainingQuantity : Infinity;
      const bFit = bCap >= order.remainingQuantity ? bCap - order.remainingQuantity : Infinity;
      if (aFit !== bFit) return aFit - bFit;
      return a.maxCapacityKg - b.maxCapacityKg;
    });

    const initialRemaining = order.remainingQuantity;

    // High-volume orders can spread across floors as well as days
    for (const floor of candidates) {
      if (order.remainingQuantity <= 0) break;
      tryAssignOnFloor(order, floor);
    }

    if (order.remainingQuantity <= 0) {
      fullyScheduled.push({ orderId: order.id, label: order.productionLabel });
    } else if (order.remainingQuantity < initialRemaining) {
      partiallyScheduled.push({ orderId: order.id, label: order.productionLabel, leftoverKg: Math.round(order.remainingQuantity) });
    } else {
      skipped.push({ orderId: order.id, label: order.productionLabel, reason: "No capacity before delivery date" });
    }
  }

  // ── Step 7: gap-fill pass (zero-switch top-ups for same product type) ─────
  for (const cell of eligibleCells) {
    const key = cellKey(cell.floorId, cell.day);
    let availableMin = cellMinutesRemaining.get(key) ?? 0;
    const types = cellProductTypes.get(key) ?? new Set();
    if (availableMin <= 0 || types.size !== 1) continue;
    const [onlyType] = types;
    const floor = floors.find(f => f.id === cell.floorId);
    if (!floor) continue;
    const bSize = batchSizeKg(floor, blendSpeeds);

    // Find any order matching this type with remaining > 0
    for (const order of sortedOrders) {
      if (order.remainingQuantity <= 0) continue;
      if (normalizeType(order.productType) !== onlyType) continue;
      if (!isFloorEligible(floor, order.productType)) continue;

      const blendMins = blendMinutesById(blendSpeeds, order.blendSpeedId || "fast");
      const dailyCap = dailyCapacityKg(floor, order.blendSpeedId || "fast", blendSpeeds);
      const batches = Math.floor(availableMin / blendMins);
      if (batches <= 0) break;
      const assignable = Math.min(batches * bSize, order.remainingQuantity, dailyCap);
      if (assignable <= 0) continue;

      placements.push({
        floorId: floor.id,
        productionOrderId: order.id,
        assignedDay: cell.day,
        assignedVolume: Math.round(assignable * 10) / 10,
      });
      const minutesUsed = Math.ceil(assignable / bSize) * blendMins;
      availableMin -= minutesUsed;
      cellMinutesRemaining.set(key, Math.max(0, availableMin));
      order.remainingQuantity -= assignable;

      // Move from partial → fully scheduled if we just closed it out
      if (order.remainingQuantity <= 0) {
        const partialIdx = partiallyScheduled.findIndex(p => p.orderId === order.id);
        if (partialIdx >= 0) {
          partiallyScheduled.splice(partialIdx, 1);
          fullyScheduled.push({ orderId: order.id, label: order.productionLabel });
        }
      } else {
        const partialIdx = partiallyScheduled.findIndex(p => p.orderId === order.id);
        if (partialIdx >= 0) {
          partiallyScheduled[partialIdx] = { ...partiallyScheduled[partialIdx], leftoverKg: Math.round(order.remainingQuantity) };
        }
      }

      if (availableMin < blendMins) break;
    }
  }

  return {
    placements,
    summary: { fullyScheduled, partiallyScheduled, skipped, atRisk, switchDays },
  };
}
