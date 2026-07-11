/**
 * Conflict + capacity detection (Phase 4). Pure functions over UTC instants so
 * they are timezone-agnostic and unit-testable. The dispatch layer feeds these
 * a technician's existing visits/blocked-time for a day and a candidate slot;
 * the results drive non-blocking WARNINGS in the UI (double-booking is allowed
 * with a warning — some crews intentionally stack jobs — never a hard error).
 */

export interface TimeSpan {
  id: string;
  startUtc: string;
  endUtc: string;
}

/** Half-open overlap test: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅. */
export function spansOverlap(a: TimeSpan, b: TimeSpan): boolean {
  const aStart = new Date(a.startUtc).getTime();
  const aEnd = new Date(a.endUtc).getTime();
  const bStart = new Date(b.startUtc).getTime();
  const bEnd = new Date(b.endUtc).getTime();
  return aStart < bEnd && bStart < aEnd;
}

export interface ConflictReport {
  hasConflict: boolean;
  /** Overlapping visits (excluding the candidate itself, by id). */
  overlappingVisitIds: string[];
  /** Overlapping blocked-time windows. */
  overlappingBlockedIds: string[];
  /** True when the candidate falls (partly) outside the tech's availability. */
  outsideAvailability: boolean;
}

export interface DetectConflictsInput {
  candidate: TimeSpan;
  existingVisits: TimeSpan[];
  blockedTime: TimeSpan[];
  /** When provided, the candidate is checked against these availability windows (same day, UTC). */
  availabilityWindows?: TimeSpan[];
}

export function detectConflicts(input: DetectConflictsInput): ConflictReport {
  const overlappingVisitIds = input.existingVisits
    .filter((v) => v.id !== input.candidate.id && spansOverlap(input.candidate, v))
    .map((v) => v.id);

  const overlappingBlockedIds = input.blockedTime
    .filter((b) => spansOverlap(input.candidate, b))
    .map((b) => b.id);

  let outsideAvailability = false;
  if (input.availabilityWindows && input.availabilityWindows.length > 0) {
    // Candidate must be fully contained in at least one availability window.
    const cStart = new Date(input.candidate.startUtc).getTime();
    const cEnd = new Date(input.candidate.endUtc).getTime();
    outsideAvailability = !input.availabilityWindows.some((w) => {
      const wStart = new Date(w.startUtc).getTime();
      const wEnd = new Date(w.endUtc).getTime();
      return wStart <= cStart && cEnd <= wEnd;
    });
  }

  return {
    hasConflict: overlappingVisitIds.length > 0 || overlappingBlockedIds.length > 0,
    overlappingVisitIds,
    overlappingBlockedIds,
    outsideAvailability,
  };
}

export interface CapacityInput {
  /** Sum of scheduled minutes (duration + travel buffer) for the tech that day. */
  scheduledMinutes: number;
  /** Available working minutes for the tech that day (from availability, or a default). */
  capacityMinutes: number;
}

export type CapacityLevel = "open" | "tight" | "full" | "over";

export interface CapacityIndicator {
  level: CapacityLevel;
  utilization: number; // 0..>1
  scheduledMinutes: number;
  capacityMinutes: number;
}

/** Coarse capacity indicator for the day column header. */
export function capacityIndicator(input: CapacityInput): CapacityIndicator {
  const capacity = Math.max(0, input.capacityMinutes);
  const utilization = capacity === 0 ? (input.scheduledMinutes > 0 ? Infinity : 0) : input.scheduledMinutes / capacity;
  let level: CapacityLevel;
  if (utilization > 1) level = "over";
  else if (utilization >= 0.9) level = "full";
  else if (utilization >= 0.65) level = "tight";
  else level = "open";
  return { level, utilization, scheduledMinutes: input.scheduledMinutes, capacityMinutes: capacity };
}
