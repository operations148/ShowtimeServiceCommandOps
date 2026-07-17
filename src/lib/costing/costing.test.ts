import { describe, it, expect } from "vitest";
import {
  computeLaborCost,
  computeMileageCost,
  computeBillableAmount,
  minutesBetween,
  resolveHourlyCostCents,
  rollupJobCost,
  summarizeJobCost,
  assertMinutes,
  assertMiles,
  type CostEntries,
} from "./costing";

const empty: CostEntries = { time: [], mileage: [], expenses: [] };

describe("computeLaborCost", () => {
  it("prices a whole hour", () => {
    expect(computeLaborCost(60, 5000)).toBe(5000); // 1h @ $50 = $50
  });

  it("prices a half hour", () => {
    expect(computeLaborCost(30, 5000)).toBe(2500);
  });

  it("rounds exactly once, half-up (7 min @ $50/hr = 583.33c -> 583)", () => {
    expect(computeLaborCost(7, 5000)).toBe(583);
  });

  it("rounds .5 up (1 min @ $0.30/hr = 0.5c -> 1)", () => {
    expect(computeLaborCost(1, 30)).toBe(1);
  });

  it("handles a full day", () => {
    expect(computeLaborCost(1440, 5000)).toBe(120000); // 24h @ $50
  });

  it("a zero rate costs zero (but is why the tenant fallback exists)", () => {
    expect(computeLaborCost(60, 0)).toBe(0);
  });

  it("rejects invalid minutes", () => {
    expect(() => computeLaborCost(0, 5000)).toThrow(RangeError);
    expect(() => computeLaborCost(-5, 5000)).toThrow(RangeError);
    expect(() => computeLaborCost(1441, 5000)).toThrow(RangeError);
    expect(() => computeLaborCost(1.5, 5000)).toThrow(RangeError);
  });

  it("rejects a non-integer or negative rate", () => {
    expect(() => computeLaborCost(60, -1)).toThrow(RangeError);
    expect(() => computeLaborCost(60, 50.5)).toThrow(RangeError);
  });
});

describe("minutesBetween", () => {
  it("computes elapsed minutes", () => {
    expect(minutesBetween("2026-07-17T10:00:00Z", "2026-07-17T11:30:00Z")).toBe(90);
  });

  it("rounds to the nearest minute", () => {
    expect(minutesBetween("2026-07-17T10:00:00Z", "2026-07-17T10:00:40Z")).toBe(1);
  });

  it("rejects a non-positive range", () => {
    expect(() => minutesBetween("2026-07-17T11:00:00Z", "2026-07-17T10:00:00Z")).toThrow(RangeError);
    expect(() => minutesBetween("2026-07-17T10:00:00Z", "2026-07-17T10:00:00Z")).toThrow(RangeError);
  });

  it("rejects invalid timestamps", () => {
    expect(() => minutesBetween("nonsense", "2026-07-17T10:00:00Z")).toThrow(RangeError);
  });

  it("rejects a range longer than a day (would exceed the per-entry cap)", () => {
    expect(() => minutesBetween("2026-07-17T00:00:00Z", "2026-07-18T00:01:00Z")).toThrow(RangeError);
  });
});

describe("resolveHourlyCostCents", () => {
  it("prefers the technician's own rate", () => {
    expect(resolveHourlyCostCents(6000, 4000)).toBe(6000);
  });

  it("falls back to the tenant default when the tech has no rate", () => {
    expect(resolveHourlyCostCents(0, 4000)).toBe(4000);
    expect(resolveHourlyCostCents(null, 4000)).toBe(4000);
    expect(resolveHourlyCostCents(undefined, 4000)).toBe(4000);
  });

  it("yields 0 only when neither is configured", () => {
    expect(resolveHourlyCostCents(null, 0)).toBe(0);
  });
});

describe("computeMileageCost", () => {
  it("prices whole miles", () => {
    expect(computeMileageCost(10, 67)).toBe(670); // 10 mi @ 67c
  });

  it("prices fractional miles, rounding once", () => {
    expect(computeMileageCost(12.4, 67)).toBe(831); // 830.8 -> 831
  });

  it("rejects out-of-range miles", () => {
    expect(() => computeMileageCost(0, 67)).toThrow(RangeError);
    expect(() => computeMileageCost(-1, 67)).toThrow(RangeError);
    expect(() => computeMileageCost(2001, 67)).toThrow(RangeError);
  });
});

