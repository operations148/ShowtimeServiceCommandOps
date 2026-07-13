import { describe, it, expect } from "vitest";
import { EstimateStatus } from "@/types/estimate";
import {
  ESTIMATE_STATUS_TRANSITIONS,
  canTransition,
  isEditable,
  isTerminal,
  isDecidable,
  assertTransition,
  InvalidEstimateTransitionError,
} from "./state-machine";

describe("ESTIMATE_STATUS_TRANSITIONS", () => {
  it("covers every status exactly once", () => {
    const keys = Object.keys(ESTIMATE_STATUS_TRANSITIONS).sort();
    const all = Object.values(EstimateStatus).sort();
    expect(keys).toEqual(all);
  });

  it("terminal states have no outgoing transitions", () => {
    expect(ESTIMATE_STATUS_TRANSITIONS[EstimateStatus.CONVERTED]).toEqual([]);
    expect(ESTIMATE_STATUS_TRANSITIONS[EstimateStatus.VOIDED]).toEqual([]);
  });

  it("only ever references real statuses as targets", () => {
    const all = new Set(Object.values(EstimateStatus));
    for (const targets of Object.values(ESTIMATE_STATUS_TRANSITIONS)) {
      for (const t of targets) expect(all.has(t)).toBe(true);
    }
  });
});

describe("canTransition", () => {
  it("allows the documented happy path", () => {
    expect(canTransition(EstimateStatus.DRAFT, EstimateStatus.SENT)).toBe(true);
    expect(canTransition(EstimateStatus.SENT, EstimateStatus.VIEWED)).toBe(true);
    expect(canTransition(EstimateStatus.VIEWED, EstimateStatus.ACCEPTED)).toBe(true);
    expect(canTransition(EstimateStatus.ACCEPTED, EstimateStatus.CONVERTED)).toBe(true);
  });

  it("permits accept directly from sent (customer never opened, accepted via link)", () => {
    expect(canTransition(EstimateStatus.SENT, EstimateStatus.ACCEPTED)).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition(EstimateStatus.DRAFT, EstimateStatus.ACCEPTED)).toBe(false);
    expect(canTransition(EstimateStatus.ACCEPTED, EstimateStatus.DRAFT)).toBe(false);
    expect(canTransition(EstimateStatus.CONVERTED, EstimateStatus.VOIDED)).toBe(false);
    expect(canTransition(EstimateStatus.VOIDED, EstimateStatus.DRAFT)).toBe(false);
  });

  it("cannot edit an accepted estimate back to draft (immutability)", () => {
    expect(canTransition(EstimateStatus.ACCEPTED, EstimateStatus.DRAFT)).toBe(false);
  });

  it("lets declined/expired estimates be re-opened into a new draft", () => {
    expect(canTransition(EstimateStatus.DECLINED, EstimateStatus.DRAFT)).toBe(true);
    expect(canTransition(EstimateStatus.EXPIRED, EstimateStatus.DRAFT)).toBe(true);
  });
});

describe("status predicates", () => {
  it("isEditable only for draft/ready", () => {
    expect(isEditable(EstimateStatus.DRAFT)).toBe(true);
    expect(isEditable(EstimateStatus.READY)).toBe(true);
    expect(isEditable(EstimateStatus.SENT)).toBe(false);
    expect(isEditable(EstimateStatus.ACCEPTED)).toBe(false);
  });

  it("isTerminal only for converted/voided", () => {
    expect(isTerminal(EstimateStatus.CONVERTED)).toBe(true);
    expect(isTerminal(EstimateStatus.VOIDED)).toBe(true);
    expect(isTerminal(EstimateStatus.SENT)).toBe(false);
  });

  it("isDecidable only for sent/viewed", () => {
    expect(isDecidable(EstimateStatus.SENT)).toBe(true);
    expect(isDecidable(EstimateStatus.VIEWED)).toBe(true);
    expect(isDecidable(EstimateStatus.DRAFT)).toBe(false);
    expect(isDecidable(EstimateStatus.ACCEPTED)).toBe(false);
  });
});

describe("assertTransition", () => {
  it("passes silently for a valid transition", () => {
    expect(() => assertTransition(EstimateStatus.SENT, EstimateStatus.ACCEPTED)).not.toThrow();
  });

  it("throws a typed error for an invalid transition", () => {
    try {
      assertTransition(EstimateStatus.ACCEPTED, EstimateStatus.DRAFT);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidEstimateTransitionError);
      expect((e as InvalidEstimateTransitionError).from).toBe(EstimateStatus.ACCEPTED);
      expect((e as InvalidEstimateTransitionError).to).toBe(EstimateStatus.DRAFT);
    }
  });
});
