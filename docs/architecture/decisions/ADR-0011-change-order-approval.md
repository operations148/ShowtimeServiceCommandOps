# ADR-0011 — Change-Order Approval, Contract-Value Application, and Schedule Impact

**Status:** Accepted (Phase 5, 2026-07-13)

## Context

A change order is a second financial/approval document layered on top of an in-progress work order. It needed the same security posture as estimates (ADR-0007/8) — hashed public tokens, idempotent atomic decisions, immutable snapshots — but two behaviors are genuinely new and specific to change orders: an accepted change order must actually *change* the parent job's contract value, and it may also propose a *schedule* change that dispatch has to physically act on. This ADR fixes how those two side effects happen, and what "pending" means for work-order closeout.

## Decisions

### 1. Reuse the estimate security architecture verbatim

Public token generation/hashing/validity checking (`generatePublicToken`/`hashPublicToken`/`checkTokenValidity`) and PDF text sanitization (`pdfText`) were promoted out of `src/lib/estimates/` into domain-neutral shared locations (`src/lib/security/public-document-token.ts`, `src/lib/pdf/pdf-text.ts`) the moment a second domain needed the identical logic, rather than duplicating it. The change-order state machine, public resolver, public serializer, and decision-claim pattern are structurally identical to their estimate counterparts (draft/sent/viewed/accepted-or-rejected/expired/voided; atomic `UPDATE ... WHERE version=? AND status IN (...)`; one generic 404 for any public-token failure).

### 2. Accepting a change order applies its price impact to the contract value *in the same request*

Unlike estimate acceptance (which materializes a separate draft invoice), change-order acceptance directly bumps the parent work order's `approved_contract_amount_cents` by `price_impact_cents`, as part of the same atomic accept operation — not a follow-up action an admin has to remember to trigger. This was a deliberate choice: a change order's entire purpose is to formally revise the contract value, so the application has to be as durable and atomic as the acceptance itself, or the two could drift (accepted-but-not-applied is a state nobody should be able to observe). The read-then-conditional-write against the work order happens after the change order's own atomic claim succeeds, and the whole sequence records both an `accepted` and a `contract_value_applied` event for audit.

### 3. Schedule impact is the opposite: never automatic, always an explicit action

`schedule_impact_days`/`schedule_impact_note` are recorded on acceptance but **never** touch the calendar by themselves. Applying them (`POST /api/change-orders/[id]/apply-schedule-impact`) is a separate, permissioned (`canApplyScheduleImpact`) action where a human picks the specific visit and the new date, which then goes through Phase 4's `rescheduleVisit`. The asymmetry with #2 is intentional: contract value is a single scalar with one unambiguous meaning ("the price changed by X"), safe to apply automatically. A schedule impact of "+3 days" has no unambiguous mapping onto a calendar with multiple visits, technicians, and existing commitments — only a dispatcher can decide which visit absorbs it, and doing so silently would be surprising and hard to undo.

### 4. Rejected/voided change orders never alter contract value; overriding an accepted one doesn't reverse it either

Rejection uses the identical atomic-claim pattern as acceptance but has no work-order side effect at all — by construction, not by an extra check. Overriding an *already-accepted* change order (re-opening it back to `draft` for correction) also does not auto-reverse the contract-value bump that already happened. Silently subtracting money back out of a contract as a side effect of an unlock action is exactly the kind of hard-to-audit financial reversal this system is designed to avoid; the documented path is to issue a new, corrective change order, which goes through the same auditable accept-and-apply sequence as any other change.

### 5. Pending change orders block work-order closeout, configurably per document

Every change order carries `blocks_closeout` (default `true`). `findBlockingChangeOrderIds` — shared between `closeWorkOrder` and (for future callers) any invoicing gate — returns the ids of any `blocks_closeout=true` change order still in a pending status (`draft`/`sent`/`viewed`). `closeWorkOrder` fails with 409 + those ids rather than silently allowing closeout while a customer decision is outstanding. A tenant can opt a specific change order out of this gate (e.g. a low-value, informational-only change) by unchecking `blocks_closeout` at creation/edit time — the block is a per-document default, not a hardcoded rule.

### 6. Idempotent replay is a success, not an error, and repeated submissions never double-apply

A replayed accept/decline on an already-decided token returns `{ alreadyDecided: true }` and performs zero additional writes — critically, it does **not** re-run the contract-value bump. This is enforced structurally: the atomic claim (`UPDATE ... WHERE status IN ('sent','viewed')`) simply can't match a row that's already `accepted`, so only the original winning request ever reaches the contract-value-application step.

## Alternatives considered

- **Applying contract value via a separate "apply" action, symmetric with schedule impact** — rejected; unlike a schedule change, there's no ambiguity in what "apply this price change" means, and requiring a second manual step would create a real window where an accepted change order's true cost isn't reflected anywhere, which is a worse default for a number people build invoices from.
- **Auto-reversing contract value on override** — rejected; see #4. A silent financial reversal tied to an unlock action is a bigger correctness risk than requiring a corrective document.
- **Making `blocks_closeout` a tenant-wide setting instead of per-document** — rejected; different change orders on the same tenant can have very different stakes (a $50 informational note vs. a $10,000 scope addition), so the default needs to be overridable per document, not fixed tenant-wide.

## Consequences

- The parent work order's `approved_contract_amount_cents` is always an accurate, atomically-updated reflection of every accepted change order — no separate reconciliation step exists or is needed.
- Schedule changes always have a named human decision behind them (`schedule_impact_applied_by`), which is the correct audit posture for something that reshuffles a technician's calendar.
- Work-order closeout is provably safe against "we closed the job but the customer never actually approved the extra work" — the blocking check is shared code, not a convention staff have to remember to follow.
