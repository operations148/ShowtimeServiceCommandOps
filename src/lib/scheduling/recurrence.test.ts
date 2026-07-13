import { describe, it, expect } from "vitest";
import { expandRecurrence, type RecurrenceBlueprint } from "./recurrence";

describe("expandRecurrence — weekly", () => {
  const weekly: RecurrenceBlueprint = { frequency: "weekly", dayOfWeek: 3, startsOn: "2026-07-01" }; // Wed

  it("emits every Wednesday in the window", () => {
    const dates = expandRecurrence(weekly, { windowStart: "2026-07-01", windowEnd: "2026-07-31" });
    expect(dates).toEqual(["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"]);
  });

  it("clamps to the window start (does not emit before it)", () => {
    const dates = expandRecurrence(weekly, { windowStart: "2026-07-10", windowEnd: "2026-07-20" });
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("respects endsOn", () => {
    const bounded = { ...weekly, endsOn: "2026-07-15" };
    const dates = expandRecurrence(bounded, { windowStart: "2026-07-01", windowEnd: "2026-07-31" });
    expect(dates).toEqual(["2026-07-01", "2026-07-08", "2026-07-15"]);
  });

  it("spans a DST boundary without drift (still every 7 days)", () => {
    const dst: RecurrenceBlueprint = { frequency: "weekly", dayOfWeek: 0, startsOn: "2026-03-01" }; // Sundays
    const dates = expandRecurrence(dst, { windowStart: "2026-03-01", windowEnd: "2026-03-29" });
    // Mar 8 is spring-forward; the sequence is unaffected because dates are calendar-based
    expect(dates).toEqual(["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29"]);
  });
});

describe("expandRecurrence — biweekly", () => {
  const biweekly: RecurrenceBlueprint = { frequency: "biweekly", dayOfWeek: 3, startsOn: "2026-07-01" };

  it("emits every other Wednesday anchored on startsOn", () => {
    const dates = expandRecurrence(biweekly, { windowStart: "2026-07-01", windowEnd: "2026-08-31" });
    expect(dates).toEqual(["2026-07-01", "2026-07-15", "2026-07-29", "2026-08-12", "2026-08-26"]);
  });

  it("keeps the same parity when the window starts mid-stream", () => {
    // Querying only August must still land on the 12th/26th, not the 5th/19th.
    const dates = expandRecurrence(biweekly, { windowStart: "2026-08-01", windowEnd: "2026-08-31" });
    expect(dates).toEqual(["2026-08-12", "2026-08-26"]);
  });
});

describe("expandRecurrence — monthly", () => {
  it("emits the same day-of-month each month", () => {
    const monthly: RecurrenceBlueprint = { frequency: "monthly", dayOfWeek: 0, startsOn: "2026-01-15" };
    const dates = expandRecurrence(monthly, { windowStart: "2026-01-01", windowEnd: "2026-04-30" });
    expect(dates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("clamps day-of-month to shorter months", () => {
    const monthly: RecurrenceBlueprint = { frequency: "monthly", dayOfWeek: 0, startsOn: "2026-01-31" };
    const dates = expandRecurrence(monthly, { windowStart: "2026-01-01", windowEnd: "2026-03-31" });
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

describe("expandRecurrence — pause & exceptions (duplicate/skip prevention)", () => {
  const weekly: RecurrenceBlueprint = { frequency: "weekly", dayOfWeek: 3, startsOn: "2026-07-01" };

  it("a paused schedule expands to nothing", () => {
    const paused = { ...weekly, pausedAt: "2026-07-05T00:00:00Z" };
    expect(expandRecurrence(paused, { windowStart: "2026-07-01", windowEnd: "2026-07-31" })).toEqual([]);
  });

  it("exception dates are skipped", () => {
    const dates = expandRecurrence(weekly, {
      windowStart: "2026-07-01",
      windowEnd: "2026-07-31",
      exceptions: ["2026-07-15", "2026-07-29"],
    });
    expect(dates).toEqual(["2026-07-01", "2026-07-08", "2026-07-22"]);
  });

  it("is deterministic — same inputs yield identical output (idempotent generation)", () => {
    const opts = { windowStart: "2026-07-01", windowEnd: "2026-09-30" };
    expect(expandRecurrence(weekly, opts)).toEqual(expandRecurrence(weekly, opts));
  });

  it("never emits before startsOn even if the window opens earlier", () => {
    const future = { ...weekly, startsOn: "2026-07-22" };
    const dates = expandRecurrence(future, { windowStart: "2026-07-01", windowEnd: "2026-07-31" });
    expect(dates).toEqual(["2026-07-22", "2026-07-29"]);
  });
});
