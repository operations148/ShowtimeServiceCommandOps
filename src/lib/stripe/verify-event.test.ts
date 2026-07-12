import { describe, it, expect } from "vitest";
import { verifyCheckoutSession, type CheckoutSessionFacts } from "./verify-event";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const INVOICE_ID = "33333333-3333-3333-3333-333333333333";

function session(overrides: Partial<CheckoutSessionFacts> = {}): CheckoutSessionFacts {
  return {
    metadataInvoiceId: INVOICE_ID,
    metadataTenantId: TENANT_A,
    metadataExpectedAmount: "5000",
    amountTotal: 5000,
    currency: "usd",
    paymentIntentId: "pi_123",
    ...overrides,
  };
}

const invoice = { id: INVOICE_ID, tenant_id: TENANT_A };

describe("verifyCheckoutSession", () => {
  it("accepts a fully consistent session and returns the server-owned amount", () => {
    const v = verifyCheckoutSession(session(), TENANT_A, invoice);
    expect(v).toEqual({ ok: true, invoiceId: INVOICE_ID, amount: 5000, paymentIntentId: "pi_123" });
  });

  it("rejects missing metadata (session not created by our checkout path)", () => {
    expect(verifyCheckoutSession(session({ metadataInvoiceId: null }), TENANT_A, invoice)).toEqual({ ok: false, reason: "missing_metadata" });
    expect(verifyCheckoutSession(session({ metadataTenantId: undefined }), TENANT_A, invoice)).toEqual({ ok: false, reason: "missing_metadata" });
    expect(verifyCheckoutSession(session({ metadataExpectedAmount: null }), TENANT_A, invoice)).toEqual({ ok: false, reason: "missing_metadata" });
  });

  it("rejects a missing payment intent", () => {
    expect(verifyCheckoutSession(session({ paymentIntentId: null }), TENANT_A, invoice)).toEqual({ ok: false, reason: "missing_payment_intent" });
  });

  it("rejects forged tenant metadata (wrong connected account)", () => {
    // Session claims Tenant A but arrived on Tenant B's connected account.
    const v = verifyCheckoutSession(session(), TENANT_B, { id: INVOICE_ID, tenant_id: TENANT_B });
    expect(v).toEqual({ ok: false, reason: "tenant_mismatch" });
  });

  it("rejects when the invoice does not exist under the resolved tenant (cross-tenant id guessing)", () => {
    expect(verifyCheckoutSession(session(), TENANT_A, undefined)).toEqual({ ok: false, reason: "invoice_not_found" });
  });

  it("rejects when the resolved invoice belongs to a different tenant or id", () => {
    expect(
      verifyCheckoutSession(session(), TENANT_A, { id: INVOICE_ID, tenant_id: TENANT_B })
    ).toEqual({ ok: false, reason: "invoice_tenant_mismatch" });
    expect(
      verifyCheckoutSession(session(), TENANT_A, { id: "other-id", tenant_id: TENANT_A })
    ).toEqual({ ok: false, reason: "invoice_tenant_mismatch" });
  });

  it("rejects a wrong currency", () => {
    expect(verifyCheckoutSession(session({ currency: "eur" }), TENANT_A, invoice)).toEqual({ ok: false, reason: "currency_mismatch" });
    expect(verifyCheckoutSession(session({ currency: null }), TENANT_A, invoice)).toEqual({ ok: false, reason: "currency_mismatch" });
  });

  it("rejects a forged client amount — session total must equal the server-stamped expectation", () => {
    // Attacker somehow produces a session whose charged total differs from
    // what our server stamped at creation.
    expect(
      verifyCheckoutSession(session({ amountTotal: 100 }), TENANT_A, invoice)
    ).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(
      verifyCheckoutSession(session({ metadataExpectedAmount: "not-a-number" }), TENANT_A, invoice)
    ).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(
      verifyCheckoutSession(session({ metadataExpectedAmount: "0", amountTotal: 0 }), TENANT_A, invoice)
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("is case-insensitive on currency", () => {
    const v = verifyCheckoutSession(session({ currency: "USD" }), TENANT_A, invoice);
    expect(v.ok).toBe(true);
  });
});
