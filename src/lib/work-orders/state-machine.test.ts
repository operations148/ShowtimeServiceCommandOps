import { describe, it, expect } from "vitest";
import { WorkOrderStatus, WORK_ORDER_STATUS_TRANSITIONS } from "@/types/work-order";
import {
  canTransition,
  isOpen,
  isTerminal,
  canClose,
  canArchive,
  canReopen,
  assertTransition,
  InvalidWorkOrderTransitionError,
} from "./state-machine";

describe("WORK_ORDER_STATUS_TRANSITIONS", () => {
  it("covers every status exactly once", () => {
    const keys = Object.keys(WORK_ORDER_STATUS_TRANSITIONS).sort();
    const all = Object.values(WorkOrderStatus).sort();
    expect(keys).toEqual(all);
  });

  it("archived is terminal", () => {
    expect(WORK_ORDER_STATUS_TRANSITIONS[WorkOrderStatus.ARCHIVED]).toEqual([]);
  });

  it("only ever references real statuses as targets", () => {
    const all = new Set(Object.values(WorkOrderStatus));
    for (const targets of Object.values(WORK_ORDER_STATUS_TRANSITIONS)) {
      for (const t of targets) expect(all.has(t)).toBe(true);
    }
  });
});

describe("canTransition", () => {
  it("allows the documented happy path", () => {
    expect(canTransition(WorkOrderStatus.NEW, WorkOrderStatus.ASSIGNED)).toBe(true);
    expect(canTransition(WorkOrderStatus.ASSIGNED, WorkOrderStatus.SCHEDULED)).toBe(true);
    expect(canTransition(WorkOrderStatus.SCHEDULED, WorkOrderStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED)).toBe(true);
    expect(canTransition(WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED)).toBe(true);
  });

  it("allows the reopen path (closed -> needs_follow_up)", () => {
    expect(canTransition(WorkOrderStatus.CLOSED, WorkOrderStatus.NEEDS_FOLLOW_UP)).toBe(true);
  });

  it("allows the archive path from closed and cancelled only", () => {
    expect(canTransition(WorkOrderStatus.CLOSED, WorkOrderStatus.ARCHIVED)).toBe(true);
    expect(canTransition(WorkOrderStatus.CANCELLED, WorkOrderStatus.ARCHIVED)).toBe(true);
    expect(canTransition(WorkOrderStatus.NEW, WorkOrderStatus.ARCHIVED)).toBe(false);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition(WorkOrderStatus.NEW, WorkOrderStatus.COMPLETED)).toBe(false);
    expect(canTransition(WorkOrderStatus.ARCHIVED, WorkOrderStatus.NEW)).toBe(false);
    expect(canTransition(WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED)).toBe(false);
  });

  it("on_hold can return to any active work state", () => {
    expect(canTransition(WorkOrderStatus.ON_HOLD, WorkOrderStatus.ASSIGNED)).toBe(true);
    expect(canTransition(WorkOrderStatus.ON_HOLD, WorkOrderStatus.SCHEDULED)).toBe(true);
    expect(canTransition(WorkOrderStatus.ON_HOLD, WorkOrderStatus.IN_PROGRESS)).toBe(true);
  });
});

describe("status predicates", () => {
  it("isOpen covers the active work states", () => {
    expect(isOpen(WorkOrderStatus.NEW)).toBe(true);
    expect(isOpen(WorkOrderStatus.IN_PROGRESS)).toBe(true);
    expect(isOpen(WorkOrderStatus.COMPLETED)).toBe(false);
    expect(isOpen(WorkOrderStatus.ARCHIVED)).toBe(false);
  });

  it("isTerminal only for archived", () => {
    expect(isTerminal(WorkOrderStatus.ARCHIVED)).toBe(true);
    expect(isTerminal(WorkOrderStatus.CLOSED)).toBe(false);
    expect(isTerminal(WorkOrderStatus.CANCELLED)).toBe(false);
  });

  it("canClose only from completed", () => {
    expect(canClose(WorkOrderStatus.COMPLETED)).toBe(true);
    expect(canClose(WorkOrderStatus.IN_PROGRESS)).toBe(false);
  });

  it("canArchive only from closed or cancelled", () => {
    expect(canArchive(WorkOrderStatus.CLOSED)).toBe(true);
    expect(canArchive(WorkOrderStatus.CANCELLED)).toBe(true);
    expect(canArchive(WorkOrderStatus.COMPLETED)).toBe(false);
  });

  it("canReopen only from closed", () => {
    expect(canReopen(WorkOrderStatus.CLOSED)).toBe(true);
    expect(canReopen(WorkOrderStatus.ARCHIVED)).toBe(false);
  });
});

describe("assertTransition", () => {
  it("passes silently for a valid transition", () => {
    expect(() => assertTransition(WorkOrderStatus.NEW, WorkOrderStatus.ASSIGNED)).not.toThrow();
  });

  it("throws a typed error for an invalid transition", () => {
    try {
      assertTransition(WorkOrderStatus.ARCHIVED, WorkOrderStatus.NEW);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidWorkOrderTransitionError);
      expect((e as InvalidWorkOrderTransitionError).from).toBe(WorkOrderStatus.ARCHIVED);
      expect((e as InvalidWorkOrderTransitionError).to).toBe(WorkOrderStatus.NEW);
    }
  });
});
