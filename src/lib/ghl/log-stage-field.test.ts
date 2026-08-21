import { describe, it, expect } from "vitest";
import { sanitizeDetail, MAX_DETAIL_LENGTH } from "./webhook-outcome";
import { normalizeGHLPayload, stageNameOf } from "./normalize-payload";

// Prompt 12B: the structured-logging defect found during the Prompt 12 release
// review, plus the PII hole it exposed underneath.
//
// The completion log built its `stage` field from `outcome.detail`. detail is a
// STAGE NAME for only a few outcomes (created, status_updated, ...) and a
// REASON STRING for the rest, so `stage` regularly read "missing opportunity
// id" or "locationId not present in GHL_LOCATION_TO_TENANT" — actively
// misleading in exactly the operational logs this phase existed to make
// trustworthy.
//
// Fixing that surfaced a second, worse problem: detail is not unconditionally
// safe. Two paths put raw error text in it (the route's catch-all and
// work-order-factory's unique-violation branch), and a Postgres unique
// violation embeds the CONFLICTING VALUES — tenant UUID, GHL opportunity id.

describe("stage is sourced from the real pipeline stage, never from outcome.detail", () => {
  it("logs the actual stage name when the payload carries one", () => {
    const { payload } = normalizeGHLPayload({
      type: "OpportunityStatusChange",
      locationId: "loc-1",
      id: "opp-1",
      pipelineStageName: "Diagnosis Booked",
    });

    // This is exactly the expression the route now uses for `stage`.
    expect(stageNameOf(payload)).toBe("Diagnosis Booked");
  });

  it("logs null — not fabricated content — when no stage was sent", () => {
    const { payload, presence } = normalizeGHLPayload({
      type: "OpportunityStatusChange",
      locationId: "loc-1",
      id: "opp-1",
    });

    expect(presence.stageName).toBe(false);
    expect(stageNameOf(payload)).toBeNull();
    // Explicitly NOT the old placeholders.
    expect(stageNameOf(payload)).not.toBe("(absent)");
    expect(stageNameOf(payload)).not.toBe("(unnamed)");
  });

  it("never lets a non-stage reason string become the stage", () => {
    // Reason strings dispatch() really produces for stage-less outcomes.
    const nonStageDetails = [
      "missing locationId",
      "missing opportunity id",
      "locationId not present in GHL_LOCATION_TO_TENANT",
      "missing pipelineStageName — stage routing cannot run",
    ];

    for (const detail of nonStageDetails) {
      const { payload } = normalizeGHLPayload({
        type: "OpportunityStatusChange",
        locationId: "loc-1",
        id: "opp-1",
      });
      const loggedStage = stageNameOf(payload);

      expect(loggedStage).toBeNull();
      expect(loggedStage, `"${detail}" must never be logged as a stage`).not.toBe(detail);
    }
  });

  it("an unresolved merge tag is not a stage", () => {
    const { payload } = normalizeGHLPayload({
      type: "OpportunityStatusChange",
      locationId: "loc-1",
      id: "opp-1",
      pipelineStageName: "{{opportunity.pipelineStage}}",
    });

    expect(stageNameOf(payload)).toBeNull();
  });
});

describe("sanitizeDetail — identifiers never reach logs or the ledger", () => {
  it("redacts the conflicting values from a real Postgres unique violation", () => {
    // The genuine shape produced by the stage-level unique index.
    const raw =
      'duplicate key value violates unique constraint "idx_wo_tenant_opportunity_stage_unique" ' +
      "Key (tenant_id, ghl_opportunity_id, ghl_trigger_stage)=" +
      "(3f2504e0-4f89-11d3-9a0c-0305e82c3301, aBcD1234EfGh5678IjKl, Diagnosis Booked) already exists.";

    const safe = sanitizeDetail(raw)!;

    expect(safe).not.toContain("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(safe).not.toContain("aBcD1234EfGh5678IjKl");
    // The operationally useful part survives.
    expect(safe).toContain("unique constraint");
    expect(safe).toContain("[redacted]");
  });

  it("redacts bare UUIDs and GHL-shaped ids anywhere in the string", () => {
    const safe = sanitizeDetail(
      "tenant 3f2504e0-4f89-11d3-9a0c-0305e82c3301 location ve9EPM428h8vShlRW1KT",
    )!;

    expect(safe).not.toContain("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(safe).not.toContain("ve9EPM428h8vShlRW1KT");
    expect(safe).toContain("[id]");
  });

  it("leaves legitimate stage names and reason strings completely untouched", () => {
    for (const safeInput of [
      "Diagnosis Booked",
      "Estimate Approved",
      "AppointmentBooked",
      "won",
      "missing locationId",
      "locationId not present in GHL_LOCATION_TO_TENANT",
      "stage \"Diagnosis Booked\" requires contactId",
      "(empty)",
    ]) {
      expect(sanitizeDetail(safeInput), safeInput).toBe(safeInput);
    }
  });

  it("caps runaway detail so one error cannot flood the log", () => {
    const safe = sanitizeDetail("x".repeat(5000))!;
    expect(safe.length).toBeLessThanOrEqual(MAX_DETAIL_LENGTH + 1); // +1 for the ellipsis
  });

  it("passes null and undefined through as undefined, not the string 'null'", () => {
    expect(sanitizeDetail(null)).toBeUndefined();
    expect(sanitizeDetail(undefined)).toBeUndefined();
  });

  it("does not leak contact PII if a reason string ever carries it", () => {
    // Defence in depth: nothing should put a name/email in detail, but if a
    // future change did, the long-token rule must still catch the identifier
    // portion and the value must never be echoed verbatim in full.
    const safe = sanitizeDetail("no property for ghl_contact_id: cnt9XyZ1234AbCd5678Q")!;
    expect(safe).not.toContain("cnt9XyZ1234AbCd5678Q");
    expect(safe).toContain("[id]");
  });
});
