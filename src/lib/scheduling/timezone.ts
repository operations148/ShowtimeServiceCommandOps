/**
 * Tenant-timezone helpers (Phase 4, ADR-0009).
 *
 * Rules:
 *   - Instants are stored in UTC (TIMESTAMPTZ / ISO strings).
 *   - Wall times (what the customer/dispatcher sees: "9:00 AM on the 15th")
 *     are tenant-local, converted at the edge with these helpers.
 *   - Plain calendar dates (visits.scheduled_date, recurrence dates) are
 *     tenant-local date STRINGS ("YYYY-MM-DD") and are manipulated with pure
 *     string/UTC arithmetic — never `new Date(str)` in server-local time.
 *
 * Implementation uses only the Intl API (no dependency). DST-safe: conversion
 * iteratively refines a UTC guess until its tenant-local rendering matches the
 * requested wall time. For nonexistent wall times (spring-forward gap, e.g.
 * 02:30 on the DST-start day) it converges to the closest valid instant.
 */

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

interface WallParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Renders a UTC instant as tenant-local wall-clock parts. */
export function instantToWallParts(instant: Date, timeZone: string): WallParts {
  const parts = getFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function parseDate(dateStr: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new RangeError(`Invalid date string: ${dateStr}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function parseTime(timeStr: string): { hh: number; mm: number } {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(timeStr);
  if (!m) throw new RangeError(`Invalid time string: ${timeStr}`);
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

/**
 * Tenant-local wall time → UTC instant (ISO string).
 * wallTimeToUtc("2026-07-15", "09:00", "America/Los_Angeles") === "2026-07-15T16:00:00.000Z"
 */
export function wallTimeToUtc(dateStr: string, timeStr: string, timeZone: string): string {
  const { y, m, d } = parseDate(dateStr);
  const { hh, mm } = parseTime(timeStr);
  const desired = Date.UTC(y, m - 1, d, hh, mm);

  // Refine: adjust the guess by the difference between how it renders in the
  // target tz and the desired wall time. Two passes settle everything except
  // the spring-forward gap; the third pass stabilizes that edge.
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const wall = instantToWallParts(new Date(guess), timeZone);
    const rendered = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    const diff = desired - rendered;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess).toISOString();
}

/** UTC instant → tenant-local { date: "YYYY-MM-DD", time: "HH:MM" }. */
export function utcToWall(instantIso: string, timeZone: string): { date: string; time: string } {
  const p = instantToWallParts(new Date(instantIso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/**
 * The UTC interval covering one tenant-local calendar day (for all-day work
 * and range queries). endUtc is EXCLUSIVE (start of the next local day), so a
 * DST-transition day correctly spans 23 or 25 real hours.
 */
export function localDayRange(dateStr: string, timeZone: string): { startUtc: string; endUtc: string } {
  return {
    startUtc: wallTimeToUtc(dateStr, "00:00", timeZone),
    endUtc: wallTimeToUtc(addDaysToDateStr(dateStr, 1), "00:00", timeZone),
  };
}

/** Pure calendar arithmetic on date strings — immune to server timezone. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const { y, m, d } = parseDate(dateStr);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Day of week (0=Sunday) of a calendar date string — timezone-independent. */
export function dayOfWeekOfDateStr(dateStr: string): number {
  const { y, m, d } = parseDate(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole-day difference between two date strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  const ms = Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d);
  return Math.round(ms / 86_400_000);
}

/** Today's calendar date in the tenant's timezone. */
export function localToday(timeZone: string, now = new Date()): string {
  const p = instantToWallParts(now, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Compares "HH:MM"-style times; also accepts "HH:MM:SS". */
export function compareTimeStr(a: string, b: string): number {
  const ta = parseTime(a);
  const tb = parseTime(b);
  return ta.hh * 60 + ta.mm - (tb.hh * 60 + tb.mm);
}
