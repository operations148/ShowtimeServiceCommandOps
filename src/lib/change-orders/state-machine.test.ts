import { describe, it, expect } from "vitest";
import { ChangeOrderStatus } from "@/types/change-order";
import {
  CHANGE_ORDER_STATUS_TRANSITIONS,
  canTransition,
  isEditable,
  isTerminal,
  isDecidable,
  isPending,
  assertTransition,
  InvalidChangeOrderTransitionError,
} from "./state-machine";

describe("CHANGE_ORDER_STATUS_TRANSITIONS", () => {
  it("covers every status exactly once", () => {
    const keys = Object.keys(CHANGE_ORDER_STATUS_TRANSITIONS).sort();
    const all = Object.values(ChangeOrderStatus).sort();
    expect(keys).toEqual(all);
  });

  it("voided is terminal", () => {
    expect(CHANGE_ORDER_STATUS_TRANSITIONS[ChangeOrderStatus.VOIDED]).toEqual([]);
  });

  it("only ever references real statuses as targets", () => {
    const all = new Set(Object.values(ChangeOrderStatus));
    for (const targets of Object.values(CHANGE_ORDER_STATUS_TRANSITIONS)) {
      for (const t of targets) expect(all.has(t)).toBe(true);
    }
  });
});

describe("canTransition", () => {
  it("allows the documented happy path", () => {
    expect(canTransition(ChangeOrderStatus.DRAFT, ChangeOrderStatus.SENT)).toBe(true);
    expect(canTransition(ChangeOrderStatus.SENT, ChangeOrderStatus.VIEWED)).toBe(true);
    expect(canTransition(ChangeOrderStatus.VIEWED, ChangeOrderStatus.ACCEPTED)).toBe(true);
  });

  it("permits accept directly from sent (customer never opened, accepted via link)", () => {
    expect(canTransition(ChangeOrderStatus.SENT, ChangeOrderStatus.ACCEPTED)).toBe(true);
  });

  it("cannot edit an accepted change order back to draft (immutability)", () => {
    expect(canTransition(ChangeOrderStatus.ACCEPTED, ChangeOrderStatus.DRAFT)).toBe(false);
  });

  it("lets rejected/expired change orders be revised (re-opened into draft)", () => {
    expect(canTransition(ChangeOrderStatus.REJECTED, ChangeOrderStatus.DRAFT)).toBe(true);
    expect(canTransition(ChangeOrderStatus.EXPIRED, ChangeOrderStatus.DRAFT)).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition(ChangeOrderStatus.DRAFT, ChangeOrderStatus.ACCEPTED)).toBe(false);
    expect(canTransition(ChangeOrderStatus.VOIDED, ChangeOrderStatus.DRAFT)).toBe(false);
  });
});

describe("status predicates", () => {
  it("isEditable only for draft", () => {
    expect(isEditable(ChangeOrderStatus.DRAFT)).toBe(true);
    expect(isEditable(ChangeOrderStatus.SENT)).toBe(false);
  });

  it("isTerminal only for voided", () => {
    expect(isTerminal(ChangeOrderStatus.VOIDED)).toBe(true);
    expect(isTerminal(ChangeOrderStatus.ACCEPTED)).toBe(false);
  });

  it("isDecidable only for sent/viewed", () => {
    expect(isDecidable(ChangeOrderStatus.SENT)).toBe(true);
    expect(isDecidable(ChangeOrderStatus.VIEWED)).toBe(true);
    expect(isDecidable(ChangeOrderStatus.DRAFT)).toBe(false);
  });

  it("isPending covers draft/sent/viewed (the closeout-blocking set)", () => {
    expect(isPending(ChangeOrderStatus.DRAFT)).toBe(true);
    expect(isPending(ChangeOrderStatus.SENT)).toBe(true);
    expect(isPending(ChangeOrderStatus.VIEWED)).toBe(true);
    expect(isPending(ChangeOrderStatus.ACCEPTED)).toBe(false);
    expect(isPending(ChangeOrderStatus.REJECTED)).toBe(false);
  });
});

describe("assertTransition", () => {
  it("passes silently for a valid transition", () => {
    expect(() => assertTransition(ChangeOrderStatus.SENT, ChangeOrderStatus.ACCEPTED)).not.toThrow();
  });

  it("throws a typed error for an invalid transition", () => {
    try {
      assertTransition(ChangeOrderStatus.ACCEPTED, ChangeOrderStatus.DRAFT);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidChangeOrderTransitionError);
      expect((e as InvalidChangeOrderTransitionError).from).toBe(ChangeOrderStatus.ACCEPTED);
      expect((e as InvalidChangeOrderTransitionError).to).toBe(ChangeOrderStatus.DRAFT);
    }
  });
});