describe("computeBillableAmount", () => {
  it("bills nothing when not billable (it still costs us)", () => {
    expect(computeBillableAmount(10000, false, 35)).toBe(0);
  });

  it("applies markup when billable", () => {
    expect(computeBillableAmount(10000, true, 35)).toBe(13500);
  });

  it("bills at cost with zero markup", () => {
    expect(computeBillableAmount(10000, true, 0)).toBe(10000);
  });
});

describe("rollupJobCost", () => {
  it("is zero for no entries", () => {
    expect(rollupJobCost(empty)).toEqual({
      labor_cents: 0, mileage_cents: 0, expense_cents: 0, total_cost_cents: 0,
    });
  });

  it("sums labor + mileage + expense COST (not billable amount)", () => {
    const entries: CostEntries = {
      time: [{ minutes: 60, cost_cents: 5000 }, { minutes: 30, cost_cents: 2500 }],
      mileage: [{ miles: 10, cost_cents: 670 }],
      expenses: [{ amount_cents: 4000, billable_amount_cents: 5400 }],
    };
    expect(rollupJobCost(entries)).toEqual({
      labor_cents: 7500,
      mileage_cents: 670,
      expense_cents: 4000,        // cost, NOT the 5400 billable
      total_cost_cents: 12170,
    });
  });
});

describe("summarizeJobCost", () => {
  it("derives margin from contract minus cost", () => {
    const entries: CostEntries = {
      time: [{ minutes: 120, cost_cents: 10000 }],
      mileage: [{ miles: 10, cost_cents: 670 }],
      expenses: [{ amount_cents: 4000, billable_amount_cents: 5400 }],
    };
    const s = summarizeJobCost("wo-1", 50000, entries);
    expect(s.total_cost_cents).toBe(14670);
    expect(s.margin_cents).toBe(35330);
    expect(s.margin_percent).toBeCloseTo(0.7066, 4);
    expect(s.billable_expense_cents).toBe(5400);
    expect(s.entry_counts).toEqual({ time: 1, mileage: 1, expense: 1 });
  });

  it("reports a NEGATIVE margin when the job cost more than the contract", () => {
    const entries: CostEntries = {
      time: [{ minutes: 600, cost_cents: 50000 }],
      mileage: [], expenses: [],
    };
    const s = summarizeJobCost("wo-1", 30000, entries);
    expect(s.margin_cents).toBe(-20000);
    expect(s.margin_percent).toBeCloseTo(-0.6667, 4);
  });

  it("margin_percent is NULL (not 0) with no contract value — undefined, not break-even", () => {
    const entries: CostEntries = { time: [{ minutes: 60, cost_cents: 5000 }], mileage: [], expenses: [] };
    const s = summarizeJobCost("wo-1", 0, entries);
    expect(s.margin_percent).toBeNull();
    expect(s.margin_cents).toBe(-5000);
  });

  it("a real 0% margin is 0, distinct from null", () => {
    const entries: CostEntries = { time: [{ minutes: 60, cost_cents: 5000 }], mileage: [], expenses: [] };
    const s = summarizeJobCost("wo-1", 5000, entries);
    expect(s.margin_percent).toBe(0);
    expect(s.margin_cents).toBe(0);
  });

  it("totals minutes and miles without float drift", () => {
    const entries: CostEntries = {
      time: [{ minutes: 45, cost_cents: 100 }, { minutes: 75, cost_cents: 100 }],
      mileage: [{ miles: 0.1, cost_cents: 7 }, { miles: 0.2, cost_cents: 13 }],
      expenses: [],
    };
    const s = summarizeJobCost("wo-1", 0, entries);
    expect(s.total_minutes).toBe(120);
    expect(s.total_miles).toBe(0.3); // not 0.30000000000000004
  });
});

describe("guards", () => {
  it("assertMinutes / assertMiles mirror the DB CHECK bounds", () => {
    expect(assertMinutes(1440)).toBe(1440);
    expect(() => assertMinutes(1441)).toThrow(RangeError);
    expect(assertMiles(2000)).toBe(2000);
    expect(() => assertMiles(2001)).toThrow(RangeError);
  });
});
