import { describe, it, expect } from "vitest";
import { serializeDraft, parseDraft, draftKey, type VisitDraft } from "./drafts";
import type { ChecklistItem } from "@/types/visit";

const checklist: ChecklistItem[] = [
  { id: "a", label: "Skim surface", completed: true },
  { id: "b", label: "Test chemistry", completed: false },
];

describe("draft serialization", () => {
  it("round-trips a draft", () => {
    const draft: VisitDraft = { visitId: "v1", checklist, notes: "gate was unlocked", updatedAt: 123 };
    const parsed = parseDraft(serializeDraft(draft));
    expect(parsed).toEqual(draft);
  });

  it("namespaces the storage key per visit", () => {
    expect(draftKey("v1")).not.toBe(draftKey("v2"));
    expect(draftKey("v1")).toContain("v1");
  });

  it("returns null for missing/empty input", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft("")).toBeNull();
  });

  it("returns null (never throws) on corrupt JSON", () => {
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft("[]")).toBeNull();
  });

  it("rejects shape-invalid drafts", () => {
    expect(parseDraft(JSON.stringify({ visitId: "v1" }))).toBeNull(); // missing fields
    expect(parseDraft(JSON.stringify({ visitId: 1, checklist: [], notes: "", updatedAt: 0 }))).toBeNull(); // wrong type
    expect(parseDraft(JSON.stringify({ visitId: "v1", checklist: "no", notes: "", updatedAt: 0 }))).toBeNull();
  });
});
