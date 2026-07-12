import { describe, it, expect } from "vitest";
import { InvoiceStatus, INVOICE_STATUS_TRANSITIONS } from "@/types/invoice";
import {
  canTransition,
  isEditable,
  isTerminal,
  isOpen,
  isPayable,
  isVoidable,
  deriveStatusAfterLedgerChange,
  isOverdueEligible,
  assertTransition,
  InvalidInvoiceTransitionError,
} from "./state-machine";

describe("invoice state machine (Phase 6 consolidated)", () => {
  it("has an entry for every enum member", () => {
    for (const status of Object.values(InvoiceStatus)) {
      expect(INVOICE_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("void, refunded, and credited are terminal", () => {
    expect(INVOICE_STATUS_TRANSITIONS[InvoiceStatus.VOID]).toEqual([]);
    expect(INVOICE_STATUS_TRANSITIONS[InvoiceStatus.REFUNDED]).toEqual([]);
    expect(INVOICE_STATUS_TRANSITIONS[InvoiceStatus.CREDITED]).toEqual([]);
    expect(isTerminal(InvoiceStatus.VOID)).toBe(true);
    expect(isTerminal(InvoiceStatus.REFUNDED)).toBe(true);
    expect(isTerminal(InvoiceStatus.CREDITED)).toBe(true);
    expect(isTerminal(InvoiceStatus.PAID)).toBe(false);
  });

  it("a paid invoice can never be voided — only refunded/credited/reopened by partial refund", () => {
    expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.VOID)).toBe(false);
    expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.REFUNDED)).toBe(true);
    expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.CREDITED)).toBe(true);
    expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID)).toBe(true);
    expect(isVoidable(InvoiceStatus.PAID)).toBe(false);
    expect(isVoidable(InvoiceStatus.PARTIALLY_PAID)).toBe(false); // money moved
    expect(isVoidable(InvoiceStatus.DRAFT)).toBe(true);
    expect(isVoidable(InvoiceStatus.SENT)).toBe(true);
  });

  it("editing is allowed only in draft/ready", () => {
    expect(isEditable(InvoiceStatus.DRAFT)).toBe(true);
    expect(isEditable(InvoiceStatus.READY)).toBe(true);
    expect(isEditable(InvoiceStatus.SENT)).toBe(false);
    expect(isEditable(InvoiceStatus.PAID)).toBe(false);
  });

  it("ready can return to draft; sent cannot", () => {
    expect(canTransition(InvoiceStatus.READY, InvoiceStatus.DRAFT)).toBe(true);
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.DRAFT)).toBe(false);
  });

  it("legacy deposit_paid bridges out into the consolidated states only", () => {
    const out = INVOICE_STATUS_TRANSITIONS[InvoiceStatus.DEPOSIT_PAID];
    expect(out).toContain(InvoiceStatus.PARTIALLY_PAID);
    expect(out).toContain(InvoiceStatus.PAID);
    // and no state transitions INTO deposit_paid — new code never sets it
    for (const [from, targets] of Object.entries(INVOICE_STATUS_TRANSITIONS)) {
      expect(targets, `${from} must not target legacy deposit_paid`).not.toContain(
        InvoiceStatus.DEPOSIT_PAID
      );
    }
  });

  it("open/payable cover the customer-live statuses", () => {
    for (const s of [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.DEPOSIT_DUE, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE]) {
      expect(isOpen(s)).toBe(true);
      expect(isPayable(s)).toBe(true);
    }
    expect(isOpen(InvoiceStatus.DRAFT)).toBe(false);
    expect(isPayable(InvoiceStatus.VOID)).toBe(false);
    expect(isPayable(InvoiceStatus.PAID)).toBe(false);
  });

  it("overdue invoices can still receive payment", () => {
    expect(canTransition(InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID)).toBe(true);
    expect(canTransition(InvoiceStatus.OVERDUE, InvoiceStatus.PAID)).toBe(true);
  });

  it("assertTransition throws a typed error on an illegal move", () => {
    expect(() => assertTransition(InvoiceStatus.VOID, InvoiceStatus.PAID)).toThrow(
      InvalidInvoiceTransitionError
    );
    expect(() => assertTransition(InvoiceStatus.SENT, InvoiceStatus.VIEWED)).not.toThrow();
  });
});

describe("deriveStatusAfterLedgerChange", () => {
  const base = { total: 10_000, amountPaid: 0, amountRefunded: 0, creditedAmount: 0 };

  it("full payment → paid", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.SENT, { ...base, amountPaid: 10_000 })
    ).toBe(InvoiceStatus.PAID);
  });

  it("partial payment → partially_paid", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.DEPOSIT_DUE, { ...base, amountPaid: 1_000 })
    ).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it("overpayment still lands on paid", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.SENT, { ...base, amountPaid: 12_000 })
    ).toBe(InvoiceStatus.PAID);
  });

  it("full refund of everything paid → refunded", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.PAID, {
        ...base,
        amountPaid: 10_000,
        amountRefunded: 10_000,
      })
    ).toBe(InvoiceStatus.REFUNDED);
  });

  it("partial refund of a paid invoice reopens the balance → partially_paid", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.PAID, {
        ...base,
        amountPaid: 10_000,
        amountRefunded: 3_000,
      })
    ).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it("credit note closing the whole balance with no payment → credited", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.SENT, { ...base, creditedAmount: 10_000 })
    ).toBe(InvoiceStatus.CREDITED);
  });

  it("payment + credit together covering the total → paid", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.PARTIALLY_PAID, {
        ...base,
        amountPaid: 6_000,
        creditedAmount: 4_000,
      })
    ).toBe(InvoiceStatus.PAID);
  });

  it("partial credit with nothing paid keeps the current delivery status", () => {
    expect(
      deriveStatusAfterLedgerChange(InvoiceStatus.VIEWED, { ...base, creditedAmount: 2_000 })
    ).toBe(InvoiceStatus.VIEWED);
  });
});

describe("isOverdueEligible", () => {
  it("flags an open invoice past its due date", () => {
    expect(isOverdueEligible(InvoiceStatus.SENT, "2026-07-01", "2026-07-13")).toBe(true);
    expect(isOverdueEligible(InvoiceStatus.PARTIALLY_PAID, "2026-07-01", "2026-07-13")).toBe(true);
  });

  it("never flags paid/void/draft invoices, missing due dates, or future dates", () => {
    expect(isOverdueEligible(InvoiceStatus.PAID, "2026-07-01", "2026-07-13")).toBe(false);
    expect(isOverdueEligible(InvoiceStatus.DRAFT, "2026-07-01", "2026-07-13")).toBe(false);
    expect(isOverdueEligible(InvoiceStatus.VOID, "2026-07-01", "2026-07-13")).toBe(false);
    expect(isOverdueEligible(InvoiceStatus.SENT, null, "2026-07-13")).toBe(false);
    expect(isOverdueEligible(InvoiceStatus.SENT, "2026-08-01", "2026-07-13")).toBe(false);
  });

  it("does not re-flag an invoice already marked overdue", () => {
    expect(isOverdueEligible(InvoiceStatus.OVERDUE, "2026-07-01", "2026-07-13")).toBe(false);
  });
});
