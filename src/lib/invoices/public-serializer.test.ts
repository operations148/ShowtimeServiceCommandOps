import { describe, it, expect } from "vitest";
import { toPublicInvoice, isInvoiceTokenExpired } from "./public-serializer";
import { InvoiceStatus } from "@/types/invoice";
import type { Invoice, InvoiceLineItem, Payment } from "@/types/invoice";
import type { TenantBranding } from "@/lib/estimates/public-serializer";

const SECRET_TENANT_ID = "tenant-secret-1111";
const SECRET_USER_ID = "user-secret-2222";
const SECRET_TOKEN_HASH = "hash-secret-3333";
const SECRET_INTENT = "pi_secret_4444";
const SECRET_ACCOUNT = "acct_secret_5555";
const SECRET_INTERNAL_NOTE = "internal-margin-note-6666";

const invoice: Invoice = {
  id: "inv-1",
  tenant_id: SECRET_TENANT_ID,
  estimate_handoff_id: null,
  estimate_id: "est-1",
  work_order_id: "wo-1",
  property_id: "prop-1",
  ghl_contact_id: "ghl-contact-secret",
  ghl_opportunity_id: "ghl-opp-secret",
  invoice_number: "INV-0042",
  title: "Pool remodel — milestone 2",
  status: InvoiceStatus.PARTIALLY_PAID,
  customer_name: "Dana Customer",
  customer_email: "dana@example.com",
  customer_phone: "555-0100",
  customer_address: "1 Pool Lane",
  issue_date: "2026-07-01",
  due_date: "2026-08-01",
  sent_at: "2026-07-01T00:00:00Z",
  viewed_at: null,
  paid_at: null,
  subtotal: 100_000,
  tax_rate: 0.08,
  tax_amount: 8_000,
  discount_amount: 0,
  total: 108_000,
  amount_paid: 20_000,
  amount_due: 88_000,
  deposit_percent: 10,
  deposit_amount: 10_800,
  deposit_required: true,
  notes: "Visible customer note",
  terms: "Net 30",
  payment_instructions: "Pay online via the button below",
  stripe_payment_intent_id: SECRET_INTENT,
  stripe_payment_link: null,
  stripe_checkout_session_id: "cs_secret",
  public_token: "legacy-plaintext-token-secret",
  public_token_hash: SECRET_TOKEN_HASH,
  token_expires_at: "2099-01-01T00:00:00Z",
  token_revoked_at: null,
  version: 3,
  source_change_order_id: "co-1",
  source_snapshot: { internal: "snapshot-secret" },
  invoice_kind: "milestone",
  milestone_label: "Milestone 2 of 3",
  voided_at: null,
  voided_by: SECRET_USER_ID,
  void_reason: null,
  refunded_at: null,
  amount_refunded: 0,
  credited_amount: 0,
  credit_reason: null,
  created_by: SECRET_USER_ID,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const lines: InvoiceLineItem[] = [
  {
    id: "line-1",
    invoice_id: "inv-1",
    tenant_id: SECRET_TENANT_ID,
    sort_order: 0,
    description: "Tile work",
    details: "Waterline tile",
    quantity: 1,
    unit_price: 100_000,
    total: 100_000,
    created_at: "2026-07-01T00:00:00Z",
  },
];

const payments: Payment[] = [
  {
    id: "pay-1",
    tenant_id: SECRET_TENANT_ID,
    invoice_id: "inv-1",
    payment_number: "PAY-0007",
    kind: "payment",
    amount: 20_000,
    currency: "usd",
    provider: "stripe",
    provider_account_id: SECRET_ACCOUNT,
    provider_payment_intent_id: SECRET_INTENT,
    provider_checkout_session_id: "cs_secret",
    provider_charge_id: "ch_secret",
    provider_refund_id: null,
    status: "succeeded",
    failure_code: null,
    failure_message: null,
    refunded_payment_id: null,
    idempotency_key: null,
    event_source: "webhook",
    reconciliation_status: "unreconciled",
    reconciled_at: null,
    metadata: { internal: SECRET_INTERNAL_NOTE },
    created_by: SECRET_USER_ID,
    created_at: "2026-07-05T00:00:00Z",
  },
  {
    id: "pay-2",
    tenant_id: SECRET_TENANT_ID,
    invoice_id: "inv-1",
    payment_number: "PAY-0008",
    kind: "payment",
    amount: 999_999,
    currency: "usd",
    provider: "stripe",
    provider_account_id: null,
    provider_payment_intent_id: null,
    provider_checkout_session_id: null,
    provider_charge_id: null,
    provider_refund_id: null,
    status: "failed",
    failure_code: "card_declined",
    failure_message: "declined",
    refunded_payment_id: null,
    idempotency_key: null,
    event_source: "webhook",
    reconciliation_status: "unreconciled",
    reconciled_at: null,
    metadata: null,
    created_by: null,
    created_at: "2026-07-06T00:00:00Z",
  },
];

const branding: TenantBranding = {
  company_name: "Showtime Pools",
  company_logo_url: "https://cdn/logo.png",
  company_phone: "555-0199",
  company_email: "ops@showtime.example",
};

describe("toPublicInvoice", () => {
  const view = toPublicInvoice(invoice, lines, payments, branding, { canPayOnline: true });
  const json = JSON.stringify(view);

  it("carries the customer-facing fields", () => {
    expect(view.invoice_number).toBe("INV-0042");
    expect(view.total).toBe(108_000);
    expect(view.amount_due).toBe(88_000);
    expect(view.deposit_paid).toBe(true); // 20k paid ≥ 10.8k deposit
    expect(view.line_items).toHaveLength(1);
    expect(view.company_name).toBe("Showtime Pools");
    expect(view.can_pay_online).toBe(true);
  });

  it("excludes failed payments from the visible history", () => {
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0].amount).toBe(20_000);
  });

  it("never leaks tenant/staff/token/provider/internal values", () => {
    expect(json).not.toContain(SECRET_TENANT_ID);
    expect(json).not.toContain(SECRET_USER_ID);
    expect(json).not.toContain(SECRET_TOKEN_HASH);
    expect(json).not.toContain("legacy-plaintext-token-secret");
    expect(json).not.toContain(SECRET_INTENT);
    expect(json).not.toContain(SECRET_ACCOUNT);
    expect(json).not.toContain("cs_secret");
    expect(json).not.toContain("ch_secret");
    expect(json).not.toContain("ghl-contact-secret");
    expect(json).not.toContain("ghl-opp-secret");
    expect(json).not.toContain("snapshot-secret");
    expect(json).not.toContain(SECRET_INTERNAL_NOTE);
    expect(json).not.toContain("PAY-0007"); // ledger numbers stay internal
  });

  it("structurally cannot carry internal keys", () => {
    expect(view).not.toHaveProperty("tenant_id");
    expect(view).not.toHaveProperty("public_token_hash");
    expect(view).not.toHaveProperty("source_snapshot");
    expect(view).not.toHaveProperty("created_by");
    expect((view.payments[0] as unknown as Record<string, unknown>).provider_payment_intent_id).toBeUndefined();
  });

  it("reports deposit_paid=false when payments have not covered the deposit", () => {
    const v = toPublicInvoice({ ...invoice, amount_paid: 5_000 }, lines, [], branding, { canPayOnline: false });
    expect(v.deposit_paid).toBe(false);
    expect(v.can_pay_online).toBe(false);
  });
});

describe("isInvoiceTokenExpired", () => {
  it("false with no expiry, true past expiry", () => {
    expect(isInvoiceTokenExpired({ token_expires_at: null })).toBe(false);
    expect(isInvoiceTokenExpired({ token_expires_at: "2000-01-01T00:00:00Z" })).toBe(true);
    expect(isInvoiceTokenExpired({ token_expires_at: "2099-01-01T00:00:00Z" })).toBe(false);
  });
});
