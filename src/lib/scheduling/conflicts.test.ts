import { describe, it, expect } from "vitest";
import { spansOverlap, detectConflicts, capacityIndicator, type TimeSpan } from "./conflicts";

const span = (id: string, s: string, e: string): TimeSpan => ({ id, startUtc: s, endUtc: e });

describe("spansOverlap", () => {
  it("detects overlap", () => {
    expect(spansOverlap(span("a", "2026-07-15T16:00:00Z", "2026-07-15T17:00:00Z"), span("b", "2026-07-15T16:30:00Z", "2026-07-15T18:00:00Z"))).toBe(true);
  });
  it("treats touching endpoints as non-overlapping (half-open)", () => {
    expect(spansOverlap(span("a", "2026-07-15T16:00:00Z", "2026-07-15T17:00:00Z"), span("b", "2026-07-15T17:00:00Z", "2026-07-15T18:00:00Z"))).toBe(false);
  });
  it("no overlap when disjoint", () => {
    expect(spansOverlap(span("a", "2026-07-15T16:00:00Z", "2026-07-15T17:00:00Z"), span("b", "2026-07-15T18:00:00Z", "2026-07-15T19:00:00Z"))).toBe(false);
  });
});

describe("detectConflicts", () => {
  const candidate = span("cand", "2026-07-15T16:00:00Z", "2026-07-15T17:00:00Z");

  it("flags an overlapping existing visit", () => {
    const r = detectConflicts({
      candidate,
      existingVisits: [span("v1", "2026-07-15T16:30:00Z", "2026-07-15T17:30:00Z")],
      blockedTime: [],
    });
    expect(r.hasConflict).toBe(true);
    expect(r.overlappingVisitIds).toEqual(["v1"]);
  });

  it("ignores the candidate overlapping itself (same id — a reschedule in place)", () => {
    const r = detectConflicts({
      candidate,
      existingVisits: [span("cand", "2026-07-15T16:00:00Z", "2026-07-15T17:00:00Z")],
      blockedTime: [],
    });
    expect(r.hasConflict).toBe(false);
  });

  it("flags blocked-time overlap", () => {
    const r = detectConflicts({
      candidate,
      existingVisits: [],
      blockedTime: [span("b1", "2026-07-15T15:00:00Z", "2026-07-15T16:30:00Z")],
    });
    expect(r.hasConflict).toBe(true);
    expect(r.overlappingBlockedIds).toEqual(["b1"]);
  });

  it("no conflict when the slot is free", () => {
    const r = detectConflicts({
      candidate,
      existingVisits: [span("v1", "2026-07-15T18:00:00Z", "2026-07-15T19:00:00Z")],
      blockedTime: [],
    });
    expect(r.hasConflict).toBe(false);
    expect(r.overlappingVisitIds).toEqual([]);
  });

  it("marks outside-availability when not contained in any window", () => {
    const r = detectConflicts({
      candidate,
      existingVisits: [],
      blockedTime: [],
      availabilityWindows: [span("w", "2026-07-15T17:00:00Z", "2026-07-16T01:00:00Z")], // starts after candidate
    });
    expect(r.outsideAvailability).toBe(true);
  });

  it("is within availability when fully contained", () => {
    const r = detectConflicts({
      candidate,
      existingVisits: [],
      blockedTime: [],
      availabilityWindows: [span("w", "2026-07-15T15:00:00Z", "2026-07-16T01:00:00Z")],
    });
    expect(r.outsideAvailability).toBe(false);
  });
});

describe("capacityIndicator", () => {
  it("classifies utilization levels", () => {
    expect(capacityIndicator({ scheduledMinutes: 120, capacityMinutes: 480 }).level).toBe("open");
    expect(capacityIndicator({ scheduledMinutes: 360, capacityMinutes: 480 }).level).toBe("tight");
    expect(capacityIndicator({ scheduledMinutes: 456, capacityMinutes: 480 }).level).toBe("full");
    expect(capacityIndicator({ scheduledMinutes: 540, capacityMinutes: 480 }).level).toBe("over");
  });
  it("handles zero capacity", () => {
    expect(capacityIndicator({ scheduledMinutes: 60, capacityMinutes: 0 }).level).toBe("over");
    expect(capacityIndicator({ scheduledMinutes: 0, capacityMinutes: 0 }).level).toBe("open");
  });
});
