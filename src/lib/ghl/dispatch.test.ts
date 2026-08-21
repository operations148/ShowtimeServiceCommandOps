import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeGHLPayload } from "./normalize-payload";
import { ledgerStatusFor, httpStatusFor } from "./webhook-outcome";

// ── Mocks ────────────────────────────────────────────────────────────────────
// Only the outbound side effects are mocked. The routing rules under test —
// stage matching, validation ordering, tenant resolution — run for real.

const createWorkOrderFromGHLStage = vi.hoisted(() => vi.fn());
const updateWorkOrderStatusByGHLOpportunity = vi.hoisted(() => vi.fn());
const flagEstimateFromGHL = vi.hoisted(() => vi.fn());
const upsertPropertyFromGHL = vi.hoisted(() => vi.fn());
const createWorkOrderFromAppointment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ghl/work-order-factory", () => ({
  createWorkOrderFromGHLStage,
  updateWorkOrderStatusByGHLOpportunity,
  flagEstimateFromGHL,
}));
vi.mock("@/lib/ghl/upsert-property-from-ghl", () => ({ upsertPropertyFromGHL }));
vi.mock("@/lib/ghl/create-work-order-from-appointment", () => ({ createWorkOrderFromAppointment }));

import { dispatch } from "./dispatch";

const LOCATION_ID = "test-location-1";
const TENANT_ID = "tenant-uuid-1";

/** Builds the payload the way the route does: raw body → normalizer → dispatch. */
function normalized(body: Record<string, unknown>) {
  return normalizeGHLPayload(body).payload;
}

function oppBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "OpportunityStatusChange",
    locationId: LOCATION_ID,
    id: "opp-1",
    name: "Test Customer",
    status: "open",
    ...overrides,
  };
}

const woFixture = (n: string) => ({ wo_number: n });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GHL_LOCATION_TO_TENANT = JSON.stringify({ [LOCATION_ID]: TENANT_ID });
});

afterEach(() => {
  delete process.env.GHL_LOCATION_TO_TENANT;
});

// ── The exact production failure ─────────────────────────────────────────────

describe("the reported production failure: workflow succeeds, no Work Order", () => {
  it("rejects the incomplete body GHL was sending instead of silently ignoring it", async () => {
    // type, locationId, id, name, status — no stage, no contactId.
    const outcome = await dispatch(normalized(oppBody()));

    expect(outcome.code).toBe("rejected_validation");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("records the failure honestly in the ledger, even though GHL still sees 200", async () => {
    const outcome = await dispatch(normalized(oppBody()));

    // The regression: this used to answer 200 with processing_status='done',
    // indistinguishable from a real creation. The fix is NOT forcing a non-2xx
    // HTTP status to GHL (GHL's retry behavior for 4xx is unverified — see
    // webhook-outcome.ts) — it's that outcome_code now always records what
    // actually happened, so this failure is visible in the ledger regardless
    // of what GHL does with the response code.
    expect(httpStatusFor(outcome.code)).toBe(200);
    expect(ledgerStatusFor(outcome.code)).toBe("failed_permanent");
    expect(ledgerStatusFor(outcome.code)).not.toBe("done");
  });

  it("creates the Work Order once the missing fields are supplied", async () => {
    createWorkOrderFromGHLStage.mockResolvedValue({ outcome: "created", workOrder: woFixture("WO-0007") });

    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked",
      pipelineStageId: "stage-1",
      contactId: "contact-1",
    })));

    expect(outcome.code).toBe("created");
    expect(outcome.workOrderNumber).toBe("WO-0007");
    expect(httpStatusFor(outcome.code)).toBe(200);
  });
});

// ── Stage routing ────────────────────────────────────────────────────────────

