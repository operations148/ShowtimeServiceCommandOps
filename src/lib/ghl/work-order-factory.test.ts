// work-order-factory.test.ts — regression tests for the swallowed-failure
// defect confirmed by direct code reading earlier this investigation:
// updateWorkOrderStatusByGHLOpportunity and flagEstimateFromGHL both used to
// console.error + return (void) on their primary work_orders UPDATE failure,
// making a genuine database failure indistinguishable from a correct no-op
// to every caller. Both now throw on that specific failure and return the
// work order number (or null for a correct no-op) on success.

import { describe, it, expect, vi, beforeEach } from "vitest";

const findOpenByGhlOpportunityId = vi.hoisted(() => vi.fn());
const findAnyByGhlOpportunityId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/queries/work-orders", () => ({
  findOpenByGhlOpportunityId,
  findAnyByGhlOpportunityId,
  // Not exercised by these tests — present so the module import resolves.
  createWorkOrderFull: vi.fn(),
  findByGhlOpportunityIdAndStage: vi.fn(),
}));

vi.mock("@/lib/db/queries/properties", () => ({
  findPropertyByGhlContactId: vi.fn(),
}));

// Chainable Supabase-shaped fake for the direct db.from("work_orders").update() calls.
function makeDbUpdateChain(result: { error: unknown }) {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => result),
        })),
      })),
      insert: vi.fn(async () => ({ error: null })), // status_history / estimate_handoffs — non-blocking
    })),
  };
}

let dbMock: ReturnType<typeof makeDbUpdateChain>;
vi.mock("@/lib/db/client", () => ({ get db() { return dbMock; } }));

const TENANT_ID = "tenant-a";
const OPP_ID = "synthetic-opp-1";
const WO_FIXTURE = { id: "wo-uuid-1", wo_number: "WO-0042", status: "assigned" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateWorkOrderStatusByGHLOpportunity", () => {
  it("propagates a genuine database failure by throwing, not swallowing it", async () => {
    dbMock = makeDbUpdateChain({ error: { message: "connection reset" } });
    findOpenByGhlOpportunityId.mockResolvedValue(WO_FIXTURE);

    const { updateWorkOrderStatusByGHLOpportunity } = await import("./work-order-factory");

    await expect(
      updateWorkOrderStatusByGHLOpportunity(OPP_ID, "in_progress", "In Progress", TENANT_ID),
    ).rejects.toThrow(/connection reset/);
  });

  it("returns the work order number on success", async () => {
    dbMock = makeDbUpdateChain({ error: null });
    findOpenByGhlOpportunityId.mockResolvedValue(WO_FIXTURE);

    const { updateWorkOrderStatusByGHLOpportunity } = await import("./work-order-factory");
    const result = await updateWorkOrderStatusByGHLOpportunity(OPP_ID, "in_progress", "In Progress", TENANT_ID);

    expect(result).toBe("WO-0042");
  });

  it("returns null (a correct no-op) when no open work order matches — this is NOT a failure", async () => {
    dbMock = makeDbUpdateChain({ error: null });
    findOpenByGhlOpportunityId.mockResolvedValue(undefined);

    const { updateWorkOrderStatusByGHLOpportunity } = await import("./work-order-factory");
    const result = await updateWorkOrderStatusByGHLOpportunity(OPP_ID, "in_progress", "In Progress", TENANT_ID);

    expect(result).toBeNull();
  });
});

describe("flagEstimateFromGHL", () => {
  it("propagates a genuine database failure by throwing, not swallowing it", async () => {
    dbMock = makeDbUpdateChain({ error: { message: "connection reset" } });
    findAnyByGhlOpportunityId.mockResolvedValue(WO_FIXTURE);

    const { flagEstimateFromGHL } = await import("./work-order-factory");

    await expect(flagEstimateFromGHL(OPP_ID, TENANT_ID)).rejects.toThrow(/connection reset/);
  });

  it("returns the work order number on success", async () => {
    dbMock = makeDbUpdateChain({ error: null });
    findAnyByGhlOpportunityId.mockResolvedValue(WO_FIXTURE);

    const { flagEstimateFromGHL } = await import("./work-order-factory");
    const result = await flagEstimateFromGHL(OPP_ID, TENANT_ID);

    expect(result).toBe("WO-0042");
  });

  it("returns null when no work order matches this opportunity", async () => {
    dbMock = makeDbUpdateChain({ error: null });
    findAnyByGhlOpportunityId.mockResolvedValue(undefined);

    const { flagEstimateFromGHL } = await import("./work-order-factory");
    const result = await flagEstimateFromGHL(OPP_ID, TENANT_ID);

    expect(result).toBeNull();
  });
});
