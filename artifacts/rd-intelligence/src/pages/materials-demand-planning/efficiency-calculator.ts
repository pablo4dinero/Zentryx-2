// Capacity constants (kg per shift)
const FLOOR_CAPACITY = {
  1: { fast: 20900, medium: 12000, slow: 7500 },
  2: { fast: 400, medium: 400, slow: 400 },
  3: { fast: 7000, medium: 7000, slow: 7000 },
};

const SHIFT_HOURS = {
  day: 7.5,
  night: 6.5,
  saturday: 6.5,
};

export interface FloorAssignment {
  id: number;
  floorId: number;
  day: string;
  shiftType: "day" | "night" | "saturday";
  assignedVolume: number;
  order: {
    id: number;
    blendSpeedId?: string;
  };
  isWeekend?: boolean;
}

export interface ProductionFloor {
  id: number;
  name: string;
}

export function calculateEfficiency(
  assignments: FloorAssignment[],
  floors: Record<number, { name: string }>,
): { score: number; breakdown: Record<string, number> } {
  if (!assignments.length) return { score: 0, breakdown: {} };

  const breakdown: Record<number, { planned: number; capacity: number }> = {};

  // Initialize floor totals
  for (const floorId of Object.keys(floors)) {
    breakdown[parseInt(floorId)] = { planned: 0, capacity: 0 };
  }

  // Group assignments by floor
  const byFloor = assignments.reduce((acc: Record<number, FloorAssignment[]>, a) => {
    if (!acc[a.floorId]) acc[a.floorId] = [];
    acc[a.floorId].push(a);
    return acc;
  }, {});

  // Calculate capacity and planned for each floor
  for (const [floorId, floorAssignments] of Object.entries(byFloor)) {
    const fid = parseInt(floorId);
    if (!breakdown[fid]) continue;

    const dayAssignments = floorAssignments.filter(a => a.shiftType === "day");
    const nightAssignments = floorAssignments.filter(a => a.shiftType === "night");
    const saturdayAssignments = floorAssignments.filter(a => a.shiftType === "saturday");

    // Sum planned volumes
    breakdown[fid].planned = floorAssignments.reduce((sum, a) => sum + (a.assignedVolume || 0), 0);

    // Calculate theoretical capacity (simplified: assume medium speed, count shifts)
    const daysWithAssignments = new Set(floorAssignments.map(a => a.day)).size;
    const floorCap = FLOOR_CAPACITY[fid as keyof typeof FLOOR_CAPACITY];
    const baseDayCapacity = floorCap?.medium || 0;
    const baseNightCapacity = (baseDayCapacity / SHIFT_HOURS.day) * SHIFT_HOURS.night;
    const baseSaturdayCapacity = (baseDayCapacity / SHIFT_HOURS.day) * SHIFT_HOURS.saturday;

    const dayCapacity = dayAssignments.length > 0 ? baseDayCapacity : 0;
    const nightCapacity = nightAssignments.length > 0 ? baseNightCapacity : 0;
    const satCapacity = saturdayAssignments.length > 0 ? baseSaturdayCapacity : 0;

    breakdown[fid].capacity = dayCapacity + nightCapacity + satCapacity;
  }

  // Calculate overall efficiency
  const totalPlanned = Object.values(breakdown).reduce((sum, b) => sum + b.planned, 0);
  const totalCapacity = Object.values(breakdown).reduce((sum, b) => sum + b.capacity, 0);
  const score = totalCapacity > 0 ? Math.round((totalPlanned / totalCapacity) * 100) : 0;

  const breakdownOutput: Record<string, number> = {};
  for (const [floorId, data] of Object.entries(breakdown)) {
    const fid = parseInt(floorId);
    const floorName = floors[fid]?.name || `Floor ${fid}`;
    const floorScore = data.capacity > 0 ? Math.round((data.planned / data.capacity) * 100) : 0;
    breakdownOutput[floorName] = floorScore;
  }

  return { score: Math.min(100, score), breakdown: breakdownOutput };
}

export function getEfficiencyColor(score: number): string {
  if (score >= 90) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600";
  if (score >= 75) return "bg-blue-500/10 border-blue-500/20 text-blue-600";
  if (score >= 60) return "bg-yellow-500/10 border-yellow-500/20 text-yellow-600";
  return "bg-orange-500/10 border-orange-500/20 text-orange-600";
}

export function getEfficiencyLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs Improvement";
}