describe("creation stages", () => {
  beforeEach(() => {
    createWorkOrderFromGHLStage.mockResolvedValue({ outcome: "created", workOrder: woFixture("WO-0001") });
  });

  it("Diagnosis Booked creates exactly one work order", async () => {
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("created");
    expect(createWorkOrderFromGHLStage).toHaveBeenCalledTimes(1);
    expect(createWorkOrderFromGHLStage).toHaveBeenCalledWith(
      expect.anything(), "Diagnosis Booked", TENANT_ID,
    );
  });

  it("Estimate Approved creates a work order", async () => {
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Estimate Approved", contactId: "c-1",
    })));

    expect(outcome.code).toBe("created");
    expect(createWorkOrderFromGHLStage).toHaveBeenCalledWith(
      expect.anything(), "Estimate Approved", TENANT_ID,
    );
  });

  it("matches stage names case-insensitively and ignores surrounding whitespace", async () => {
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "  diagnosis booked  ", contactId: "c-1",
    })));

    expect(outcome.code).toBe("created");
  });

  it("routes on the stage NAME even when the stage id is absent", async () => {
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("created");
  });

  it("does not create when the stage id is present but the name is blank", async () => {
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageId: "stage-1", pipelineStageName: "", contactId: "c-1",
    })));

    expect(outcome.code).toBe("rejected_validation");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("reports a missing contactId as a permanent failure, not a success", async () => {
    const outcome = await dispatch(normalized(oppBody({ pipelineStageName: "Diagnosis Booked" })));

    expect(outcome.code).toBe("skipped_missing_contact");
    expect(ledgerStatusFor(outcome.code)).toBe("failed_permanent");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("treats a contact name as NOT a contact id", async () => {
    // "name" populates contact.name only; it must never satisfy the id check.
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", name: "Jane Doe",
    })));

    expect(outcome.code).toBe("skipped_missing_contact");
  });

  it("does not treat an unresolved merge tag as a contact id", async () => {
    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "{{contact.id}}",
    })));

    expect(outcome.code).toBe("skipped_missing_contact");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("reports an idempotent repeat as already_exists, not as a new creation", async () => {
    createWorkOrderFromGHLStage.mockResolvedValue({
      outcome: "already_exists", workOrder: woFixture("WO-0001"),
    });

    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("already_exists");
    expect(ledgerStatusFor(outcome.code)).toBe("done");
  });

  it("does NOT record a factory error as a processed success", async () => {
    createWorkOrderFromGHLStage.mockResolvedValue({ outcome: "error", reason: "db exploded" });

    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("failed_retryable");
    expect(ledgerStatusFor(outcome.code)).not.toBe("done");
    expect(httpStatusFor(outcome.code)).toBe(500);
  });
});

