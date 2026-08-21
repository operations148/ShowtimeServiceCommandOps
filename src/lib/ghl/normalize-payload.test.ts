import { describe, it, expect } from "vitest";
import {
  normalizeGHLPayload,
  cleanValue,
  isUnresolvedMergeTag,
  getField,
  parseAppointmentDate,
  parseAppointmentTime,
} from "./normalize-payload";

// GHLWebhookPayload is a discriminated union, so pipelineStage/contact are not
// present on every member. These read the normalized shape structurally.
const stageOf = (p: unknown) =>
  (p as { pipelineStage?: { id?: string; name?: string } }).pipelineStage;

// The body GHL was actually configured to send when the "workflow succeeds but
// no Work Order appears" bug was reported: five fields, no stage, no contact id.
const PRODUCTION_INCOMPLETE_BODY = {
  type: "OpportunityStatusChange",
  locationId: "E4ii6h4R7wnvKtaBaA1l",
  id: "opp-123",
  name: "Jane Doe",
  status: "open",
};

// The same delivery once the workflow supplies the required fields.
const COMPLETE_FLAT_BODY = {
  ...PRODUCTION_INCOMPLETE_BODY,
  pipelineStageName: "Diagnosis Booked",
  pipelineStageId: "stage-abc",
  contactId: "contact-xyz",
};

describe("cleanValue", () => {
  it("trims whitespace and strips surrounding quotes GHL sometimes adds", () => {
    expect(cleanValue('  "Diagnosis Booked"  ')).toBe("Diagnosis Booked");
  });

  it("treats blank and whitespace-only values as missing", () => {
    expect(cleanValue("")).toBeNull();
    expect(cleanValue("   ")).toBeNull();
    expect(cleanValue(null)).toBeNull();
    expect(cleanValue(undefined)).toBeNull();
  });

  it("treats an unresolved merge tag as missing, never as an id", () => {
    expect(cleanValue("{{contact.id}}")).toBeNull();
    expect(cleanValue("{{ opportunity.pipeline_stage }}")).toBeNull();
  });
});

describe("isUnresolvedMergeTag", () => {
  it("detects merge-tag braces", () => {
    expect(isUnresolvedMergeTag("{{contact.id}}")).toBe(true);
    expect(isUnresolvedMergeTag("Diagnosis Booked")).toBe(false);
  });
});

describe("getField", () => {
  it("returns the first usable alias", () => {
    expect(getField({ b: "second" }, "a", "b")).toBe("second");
  });

  it("looks inside a nested data envelope", () => {
    expect(getField({ data: { contactId: "c-1" } }, "contactId")).toBe("c-1");
  });

  it("skips an empty top-level value in favour of a later alias", () => {
    expect(getField({ a: "", b: "real" }, "a", "b")).toBe("real");
  });

  it("returns null when nothing usable is present", () => {
    expect(getField({ a: "{{merge.tag}}" }, "a")).toBeNull();
  });
});

describe("normalizeGHLPayload — the production failure body", () => {
  it("reports the stage and contact id as absent rather than empty strings", () => {
    const { payload, presence } = normalizeGHLPayload(PRODUCTION_INCOMPLETE_BODY);

    expect(presence.stageName).toBe(false);
    expect(presence.contactId).toBe(false);
    expect(stageOf(payload)).toBeUndefined();

    // Regression guard: contact.id used to normalize to "", which reads as
    // present to a truthiness check and pushed the failure further downstream.
    const contactId = (payload as { contact?: { id?: string } }).contact?.id;
    expect(contactId).toBeUndefined();
  });

  it("still resolves tenant-routing fields that were present", () => {
    const { presence } = normalizeGHLPayload(PRODUCTION_INCOMPLETE_BODY);
    expect(presence.locationId).toBe(true);
    expect(presence.opportunityId).toBe(true);
  });

  it("keeps the contact name it did receive", () => {
    const { payload } = normalizeGHLPayload(PRODUCTION_INCOMPLETE_BODY);
    expect((payload as { contact?: { name?: string } }).contact?.name).toBe("Jane Doe");
  });
});

