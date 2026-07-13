import { describe, it, expect } from "vitest";
import {
  evaluateCompletionRequirements,
  describeMissingRequirements,
  resolveCompletionRule,
  DEFAULT_COMPLETION_RULE,
} from "./completion-requirements";
import type { CompletionRequirementRule, VisitCompletionData } from "@/types/completion-requirements";

const noneRequired = {
  require_checklist_complete: false,
  require_photos: false,
  require_technician_note: false,
  require_customer_signature: false,
  require_equipment_reading: false,
  require_time_entry: false,
  require_material_usage: false,
  require_completion_reason: false,
};

const emptyData: VisitCompletionData = {
  checklistComplete: false,
  photoCount: 0,
};

describe("evaluateCompletionRequirements", () => {
  it("passes when nothing is required", () => {
    const r = evaluateCompletionRequirements(noneRequired, emptyData);
    expect(r).toEqual({ canComplete: true, missing: [] });
  });

  it("flags an incomplete checklist when required", () => {
    const r = evaluateCompletionRequirements(
      { ...noneRequired, require_checklist_complete: true },
      emptyData
    );
    expect(r.canComplete).toBe(false);
    expect(r.missing).toEqual(["checklist_complete"]);
  });

  it("flags missing photos when required", () => {
    const r = evaluateCompletionRequirements({ ...noneRequired, require_photos: true }, emptyData);
    expect(r.missing).toEqual(["photos"]);
  });

  it("passes the default rule when checklist is complete and photos exist", () => {
    const r = evaluateCompletionRequirements(DEFAULT_COMPLETION_RULE, {
      checklistComplete: true,
      photoCount: 2,
    });
    expect(r.canComplete).toBe(true);
  });

  it("treats whitespace-only text fields as missing", () => {
    const r = evaluateCompletionRequirements(
      { ...noneRequired, require_technician_note: true },
      { ...emptyData, technicianNote: "   " }
    );
    expect(r.missing).toEqual(["technician_note"]);
  });

  it("treats 0 minutes as a present (not missing) time entry", () => {
    const r = evaluateCompletionRequirements(
      { ...noneRequired, require_time_entry: true },
      { ...emptyData, timeEntryMinutes: 0 }
    );
    expect(r.canComplete).toBe(true);
  });

  it("flags every configured requirement simultaneously", () => {
    const allRequired = Object.fromEntries(Object.keys(noneRequired).map((k) => [k, true])) as typeof noneRequired;
    const r = evaluateCompletionRequirements(allRequired, emptyData);
    expect(r.missing).toHaveLength(8);
    expect(r.canComplete).toBe(false);
  });

  it("passes when all required fields are present", () => {
    const allRequired = Object.fromEntries(Object.keys(noneRequired).map((k) => [k, true])) as typeof noneRequired;
    const r = evaluateCompletionRequirements(allRequired, {
      checklistComplete: true,
      photoCount: 1,
      technicianNote: "All good",
      customerSignature: "data:image/png;base64,abc",
      equipmentReading: "72F",
      timeEntryMinutes: 45,
      materialUsage: "2x chlorine tabs",
      completionReason: "Routine maintenance",
    });
    expect(r.canComplete).toBe(true);
    expect(r.missing).toEqual([]);
  });
});

describe("describeMissingRequirements", () => {
  it("produces a human-readable message per missing item", () => {
    const messages = describeMissingRequirements(["photos", "customer_signature"]);
    expect(messages).toEqual([
      "At least one photo is required",
      "A customer signature is required",
    ]);
  });
});

describe("resolveCompletionRule", () => {
  const categoryRule = { service_category: "pool_repair" } as CompletionRequirementRule;
  const defaultRule = { service_category: null } as unknown as CompletionRequirementRule;

  it("prefers an exact service-category match", () => {
    expect(resolveCompletionRule([defaultRule, categoryRule], "pool_repair")).toBe(categoryRule);
  });

  it("falls back to the tenant default row", () => {
    expect(resolveCompletionRule([defaultRule, categoryRule], "heater_service")).toBe(defaultRule);
  });

  it("falls back to the hardcoded baseline when nothing is configured", () => {
    expect(resolveCompletionRule([], "pool_repair")).toBe(DEFAULT_COMPLETION_RULE);
  });
});
