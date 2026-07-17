import { describe, it, expect } from "vitest";
import {
  outboxKeyFor,
  makeEntry,
  upsertEntry,
  removeEntry,
  markAttempt,
  type OutboxEntry,
} from "./outbox";

describe("outbox pure queue logic", () => {
  it("derives a stable key per (visitId, kind)", () => {
    expect(outboxKeyFor("v1", "visit_patch")).toBe("visit_patch:v1");
    expect(outboxKeyFor("v1", "visit_patch")).toBe(outboxKeyFor("v1", "visit_patch"));
    expect(outboxKeyFor("v2", "visit_patch")).not.toBe(outboxKeyFor("v1", "visit_patch"));
  });

  it("makeEntry starts at zero attempts with the right key", () => {
    const e = makeEntry("v1", "visit_patch", { status: "completed" }, 1000);
    expect(e).toMatchObject({ key: "visit_patch:v1", visitId: "v1", kind: "visit_patch", attempts: 0, createdAt: 1000 });
    expect(e.payload).toEqual({ status: "completed" });
  });

  it("upsertEntry is latest-wins: replaces the entry with the same key", () => {
    const first = makeEntry("v1", "visit_patch", { checklist: [1] }, 1);
    const second = makeEntry("v1", "visit_patch", { checklist: [1, 2] }, 2);
    let entries: OutboxEntry[] = [];
    entries = upsertEntry(entries, first);
    entries = upsertEntry(entries, second);
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toEqual({ checklist: [1, 2] });
    expect(entries[0].createdAt).toBe(2);
  });

  it("upsertEntry keeps distinct visits separate", () => {
    let entries: OutboxEntry[] = [];
    entries = upsertEntry(entries, makeEntry("v1", "visit_patch", {}, 1));
    entries = upsertEntry(entries, makeEntry("v2", "visit_patch", {}, 1));
    expect(entries).toHaveLength(2);
  });

  it("removeEntry drops only the matching key", () => {
    let entries: OutboxEntry[] = [
      makeEntry("v1", "visit_patch", {}, 1),
      makeEntry("v2", "visit_patch", {}, 1),
    ];
    entries = removeEntry(entries, outboxKeyFor("v1", "visit_patch"));
    expect(entries).toHaveLength(1);
    expect(entries[0].visitId).toBe("v2");
  });

  it("markAttempt bumps attempts and records the error without dropping the entry", () => {
    let entries: OutboxEntry[] = [makeEntry("v1", "visit_patch", {}, 1)];
    entries = markAttempt(entries, outboxKeyFor("v1", "visit_patch"), "network down");
    expect(entries).toHaveLength(1);
    expect(entries[0].attempts).toBe(1);
    expect(entries[0].lastError).toBe("network down");
    entries = markAttempt(entries, outboxKeyFor("v1", "visit_patch"));
    expect(entries[0].attempts).toBe(2);
  });
});
