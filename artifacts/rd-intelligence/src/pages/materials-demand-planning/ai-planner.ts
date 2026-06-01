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
  blendCategory: string;        // "Sweet" | "Savory" | "Sweet/Savory" | "Savory/Sweet"
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

// ─────────────────────────────────────────────────────────────────────────────
// PROACTIVE GROUPING & SMART SEQUENCING
// Groups orders by product type, then sorts within groups by volume (desc)
// and deadline (asc). This minimizes product switches by keeping similar
// products together.
// ─────────────────────────────────────────────────────────────────────────────

type ProductGroup = {
  productType: string;  // normalized type
  orders: Order[];      // sorted by volume desc, deadline asc
  totalVolume: number;  // sum of remainingQuantity
};

function createProductGroups(orders: Order[]): ProductGroup[] {
  const groupMap = new Map<string, Order[]>();

  // Group orders by normalized product type
  for (const order of orders) {
    const key = normalizeType(order.productType);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(order);
  }

  // Convert to ProductGroup and sort within each group
  const groups: ProductGroup[] = [];
  for (const [productType, groupOrders] of groupMap.entries()) {
    // Sort within group: Volume DESC (largest first), then Deadline ASC (urgent first)
    const sorted = [...groupOrders].sort((a, b) => {
      if (b.remainingQuantity !== a.remainingQuantity) {
        return b.remainingQuantity - a.remainingQuantity;  // Volume DESC
      }
      const da = a.expectedDeliveryDate ? new Date(a.expectedDeliveryDate).getTime() : Infinity;
      const db = b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate).getTime() : Infinity;
      return da - db;  // Deadline ASC
    });

    const totalVolume = sorted.reduce((sum, o) => sum + o.remainingQuantity, 0);
    groups.push({ productType, orders: sorted, totalVolume });
  }

  // Sort groups by total volume DESC (largest product groups first)
  groups.sort((a, b) => b.totalVolume - a.totalVolume);

  return groups;
}

// Microbial buffer per spec
function microbialBufferDays(microbial: string): number {
  if (microbial === "Critical") return 5;
  if (microbial === "Important") return 2;
  return 0;
}

// Helper: Check if a product type is in the "savory" group (Seasoning, Marinade, Curry, Breading)
function isSavoryGroup(productType: string | null): boolean {
  if (!productType) return false;
  const t = normalizeType(productType);
  return t.includes("seasoning") || t.includes("marinade") || t.includes("curry") || t.includes("breading");
}

// Helper: Check if a product type is in the "sweet" group (Dairy Premix, Bread Premix, Snack Dusting, Sweet Flavour, Functional Blend, Dough Premix)
function isSweetGroup(productType: string | null): boolean {
  if (!productType) return false;
  const t = normalizeType(productType);
  return t.includes("dairy") || t.includes("bread") || t.includes("snack") || t.includes("sweet") ||
         t.includes("functional") || t.includes("dough");
}

// Helper: Check if product is in Floor 3 Mon-Tue exclusive group
// (Dairy Premix, Bread Premix, Dough Premix, Snack Dusting, Sweet Flavour)
function isMonTueExclusiveProduct(productType: string | null): boolean {
  if (!productType) return false;
  const t = normalizeType(productType);
  return t.includes("dairy") || t.includes("bread") || t.includes("snack") ||
         t.includes("dough") || t.includes("sweet");
}

