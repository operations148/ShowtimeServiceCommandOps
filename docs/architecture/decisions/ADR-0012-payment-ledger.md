# ADR-0012 — Immutable Payment Ledger and Ledger-Derived Invoice State

**Status:** Accepted (Phase 6, 2026-07-13)

## Context

Invoices collect money over time: a deposit, then a balance, sometimes a partial payment, a refund, or a credit adjustment. Payments arrive from two directions that can race and replay — Stripe webhooks (delivered at-least-once, sometimes out of order) and manual admin entry — and the numbers they produce are the numbers people build their books on. The invoice's `amount_paid`/`amount_due`/`status` must never drift from what actually happened, must survive duplicate/out-of-order/concurrent events, and must be auditable after the fact. This ADR fixes the money model.

## Decisions

### 1. An append-only ledger is the source of truth; invoice aggregates are derived

The `payments` table records immutable money-movement facts (payment / refund / credit rows). Rows are never mutated after insert (except reconciliation stamps). The invoice's `amount_paid`, `amount_refunded`, `credited_amount`, `amount_due`, and `status` are **derived** from summing the ledger, never incremented in place. `applyPayment`/`applyRefund`/`applyCredit` (1) append a ledger row idempotently, (2) re-aggregate the whole ledger, (3) write ledger-true sums onto the invoice. Because step 3 always writes the true sum rather than `+= amount`, two concurrent applications converge on the correct number — the last writer wins with numbers that are correct by construction, not corrupted by a lost update.

### 2. Idempotency is structural, enforced by the database

Partial unique indexes make double-recording impossible: one `payment` row per Stripe `payment_intent`, one row per Stripe `refund` id, globally-unique caller `idempotency_key`. A replayed webhook or a double-clicked admin action hits a 23505, adopts the existing row, and returns `{ alreadyRecorded: true }` — it never reaches the re-aggregation step, so the money is counted exactly once. This is the same "let the unique constraint be the concurrency primitive" pattern estimates used for idempotent invoice conversion.

### 3. Direction lives in `kind`, amounts are always positive

A ledger row's `amount` is always `> 0`; `kind` (payment / refund / credit) carries the sign. Net paid = payments − refunds; owed = total − credits. This keeps the CHECK constraints simple, makes the ledger readable at a glance, and means a refund is a first-class recorded event pointing at the payment it reverses (`refunded_payment_id`) rather than an in-place decrement that erases history.

### 4. Status is a pure function of the aggregates

`deriveStatusAfterLedgerChange(current, {total, amountPaid, amountRefunded, creditedAmount})` is pure and unit-tested. Payment code never sets a status literal — it computes one. This is why the same code path correctly produces `partially_paid`, `paid`, `refunded` (everything paid was returned), and `credited` (balance closed by a credit, no payment), and why a partial refund of a paid invoice correctly reopens it to `partially_paid`. The state machine still gates whether the derived status is *reachable* (a webhook landing on a voided invoice records the ledger fact but never resurrects the document).

### 5. No card data, ever — provider references only

The ledger stores Stripe object ids (payment_intent, charge, refund, checkout_session, connected account) and nothing else about the instrument. There is no PAN, no CVV, no full card object. This keeps the system out of card-data PCI scope for storage.

### 6. Reconciliation is a first-class, auditable job

A scheduled/admin job cross-checks the three sources against each other — ledger vs. invoice aggregates, ledger vs. Stripe's own record, and the webhook dead-letter queue — and files per-tenant findings an admin resolves with a mandatory reason. This is the safety net for the one thing idempotent application can't catch on its own: an event Stripe has that we never successfully processed (a stuck `error` webhook row), or a divergence introduced by a bug. Runs are recorded platform-wide (`reconciliation_runs`).

## Alternatives considered

- **Mutating `invoices.amount_paid += amount` on each payment** — rejected; loses history, and concurrent/replayed events corrupt the total via lost updates. The whole point of the ledger is that the aggregate is always recomputable and never the primary record.
- **A single "transactions" table with signed amounts** — rejected in favour of positive-amount + `kind`; signed amounts make CHECK constraints and human reading harder, and refunds-as-negative-payments lose the explicit link to the reversed payment.
- **Trusting the invoice's cached status without a derivation function** — rejected; the partial-refund-reopens-balance case and the credit-closes-without-payment case both need the pure function to be correct, and scattering status literals across payment code guarantees drift.

## Consequences

- Duplicate, out-of-order, and concurrent payment events are provably safe — money is counted exactly once and aggregates self-heal.
- Every cent has an immutable, timestamped, attributable ledger row; the invoice is a live projection of it.
- Corrections are always additive (refund/credit rows), so the audit trail is complete and tamper-evident — nothing is ever edited away.
- The reconciliation job is the backstop for provider divergence, with a human resolution trail.