describe("two creation stages for the SAME opportunity", () => {
  it("creates one work order per trigger stage, not one per opportunity", async () => {
    createWorkOrderFromGHLStage
      .mockResolvedValueOnce({ outcome: "created", workOrder: woFixture("WO-0010") })
      .mockResolvedValueOnce({ outcome: "created", workOrder: woFixture("WO-0011") });

    const first = await dispatch(normalized(oppBody({
      id: "opp-shared", pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));
    const second = await dispatch(normalized(oppBody({
      id: "opp-shared", pipelineStageName: "Estimate Approved", contactId: "c-1",
    })));

    expect(first.code).toBe("created");
    expect(second.code).toBe("created");
    expect(first.workOrderNumber).not.toBe(second.workOrderNumber);

    // Both calls must carry the same opportunity but different trigger stages —
    // that pair is the idempotency key.
    const stages = createWorkOrderFromGHLStage.mock.calls.map((c) => c[1]);
    expect(stages).toEqual(["Diagnosis Booked", "Estimate Approved"]);
  });
});

describe("non-creation stages", () => {
  it("updates status for In Progress", async () => {
    updateWorkOrderStatusByGHLOpportunity.mockResolvedValue("WO-0002");

    const outcome = await dispatch(normalized(oppBody({ pipelineStageName: "In Progress" })));

    expect(outcome.code).toBe("status_updated");
    expect(updateWorkOrderStatusByGHLOpportunity).toHaveBeenCalledWith(
      "opp-1", "in_progress", "In Progress", TENANT_ID,
    );
  });

  it("flags the estimate for Estimate Sent", async () => {
    flagEstimateFromGHL.mockResolvedValue("WO-0003");

    const outcome = await dispatch(normalized(oppBody({ pipelineStageName: "Estimate Sent" })));

    expect(outcome.code).toBe("estimate_flagged");
  });

  it("reports an intentional no-op for a real but non-actionable stage", async () => {
    const outcome = await dispatch(normalized(oppBody({ pipelineStageName: "New Lead" })));

    expect(outcome.code).toBe("ignored_non_action_stage");
    expect(outcome.detail).toBe("New Lead");
    expect(ledgerStatusFor(outcome.code)).toBe("ignored");
    expect(httpStatusFor(outcome.code)).toBe(200);
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("distinguishes an unknown/renamed stage from a missing one", async () => {
    const renamed = await dispatch(normalized(oppBody({ pipelineStageName: "Diagnosis Scheduled" })));
    const missing = await dispatch(normalized(oppBody()));

    expect(renamed.code).toBe("ignored_non_action_stage");
    expect(missing.code).toBe("rejected_validation");
    expect(renamed.code).not.toBe(missing.code);
  });

  it("reports when a status update finds no matching work order", async () => {
    updateWorkOrderStatusByGHLOpportunity.mockResolvedValue(null);

    const outcome = await dispatch(normalized(oppBody({ pipelineStageName: "In Progress" })));

    expect(outcome.code).toBe("ignored_no_matching_work_order");
    expect(ledgerStatusFor(outcome.code)).toBe("ignored");
  });

  it("discards lost and abandoned opportunities without touching the factory", async () => {
    for (const status of ["lost", "abandoned"]) {
      const outcome = await dispatch(normalized(oppBody({
        status, pipelineStageName: "Diagnosis Booked", contactId: "c-1",
      })));
      expect(outcome.code).toBe("ignored_terminal_status");
    }
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("a missing opportunity id is a safe terminal failure — rejected before the factory runs", async () => {
    const outcome = await dispatch(normalized(oppBody({
      id: undefined, pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("rejected_validation");
    expect(ledgerStatusFor(outcome.code)).toBe("failed_permanent");
    expect(httpStatusFor(outcome.code)).toBe(200);
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });
});

// ── Tenant resolution ────────────────────────────────────────────────────────

describe("tenant resolution", () => {
  it("resolves a known location to its tenant", async () => {
    createWorkOrderFromGHLStage.mockResolvedValue({ outcome: "created", workOrder: woFixture("WO-1") });

    await dispatch(normalized(oppBody({ pipelineStageName: "Diagnosis Booked", contactId: "c-1" })));

    expect(createWorkOrderFromGHLStage).toHaveBeenCalledWith(expect.anything(), expect.anything(), TENANT_ID);
  });

  it("fails explicitly for an unknown location and creates nothing", async () => {
    const outcome = await dispatch(normalized(oppBody({
      locationId: "not-mapped", pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("unknown_tenant");
    expect(ledgerStatusFor(outcome.code)).toBe("failed_permanent");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("fails explicitly when GHL_LOCATION_TO_TENANT is malformed", async () => {
    process.env.GHL_LOCATION_TO_TENANT = "{not valid json";

    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("unknown_tenant");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("never creates a record when the tenant cannot be resolved", async () => {
    delete process.env.GHL_LOCATION_TO_TENANT;

    const outcome = await dispatch(normalized(oppBody({
      pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("unknown_tenant");
    expect(createWorkOrderFromGHLStage).not.toHaveBeenCalled();
  });

  it("rejects a payload with no locationId at all", async () => {
    const outcome = await dispatch(normalized(oppBody({ locationId: undefined })));

    expect(outcome.code).toBe("rejected_validation");
  });
});

// ── Event types ──────────────────────────────────────────────────────────────

describe("event types", () => {
  it("ignores an event type with no handler", async () => {
    const outcome = await dispatch(normalized({ type: "OpportunityDelete", locationId: LOCATION_ID, id: "o-1" }));

    expect(outcome.code).toBe("ignored_event_type");
    expect(ledgerStatusFor(outcome.code)).toBe("ignored");
  });

  it("ignores an entirely unknown event type", async () => {
    const outcome = await dispatch(normalized({ type: "SomethingNew", locationId: LOCATION_ID }));

    expect(outcome.code).toBe("ignored_event_type");
  });

  it("ignores a payload with no type at all rather than crashing", async () => {
    const outcome = await dispatch(normalized({ locationId: LOCATION_ID }));

    expect(outcome.code).toBe("ignored_event_type");
  });

  it("tolerates whitespace around the event type", async () => {
    createWorkOrderFromGHLStage.mockResolvedValue({ outcome: "created", workOrder: woFixture("WO-1") });

    const outcome = await dispatch(normalized(oppBody({
      type: "  OpportunityStatusChange  ", pipelineStageName: "Diagnosis Booked", contactId: "c-1",
    })));

    expect(outcome.code).toBe("created");
  });
});