// Floor eligibility:
//   1. If the floor has an explicit allowedProductTypes list, that wins —
//      strict include match.
//   2. If no list is configured, fall back to blendCategory rules
//      (Sweet floors reject Savory products and vice-versa) so a Sweet floor
//      doesn't silently accept Seasoning just because nobody filled the list.
//   3. Mixed categories ("Sweet/Savory", "Savory/Sweet") and unknown values
//      accept anything in the fallback.
//   4. Special cases: Floor 2 can accept Dairy Premix, Floor 3 can accept Curry/Breading/Seasoning/Marinade.
function isFloorEligible(floor: Floor, orderProductType: string | null, volume?: number): boolean {
  const allowed = floor.allowedProductTypes ?? [];
  if (allowed.length > 0) {
    if (!orderProductType) return false;
    const norm = normalizeType(orderProductType);
    return allowed.some(a => normalizeType(a) === norm);
  }
  if (!orderProductType) return true;
  const t = normalizeType(orderProductType);

  // Floor 2 Strategy: Accept ALL orders ≤500kg (primary destination for small orders)
  // NEVER assign orders over 500kg to Floor 2
  if (floor.floorName === "Floor 2") {
    if (volume && volume > 500) {
      return false;  // Reject orders >500kg
    }
    // Accept all products ≤500kg
    return true;
  }

  // Floor 3 special cases
  if (floor.floorName === "Floor 3") {
    // Allow Curry and Breading
    if (t.includes("curry") || t.includes("breading")) return true;
    // Allow Seasoning and Marinade only if volume is 600-2000kg
    if ((t.includes("seasoning") || t.includes("marinade")) && volume) {
      return volume >= 600 && volume <= 2000;
    }
  }

  const cat = String(floor.blendCategory ?? "").trim().toLowerCase();
  const isSavoryProduct = t.includes("seasoning") || t.includes("savoury") || t.includes("savory");
  const isSweetProduct  = t.includes("dairy") || t.includes("bakery") || t.includes("bread") || t.includes("sweet");
  if (cat === "sweet")  return !isSavoryProduct;
  if (cat === "savory") return !isSweetProduct;
  return true;
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

  // ── Step 3a: create product groups for smart sequencing ───────────────────
  // Group orders by product type, sort within groups by volume + deadline.
  // This minimizes product switches by keeping similar products together.
  const productGroups = createProductGroups(eligibleOrders);

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
  const cellsForFloorByDeadline = (floorId: number, deadline: Date | null, daysFilter?: string[]) => {
    const out: { day: string; dayIndex: number; isNS: boolean }[] = [];
    for (let i = 0; i < workingDays.length; i++) {
      const date = workingDates[i];
      if (deadline && date.getTime() > deadline.getTime()) break;
      // Filter by day if daysFilter provided (e.g., ["Mon", "Tue"])
      if (daysFilter && !daysFilter.includes(workingDays[i])) continue;
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

      // Check day conflict: Savory group cannot be with Sweet group on same day
      const existingTypes = cellProductTypes.get(key) ?? new Set();
      const currentIsSavory = isSavoryGroup(order.productType);
      const currentIsSweet = isSweetGroup(order.productType);
      const existingHasSavory = [...existingTypes].some(t => isSavoryGroup(t));
      const existingHasSweet = [...existingTypes].some(t => isSweetGroup(t));

      if ((currentIsSavory && existingHasSweet) || (currentIsSweet && existingHasSavory)) {
        // Cannot blend on same day - skip this cell
        continue;
      }

      // Switch cost if a different product is already on this cell
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

  // ── Step 6a: Floor 3 Monday/Tuesday Priority Assignment ──────────────────────
  // Prioritize assigning Floor 3 priority products (Dairy Premix, Bread Premix,
  // Dough Premix, Snack Dusting, Functional Blend >500kg, Sweet Flavour >500kg)
  // to Floor 3 on Mon/Tue first, before allowing other product types on those days.
  const floor3 = floors.find(f => f.floorName === "Floor 3");
  if (floor3) {
    // First pass: assign Floor 3 priority products to Mon/Tue
    for (const order of sortedOrders) {
      if (order.remainingQuantity <= 0) continue;
      if (!isFloor3Priority(order.productType, order.remainingQuantity)) continue;
      if (assignedToFloor3MonTue.has(order.id)) continue;

      // Try to assign priority products to Floor 3 on Mon/Tue only
      const deadline = latestCompletion.get(order.id) ?? null;
      const blendMins = blendMinutesById(blendSpeeds, order.blendSpeedId || "fast");
      const dailyCap = dailyCapacityKg(floor3, order.blendSpeedId || "fast", blendSpeeds);
      const bSize = batchSizeKg(floor3, blendSpeeds);
      const orderType = normalizeType(order.productType);

      for (const cell of cellsForFloorByDeadline(floor3.id, deadline, ["Mon", "Tue"])) {
        if (order.remainingQuantity <= 0) break;
        const key = cellKey(floor3.id, cell.day);
        let availableMin = cellMinutesRemaining.get(key) ?? 0;
        if (availableMin <= 0) continue;

        // Check day conflict: Savory group cannot be with Sweet group on same day
        const existingTypes = cellProductTypes.get(key) ?? new Set();
        const currentIsSavory = isSavoryGroup(order.productType);
        const currentIsSweet = isSweetGroup(order.productType);
        const existingHasSavory = [...existingTypes].some(t => isSavoryGroup(t));
        const existingHasSweet = [...existingTypes].some(t => isSweetGroup(t));

        if ((currentIsSavory && existingHasSweet) || (currentIsSweet && existingHasSavory)) {
          continue;
        }

        // Switch cost if a different product is already on this cell
        const hasOtherType = orderType && [...existingTypes].some(t => t && t !== orderType);
        if (hasOtherType) {
          availableMin -= DEFAULT_SWITCH_MINUTES;
          if (availableMin <= 0) continue;
          switchDays.push({ floorName: floor3.floorName, day: cell.day });
        }

        const batches = Math.floor(availableMin / blendMins);
        if (batches <= 0) continue;
        const assignable = Math.min(batches * bSize, order.remainingQuantity, dailyCap);
        if (assignable <= 0) continue;

        placements.push({
          floorId: floor3.id,
          productionOrderId: order.id,
          assignedDay: cell.day,
          assignedVolume: Math.round(assignable * 10) / 10,
        });

        const minutesUsed = Math.ceil(assignable / bSize) * blendMins + (hasOtherType ? DEFAULT_SWITCH_MINUTES : 0);
        cellMinutesRemaining.set(key, Math.max(0, (cellMinutesRemaining.get(key) ?? 0) - minutesUsed));
        if (orderType) cellProductTypes.set(key, new Set([...existingTypes, orderType]));
        order.remainingQuantity -= assignable;
        assignedToFloor3MonTue.set(order.id);
      }
    }
  }

  // ── Step 6b: Three-Phase Strategic Assignment ────────────────────────────────
  // Phase 1: Route all ≤500kg orders to Floor 2 (maximize Floor 2 utilization)
  // Phase 2: Assign Mon-Tue exclusive products to Floor 3 Mon-Tue
  // Phase 3: Assign remaining orders (>500kg + other products) to Floor 3 Wed-Fri+

  // PHASE 1: Assign ALL ≤500kg orders to Floor 2 (MANDATORY - all of them, no exceptions)
  // This is the ONLY place ≤500kg orders can go. Mark them so Phase 2/3 skip them.
  const floor2 = floors.find(f => f.floorName === "Floor 2");
  const floor2AssignedOrders = new Set<number>();  // Track which orders Phase 1 assigns

  if (floor2) {
    // Collect ALL ≤500kg orders first (before processing)
    const smallOrders = sortedOrders.filter(o => o.remainingQuantity <= 500);

    // Sort by volume DESC (largest first), then deadline ASC (earliest second)
    // This fills Floor 2 capacity efficiently and respects delivery dates
    const smallByVolume = smallOrders.sort((a, b) => {
      if (b.remainingQuantity !== a.remainingQuantity) return b.remainingQuantity - a.remainingQuantity;  // Volume DESC
      const da = a.expectedDeliveryDate ? new Date(a.expectedDeliveryDate).getTime() : Infinity;
      const db = b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate).getTime() : Infinity;
      return da - db;  // Deadline ASC
    });

    for (const order of smallByVolume) {
      if (order.remainingQuantity <= 0) continue;

      const deadline = latestCompletion.get(order.id) ?? null;
      const blendMins = blendMinutesById(blendSpeeds, order.blendSpeedId || "fast");
      const dailyCap = dailyCapacityKg(floor2, order.blendSpeedId || "fast", blendSpeeds);
      const bSize = batchSizeKg(floor2, blendSpeeds);
      const orderType = normalizeType(order.productType);

      // Try to assign to ANY available cell (no Savory/Sweet conflict restriction)
      for (const cell of cellsForFloorByDeadline(floor2.id, deadline)) {
        if (order.remainingQuantity <= 0) break;
        const key = cellKey(floor2.id, cell.day);
        let availableMin = cellMinutesRemaining.get(key) ?? 0;
        if (availableMin <= 0) continue;

        const existingTypes = cellProductTypes.get(key) ?? new Set();
        const hasOtherType = orderType && [...existingTypes].some(t => t && t !== orderType);
        if (hasOtherType) {
          availableMin -= DEFAULT_SWITCH_MINUTES;
          if (availableMin <= 0) continue;
          switchDays.push({ floorName: floor2.floorName, day: cell.day });
        }

        const batches = Math.floor(availableMin / blendMins);
        if (batches <= 0) continue;
        const assignable = Math.min(batches * bSize, order.remainingQuantity, dailyCap);
        if (assignable <= 0) continue;

        placements.push({
          floorId: floor2.id,
          productionOrderId: order.id,
          assignedDay: cell.day,
          assignedVolume: Math.round(assignable * 10) / 10,
        });

        const minutesUsed = Math.ceil(assignable / bSize) * blendMins + (hasOtherType ? DEFAULT_SWITCH_MINUTES : 0);
        cellMinutesRemaining.set(key, Math.max(0, (cellMinutesRemaining.get(key) ?? 0) - minutesUsed));
        if (orderType) cellProductTypes.set(key, new Set([...existingTypes, orderType]));
        order.remainingQuantity -= assignable;
      }

      if (order.remainingQuantity <= 0) {
        floor2AssignedOrders.add(order.id);  // Mark as fully assigned by Phase 1
        const idx = fullyScheduled.findIndex(p => p.orderId === order.id);
        if (idx < 0) fullyScheduled.push({ orderId: order.id, label: order.productionLabel });
      }
    }
  }

  // PHASE 2: Assign Mon-Tue exclusive products to Floor 3 Mon-Tue
  if (floor3) {
    for (const order of sortedOrders) {
      if (order.remainingQuantity <= 0) continue;
      if (!isMonTueExclusiveProduct(order.productType)) continue;  // Only Phase 2 products

      // Assign only to Mon-Tue
      const deadline = latestCompletion.get(order.id) ?? null;
      const blendMins = blendMinutesById(blendSpeeds, order.blendSpeedId || "fast");
      const dailyCap = dailyCapacityKg(floor3, order.blendSpeedId || "fast", blendSpeeds);
      const bSize = batchSizeKg(floor3, blendSpeeds);
      const orderType = normalizeType(order.productType);

      for (const cell of cellsForFloorByDeadline(floor3.id, deadline, ["Mon", "Tue"])) {
        if (order.remainingQuantity <= 0) break;
        const key = cellKey(floor3.id, cell.day);
        let availableMin = cellMinutesRemaining.get(key) ?? 0;
        if (availableMin <= 0) continue;

        const existingTypes = cellProductTypes.get(key) ?? new Set();
        const currentIsSavory = isSavoryGroup(order.productType);
        const currentIsSweet = isSweetGroup(order.productType);
        const existingHasSavory = [...existingTypes].some(t => isSavoryGroup(t));
        const existingHasSweet = [...existingTypes].some(t => isSweetGroup(t));

        if ((currentIsSavory && existingHasSweet) || (currentIsSweet && existingHasSavory)) continue;

        const hasOtherType = orderType && [...existingTypes].some(t => t && t !== orderType);
        if (hasOtherType) {
          availableMin -= DEFAULT_SWITCH_MINUTES;
          if (availableMin <= 0) continue;
          switchDays.push({ floorName: floor3.floorName, day: cell.day });
        }

        const batches = Math.floor(availableMin / blendMins);
        if (batches <= 0) continue;
        const assignable = Math.min(batches * bSize, order.remainingQuantity, dailyCap);
        if (assignable <= 0) continue;

        placements.push({
          floorId: floor3.id,
          productionOrderId: order.id,
          assignedDay: cell.day,
          assignedVolume: Math.round(assignable * 10) / 10,
        });

        const minutesUsed = Math.ceil(assignable / bSize) * blendMins + (hasOtherType ? DEFAULT_SWITCH_MINUTES : 0);
        cellMinutesRemaining.set(key, Math.max(0, (cellMinutesRemaining.get(key) ?? 0) - minutesUsed));
        if (orderType) cellProductTypes.set(key, new Set([...existingTypes, orderType]));
        order.remainingQuantity -= assignable;
      }

      if (order.remainingQuantity <= 0) {
        const idx = fullyScheduled.findIndex(p => p.orderId === order.id);
        if (idx < 0) fullyScheduled.push({ orderId: order.id, label: order.productionLabel });
      }
    }
  }

  // PHASE 3: Assign remaining orders (>500kg + other products)
  // STRICT RULE 1: Non-exclusive products CANNOT use Floor 3 Mon-Tue (those are reserved)
  // STRICT RULE 2: ≤500kg orders CANNOT be in Phase 3 (they are Phase 1 only)
  for (const group of productGroups) {
    if (group.orders.every(o => o.remainingQuantity <= 0)) continue;
    if (group.orders.every(o => isMonTueExclusiveProduct(o.productType))) continue;  // Skip exclusive products (handled in Phase 2)

    // Mark any ≤500kg orders in this group as skipped (they belong to Phase 1 only)
    // But continue processing the >500kg orders in the group
    for (const order of group.orders) {
      if (order.remainingQuantity > 0 && order.remainingQuantity <= 500) {
        skipped.push({ orderId: order.id, label: order.productionLabel, reason: "≤500kg orders must use Floor 2 (Phase 1)" });
        order.remainingQuantity = 0;  // Mark as skipped
      }
    }

    // Find eligible floors for this product group (now only >500kg orders)
    const groupCandidates = floors.filter(f =>
      group.orders.some(o => o.remainingQuantity > 0 && isFloorEligible(f, o.productType, o.remainingQuantity))
    );

    if (groupCandidates.length === 0) {
      // All orders in this group are ineligible
      for (const order of group.orders) {
        if (order.remainingQuantity > 0) {
          skipped.push({ orderId: order.id, label: order.productionLabel, reason: "No eligible floor for this product type" });
        }
      }
      continue;
    }

    // Sort floor candidates by suitability for this group
    groupCandidates.sort((a, b) => {
      const groupSize = group.totalVolume;
      if (groupSize > 5_000) {
        return b.maxCapacityKg - a.maxCapacityKg;  // Prefer largest floor for big groups
      }
      const aCap = dailyCapacityKg(a, group.orders[0]?.blendSpeedId || "fast", blendSpeeds);
      const bCap = dailyCapacityKg(b, group.orders[0]?.blendSpeedId || "fast", blendSpeeds);
      const aFit = aCap >= groupSize ? aCap - groupSize : Infinity;
      const bFit = bCap >= groupSize ? bCap - groupSize : Infinity;
      if (aFit !== bFit) return aFit - bFit;
      return a.maxCapacityKg - b.maxCapacityKg;
    });

    // Assign all orders in this group, trying to keep them on the same floor
    for (const floor of groupCandidates) {
      if (group.orders.every(o => o.remainingQuantity <= 0)) break;

      for (const order of group.orders) {
        if (order.remainingQuantity <= 0) continue;

        // STRICT RULE: For Floor 3, Phase 3 products CANNOT use Mon-Tue
        if (floor.floorName === "Floor 3") {
          // Only assign to Wed-Fri for Phase 3 products
          const deadline = latestCompletion.get(order.id) ?? null;
          const blendMins = blendMinutesById(blendSpeeds, order.blendSpeedId || "fast");
          const dailyCap = dailyCapacityKg(floor, order.blendSpeedId || "fast", blendSpeeds);
          const bSize = batchSizeKg(floor, blendSpeeds);
          const orderType = normalizeType(order.productType);

          // Use Wed-Fri only (exclude Mon-Tue)
          const wednesdayIndex = workingDays.indexOf("Wed");
          const startFrom = wednesdayIndex >= 0 ? wednesdayIndex : 0;

          for (let i = startFrom; i < workingDays.length; i++) {
            if (order.remainingQuantity <= 0) break;
            const day = workingDays[i];
            const cell = { day, dayIndex: i, isNS: false };

            if (isFloorDayBlocked(floor.id, cell.day)) continue;

            const key = cellKey(floor.id, cell.day);
            let availableMin = cellMinutesRemaining.get(key) ?? 0;
            if (availableMin <= 0) continue;

            const existingTypes = cellProductTypes.get(key) ?? new Set();
            const currentIsSavory = isSavoryGroup(order.productType);
            const currentIsSweet = isSweetGroup(order.productType);
            const existingHasSavory = [...existingTypes].some(t => isSavoryGroup(t));
            const existingHasSweet = [...existingTypes].some(t => isSweetGroup(t));

            if ((currentIsSavory && existingHasSweet) || (currentIsSweet && existingHasSavory)) continue;

            const hasOtherType = orderType && [...existingTypes].some(t => t && t !== orderType);
            if (hasOtherType) {
              availableMin -= DEFAULT_SWITCH_MINUTES;
              if (availableMin <= 0) continue;
              switchDays.push({ floorName: floor.floorName, day: cell.day });
            }

            const batches = Math.floor(availableMin / blendMins);
            if (batches <= 0) continue;
            const assignable = Math.min(batches * bSize, order.remainingQuantity, dailyCap);
            if (assignable <= 0) continue;

            placements.push({
              floorId: floor.id,
              productionOrderId: order.id,
              assignedDay: cell.day,
              assignedVolume: Math.round(assignable * 10) / 10,
            });

            const minutesUsed = Math.ceil(assignable / bSize) * blendMins + (hasOtherType ? DEFAULT_SWITCH_MINUTES : 0);
            cellMinutesRemaining.set(key, Math.max(0, (cellMinutesRemaining.get(key) ?? 0) - minutesUsed));
            if (orderType) cellProductTypes.set(key, new Set([...existingTypes, orderType]));
            order.remainingQuantity -= assignable;
          }
        } else {
          // For other floors, use normal assignment
          tryAssignOnFloor(order, floor);
        }
      }
    }

    // Update scheduled/skipped status for all orders in this group
    for (const order of group.orders) {
      if (order.remainingQuantity <= 0) {
        const idx = fullyScheduled.findIndex(p => p.orderId === order.id);
        if (idx < 0) fullyScheduled.push({ orderId: order.id, label: order.productionLabel });
      } else {
        const initialRemaining = eligibleOrders.find(o => o.id === order.id)?.remainingQuantity ?? 0;
        if (order.remainingQuantity < initialRemaining) {
          const idx = partiallyScheduled.findIndex(p => p.orderId === order.id);
          if (idx < 0) {
            partiallyScheduled.push({ orderId: order.id, label: order.productionLabel, leftoverKg: Math.round(order.remainingQuantity) });
          }
        } else {
          const idx = skipped.findIndex(p => p.orderId === order.id);
          if (idx < 0) {
            skipped.push({ orderId: order.id, label: order.productionLabel, reason: "No capacity before delivery date" });
          }
        }
      }
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
      if (!isFloorEligible(floor, order.productType, order.remainingQuantity)) continue;

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