describe("normalizeGHLPayload — corrected flat body", () => {
  it("lifts flat pipelineStageName/Id into the nested pipelineStage shape", () => {
    const { payload, presence } = normalizeGHLPayload(COMPLETE_FLAT_BODY);
    expect(stageOf(payload)).toEqual({ id: "stage-abc", name: "Diagnosis Booked" });
    expect(presence.stageName).toBe(true);
    expect(presence.stageId).toBe(true);
  });

  it("lifts flat contactId into the nested contact shape", () => {
    const { payload, presence } = normalizeGHLPayload(COMPLETE_FLAT_BODY);
    expect((payload as { contact?: { id?: string } }).contact?.id).toBe("contact-xyz");
    expect(presence.contactId).toBe(true);
  });

  it("accepts a valid stage name when only the stage id is missing", () => {
    const { payload, presence } = normalizeGHLPayload({
      ...COMPLETE_FLAT_BODY,
      pipelineStageId: undefined,
    });
    expect(stageOf(payload)?.name).toBe("Diagnosis Booked");
    expect(presence.stageName).toBe(true);
    expect(presence.stageId).toBe(false);
  });

  it("treats a stage id with a blank name as having no usable stage name", () => {
    const { presence } = normalizeGHLPayload({
      ...PRODUCTION_INCOMPLETE_BODY,
      pipelineStageId: "stage-abc",
      pipelineStageName: "",
    });
    expect(presence.stageId).toBe(true);
    expect(presence.stageName).toBe(false);
  });
});

describe("normalizeGHLPayload — already-nested body", () => {
  it("accepts the nested shape unchanged", () => {
    const { payload, presence } = normalizeGHLPayload({
      type: "OpportunityStatusChange",
      locationId: "loc-1",
      id: "opp-1",
      status: "open",
      pipelineStage: { id: "s-1", name: "Estimate Approved" },
      contact: { id: "c-1", name: "Nested Person" },
    });
    expect(stageOf(payload)).toEqual({ id: "s-1", name: "Estimate Approved" });
    expect((payload as { contact?: { id?: string } }).contact?.id).toBe("c-1");
    expect(presence.stageName).toBe(true);
    expect(presence.contactId).toBe(true);
  });
});

describe("normalizeGHLPayload — merge tags and hygiene", () => {
  it("rejects unresolved merge tags rather than writing them as ids", () => {
    const { payload, presence } = normalizeGHLPayload({
      type: "OpportunityStatusChange",
      locationId: "loc-1",
      id: "opp-1",
      status: "open",
      contactId: "{{contact.id}}",
      pipelineStageName: "{{opportunity.pipeline_stage}}",
    });
    expect(presence.contactId).toBe(false);
    expect(presence.stageName).toBe(false);
    expect(stageOf(payload)).toBeUndefined();
  });

  it("strips stray whitespace from the event type", () => {
    const { payload } = normalizeGHLPayload({ type: "  OpportunityStatusChange  " });
    expect(payload.type).toBe("OpportunityStatusChange");
  });

  it("trims whitespace around a stage name so routing still matches", () => {
    const { payload } = normalizeGHLPayload({
      ...PRODUCTION_INCOMPLETE_BODY,
      pipelineStageName: "  Diagnosis Booked  ",
    });
    expect(stageOf(payload)?.name).toBe("Diagnosis Booked");
  });
});

describe("appointment date/time parsing", () => {
  it("parses ISO, date-only and US formats", () => {
    expect(parseAppointmentDate("2026-05-20T10:30:00.000Z")).toBe("2026-05-20");
    expect(parseAppointmentDate("2026-05-20")).toBe("2026-05-20");
    expect(parseAppointmentDate("5/20/2026")).toBe("2026-05-20");
  });

  it("extracts the time from an ISO timestamp", () => {
    expect(parseAppointmentTime("2026-05-20T10:30:00.000Z")).toBe("10:30");
    expect(parseAppointmentTime("2026-05-20")).toBeNull();
  });

  it("stamps parsed appointment fields onto the payload", () => {
    const { payload } = normalizeGHLPayload({
      ...COMPLETE_FLAT_BODY,
      appointmentStartDateTime: "2026-05-20T10:30:00.000Z",
    });
    const p = payload as unknown as Record<string, string>;
    expect(p._appointmentDate).toBe("2026-05-20");
    expect(p._appointmentTime).toBe("10:30");
  });

  it("does not stamp a date from an unresolved merge tag", () => {
    const { payload } = normalizeGHLPayload({
      ...COMPLETE_FLAT_BODY,
      appointmentStartDateTime: "{{appointment.startTime}}",
    });
    expect((payload as unknown as Record<string, string>)._appointmentDate).toBeUndefined();
  });
});
