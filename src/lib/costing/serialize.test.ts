import { describe, it, expect } from "vitest";
import {
  toTechTimeEntry, toTechMileageEntry, toTechJobExpense,
  serializeTimeEntries, serializeMileageEntries, serializeJobExpenses,
} from "./serialize";
import type { TimeEntry, MileageEntry, JobExpense } from "@/types/costing";

const time: TimeEntry = {
  id: "t1", tenant_id: "ten1", work_order_id: "wo1", visit_id: "v1", technician_id: "tech1",
  minutes: 90, started_at: null, ended_at: null,
  hourly_cost_cents: 6000, cost_cents: 9000,
  notes: "replaced seal", created_by: "u1",
  created_at: "2026-07-17T10:00:00Z", updated_at: "2026-07-17T10:00:00Z",
};

const mileage: MileageEntry = {
  id: "m1", tenant_id: "ten1", work_order_id: "wo1", visit_id: "v1", technician_id: "tech1",
  miles: 12.4, rate_cents_per_mile: 67, cost_cents: 831,
  notes: null, created_by: "u1",
  created_at: "2026-07-17T10:00:00Z", updated_at: "2026-07-17T10:00:00Z",
};

const expense: JobExpense = {
  id: "e1", tenant_id: "ten1", work_order_id: "wo1", visit_id: null,
  category: "part", description: "Pump seal", vendor: "PoolCo",
  amount_cents: 4000, billable: true, markup_percent: 35, billable_amount_cents: 5400,
  receipt_path: "ten1/wo1/receipt.jpg", incurred_on: "2026-07-17",
  created_by: "u1", created_at: "2026-07-17T10:00:00Z", updated_at: "2026-07-17T10:00:00Z",
};

// The whole point of Phase 9's redaction: these keys must be UNREACHABLE for a
// technician, not merely hidden by the UI.
const MONEY_KEYS = [
  "hourly_cost_cents", "cost_cents", "rate_cents_per_mile",
  "amount_cents", "markup_percent", "billable_amount_cents", "billable",
];

function assertNoMoney(obj: object) {
  for (const key of MONEY_KEYS) {
    expect(obj).not.toHaveProperty(key);
  }
  // Belt and braces: no value in the object should equal a known cost figure.
  const values = JSON.stringify(obj);
  expect(values).not.toContain("6000");
  expect(values).not.toContain("9000");
  expect(values).not.toContain("831");
  expect(values).not.toContain("5400");
}

describe("technician time-entry redaction", () => {
  it("strips the rate and the cost", () => {
    const tech = toTechTimeEntry(time);
    assertNoMoney(tech);
  });

  it("keeps the fields a technician legitimately needs", () => {
    const tech = toTechTimeEntry(time);
    expect(tech).toMatchObject({
      id: "t1", work_order_id: "wo1", visit_id: "v1", technician_id: "tech1",
      minutes: 90, notes: "replaced seal",
    });
  });

  it("does not leak tenant_id or created_by either", () => {
    const tech = toTechTimeEntry(time);
    expect(tech).not.toHaveProperty("tenant_id");
    expect(tech).not.toHaveProperty("created_by");
  });
});

describe("technician mileage redaction", () => {
  it("strips the rate and the cost but keeps the miles", () => {
    const tech = toTechMileageEntry(mileage);
    assertNoMoney(tech);
    expect(tech.miles).toBe(12.4);
  });
});

describe("technician expense redaction", () => {
  it("strips amount, markup, billable flag and billable amount", () => {
    const tech = toTechJobExpense(expense);
    assertNoMoney(tech);
  });

  it("keeps what a tech needs to recognise the expense", () => {
    const tech = toTechJobExpense(expense);
    expect(tech).toMatchObject({
      category: "part", description: "Pump seal", vendor: "PoolCo",
      receipt_path: "ten1/wo1/receipt.jpg", incurred_on: "2026-07-17",
    });
  });
});

describe("serializeX dispatch on canViewJobCosting", () => {
  it("returns full rows WITH money for a cost-viewer", () => {
    const [t] = serializeTimeEntries([time], true) as TimeEntry[];
    expect(t.cost_cents).toBe(9000);
    expect(t.hourly_cost_cents).toBe(6000);

    const [m] = serializeMileageEntries([mileage], true) as MileageEntry[];
    expect(m.cost_cents).toBe(831);

    const [e] = serializeJobExpenses([expense], true) as JobExpense[];
    expect(e.amount_cents).toBe(4000);
    expect(e.billable_amount_cents).toBe(5400);
  });

  it("returns redacted rows for a non-viewer (the technician path)", () => {
    assertNoMoney(serializeTimeEntries([time], false)[0]);
    assertNoMoney(serializeMileageEntries([mileage], false)[0]);
    assertNoMoney(serializeJobExpenses([expense], false)[0]);
  });

  it("handles empty lists", () => {
    expect(serializeTimeEntries([], false)).toEqual([]);
    expect(serializeMileageEntries([], true)).toEqual([]);
    expect(serializeJobExpenses([], false)).toEqual([]);
  });
});
