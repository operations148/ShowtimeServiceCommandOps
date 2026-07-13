import { describe, it, expect } from "vitest";
import {
  wallTimeToUtc,
  utcToWall,
  localDayRange,
  addDaysToDateStr,
  dayOfWeekOfDateStr,
  daysBetween,
  localToday,
  compareTimeStr,
} from "./timezone";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

describe("wallTimeToUtc", () => {
  it("converts a summer (PDT, UTC-7) wall time to UTC", () => {
    // 2026-07-15 09:00 PDT → 16:00 UTC
    expect(wallTimeToUtc("2026-07-15", "09:00", LA)).toBe("2026-07-15T16:00:00.000Z");
  });

  it("converts a winter (PST, UTC-8) wall time to UTC", () => {
    // 2026-01-15 09:00 PST → 17:00 UTC
    expect(wallTimeToUtc("2026-01-15", "09:00", LA)).toBe("2026-01-15T17:00:00.000Z");
  });

  it("handles a different timezone (Eastern)", () => {
    // 2026-07-15 09:00 EDT (UTC-4) → 13:00 UTC
    expect(wallTimeToUtc("2026-07-15", "09:00", NY)).toBe("2026-07-15T13:00:00.000Z");
  });

  it("round-trips through utcToWall", () => {
    const utc = wallTimeToUtc("2026-03-10", "14:30", LA);
    expect(utcToWall(utc, LA)).toEqual({ date: "2026-03-10", time: "14:30" });
  });
});

describe("DST transitions", () => {
  // US DST 2026: spring forward Sun Mar 8 02:00→03:00; fall back Sun Nov 1 02:00→01:00.
  it("the day before spring-forward is a normal 24h day, offset UTC-8", () => {
    expect(wallTimeToUtc("2026-03-07", "12:00", LA)).toBe("2026-03-07T20:00:00.000Z");
  });

  it("after spring-forward the offset is UTC-7", () => {
    // 2026-03-09 12:00 PDT → 19:00 UTC (an hour earlier in UTC than the PST day)
    expect(wallTimeToUtc("2026-03-09", "12:00", LA)).toBe("2026-03-09T19:00:00.000Z");
  });

  it("spring-forward local day spans only 23 real hours", () => {
    const { startUtc, endUtc } = localDayRange("2026-03-08", LA);
    const hours = (new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("fall-back local day spans 25 real hours", () => {
    const { startUtc, endUtc } = localDayRange("2026-11-01", LA);
    const hours = (new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });

  it("a nonexistent spring-forward wall time converges to a valid instant", () => {
    // 02:30 on 2026-03-08 does not exist in LA; conversion must not throw and
    // must yield an instant that renders to a real local time.
    const utc = wallTimeToUtc("2026-03-08", "02:30", LA);
    expect(() => new Date(utc).toISOString()).not.toThrow();
    const wall = utcToWall(utc, LA);
    expect(wall.date).toBe("2026-03-08");
  });
});

describe("all-day / cross-midnight day ranges", () => {
  it("localDayRange covers a full local calendar day in UTC", () => {
    // 2026-07-15 in LA (PDT, UTC-7): 00:00 local = 07:00 UTC; next day 00:00 = 07:00 UTC
    expect(localDayRange("2026-07-15", LA)).toEqual({
      startUtc: "2026-07-15T07:00:00.000Z",
      endUtc: "2026-07-16T07:00:00.000Z",
    });
  });

  it("a late-night local instant maps to the correct local date (cross-midnight in UTC)", () => {
    // 2026-07-15 23:30 PDT = 2026-07-16 06:30 UTC, but the LOCAL date is still the 15th
    const utc = wallTimeToUtc("2026-07-15", "23:30", LA);
    expect(utc).toBe("2026-07-16T06:30:00.000Z");
    expect(utcToWall(utc, LA).date).toBe("2026-07-15");
  });
});

describe("calendar-date arithmetic (timezone-independent)", () => {
  it("addDaysToDateStr crosses month/year boundaries", () => {
    expect(addDaysToDateStr("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToDateStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateStr("2026-03-08", 7)).toBe("2026-03-15"); // spans DST, still +7 days
  });

  it("addDaysToDateStr handles leap day", () => {
    expect(addDaysToDateStr("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("dayOfWeekOfDateStr is correct and tz-independent", () => {
    expect(dayOfWeekOfDateStr("2026-07-15")).toBe(3); // Wednesday
    expect(dayOfWeekOfDateStr("2026-07-12")).toBe(0); // Sunday
  });

  it("daysBetween counts whole days", () => {
    expect(daysBetween("2026-07-01", "2026-07-15")).toBe(14);
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("localToday", () => {
  it("returns the tenant-local date for an instant near midnight", () => {
    // 2026-07-16 05:00 UTC = 2026-07-15 22:00 PDT → local date is the 15th
    expect(localToday(LA, new Date("2026-07-16T05:00:00Z"))).toBe("2026-07-15");
  });
});

describe("compareTimeStr", () => {
  it("orders wall times and tolerates seconds", () => {
    expect(compareTimeStr("09:00", "17:00")).toBeLessThan(0);
    expect(compareTimeStr("17:00:00", "09:00")).toBeGreaterThan(0);
    expect(compareTimeStr("12:30", "12:30")).toBe(0);
  });
});
