import { addDaysToDateStr, dayOfWeekOfDateStr, daysBetween } from "./timezone";

/**
 * Pure recurrence expansion (Phase 4). Given a recurrence blueprint and a
 * window, returns the tenant-local occurrence dates ("YYYY-MM-DD"), excluding
 * paused schedules and exception dates. All arithmetic is on date strings so
 * results are timezone-independent (see ADR-0009) — the cron converts these to
 * UTC instants at write time.
 *
 * Determinism: the same blueprint + window + exceptions always yields the same
 * dates, so generation is idempotent by occurrence date (enforced downstream by
 * the UNIQUE(recurring_schedule_id, scheduled_date) index).
 */

export type Frequency = "weekly" | "biweekly" | "monthly";

export interface RecurrenceBlueprint {
  frequency: Frequency;
  /** 0=Sunday..6=Saturday — used by weekly/biweekly. */
  dayOfWeek: number;
  /** Anchor date; also supplies the day-of-month for monthly. */
  startsOn: string; // YYYY-MM-DD
  endsOn?: string | null; // inclusive; YYYY-MM-DD
  /** When set, the schedule is paused and expands to zero occurrences. */
  pausedAt?: string | null;
}

export interface ExpandOptions {
  /** Inclusive window start (tenant-local date). */
  windowStart: string;
  /** Inclusive window end (tenant-local date). */
  windowEnd: string;
  /** Occurrence dates to skip (exceptions). */
  exceptions?: string[];
}

/** First on-or-after `from` date whose day-of-week === dow. */
function alignToDow(from: string, dow: number): string {
  const delta = (dow - dayOfWeekOfDateStr(from) + 7) % 7;
  return addDaysToDateStr(from, delta);
}

export function expandRecurrence(blueprint: RecurrenceBlueprint, opts: ExpandOptions): string[] {
  if (blueprint.pausedAt) return [];

  const exceptions = new Set(opts.exceptions ?? []);
  const hardEnd = blueprint.endsOn && blueprint.endsOn < opts.windowEnd ? blueprint.endsOn : opts.windowEnd;
  const effectiveStart = blueprint.startsOn > opts.windowStart ? blueprint.startsOn : opts.windowStart;
  if (effectiveStart > hardEnd) return [];

  const dates: string[] = [];

  if (blueprint.frequency === "monthly") {
    // Same day-of-month as startsOn each month (clamped to the month length).
    const dom = Number(blueprint.startsOn.slice(8, 10));
    let cursorMonth = effectiveStart.slice(0, 7); // YYYY-MM
    // Walk months until past the window.
    for (let guard = 0; guard < 480; guard++) {
      const [y, m] = cursorMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = Math.min(dom, lastDay);
      const candidate = `${cursorMonth}-${String(day).padStart(2, "0")}`;
      if (candidate > hardEnd) break;
      if (candidate >= effectiveStart && candidate >= blueprint.startsOn && !exceptions.has(candidate)) {
        dates.push(candidate);
      }
      // advance one month
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      cursorMonth = `${nextY}-${String(nextM).padStart(2, "0")}`;
    }
    return dates;
  }

  // weekly / biweekly
  const step = blueprint.frequency === "biweekly" ? 14 : 7;
  // Anchor parity for biweekly is measured from the blueprint's first aligned
  // occurrence, so the phase is stable regardless of the query window.
  const anchor = alignToDow(blueprint.startsOn, blueprint.dayOfWeek);
  let cursor = alignToDow(effectiveStart, blueprint.dayOfWeek);

  if (blueprint.frequency === "biweekly") {
    const weeksFromAnchor = Math.round(daysBetween(anchor, cursor) / 7);
    if (weeksFromAnchor % 2 !== 0) cursor = addDaysToDateStr(cursor, 7);
  }

  for (let guard = 0; guard < 1000 && cursor <= hardEnd; guard++) {
    if (cursor >= effectiveStart && cursor >= blueprint.startsOn && !exceptions.has(cursor)) {
      dates.push(cursor);
    }
    cursor = addDaysToDateStr(cursor, step);
  }
  return dates;
}
