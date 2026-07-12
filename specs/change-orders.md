# Spec — Change Orders (Phase 5)

Full tenant-safe change-order documents against an existing work order, with a secure customer approval flow that mirrors estimates (ADR-0007/8) as closely as the domain allows. Design: ADR-0011 (approval, contract-value application, override). Schema: `database-blueprint/change-orders.md`.

## Lifecycle

`draft → sent → viewed → accepted`, plus `rejected`, `expired`, `voided`. One state machine (`src/lib/change-orders/state-machine.ts`, 12 tests) — deliberately mirrors the estimate state machine's shape. Editing is allowed only in `draft` (`isEditable`). `draft`/`sent`/`viewed` are the **pending** set (`isPending`) — these are the statuses a `blocks_closeout=true` change order will hold a work order's closeout hostage on. `voided` is terminal.

## What it does

- **Create/edit** (draft only): tenant-safe `CO-XXXX` number (via the same `nextDocumentNumber` sequence infrastructure as estimates/invoices), work-order link, version, reason (min 5 chars — always required, even on quick edits), scope description, pricebook or custom line items, cost/price/tax impact computed server-side (`computeChangeOrderTotals`, reusing the Phase 2 money module — no line-selection logic, every line always counts, unlike estimates' optional/recommended lines), schedule impact (days + note, recorded but **never auto-applied** — see below), internal/customer notes, `blocks_closeout` flag (default `true`).
- **Secure public page** `/change-order/[token]`: same security posture as public estimates — hashed token, expiry, revocation, IP + decision rate limits, one generic error response (no oracle), tenant branding, mobile-first, marks viewed, accept (typed-name signature) / decline (optional reason). Only redacted fields (`PublicChangeOrder`) — no internal cost, tenant/staff ids, or internal notes; a dedicated redaction test (9 cases) proves the serialized JSON never carries a secret value.
- **Acceptance**: atomic idempotent decision claim (`UPDATE ... WHERE version=? AND status IN ('sent','viewed')`) — the same pattern as estimate acceptance. On success, **the parent work order's `approved_contract_amount_cents` is bumped by `price_impact_cents` in the same request** (read-then-conditional-write), an accepted-version snapshot is written, and `accepted` + `contract_value_applied` events are recorded. Replaying an already-decided token returns `{ alreadyDecided: true }` — success, not an error, and never re-applies the contract value a second time.
- **Rejection**: same atomic pattern; **never** touches contract value.
- **Send**: manual action via the shared safe mailer (preview by default; reuses `canSendEstimateEmail` rather than a parallel permission, since it already represents "this role may trigger a customer-facing send"). Freezes a sent-version snapshot, issues a fresh token, logs delivery/failure.
- **Override**: re-opens an `accepted`/`rejected`/`expired` change order back to `draft`, requires `canOverrideChangeOrderLock` + a mandatory reason (min 5 chars), revokes the outstanding public token. Deliberately does **not** auto-reverse an already-applied contract value on override — reversing a financial figure silently on an unrelated action is the wrong default; a corrective change order is the documented path (ADR-0011).
- **Apply schedule impact**: a **separate, always-explicit** action (`POST /api/change-orders/[id]/apply-schedule-impact`, gated by `canApplyScheduleImpact`) that pushes an accepted change order's `schedule_impact_days` onto one specific visit's date via Phase 4's `rescheduleVisit`. Approving a change order never touches the calendar by itself — a dispatcher must pick the visit and confirm.
- **Pending-change-order closeout block**: `findBlockingChangeOrderIds` (in the work-orders query module, shared with `closeWorkOrder`) returns the ids of any `blocks_closeout=true` change order still in `draft`/`sent`/`viewed`; closing the work order fails with 409 + those ids until they're resolved (accepted, rejected, voided, or expired).
- **Admin UI**: change orders are listed inside the parent work order's detail page (no tenant-wide list endpoint exists — every change order belongs to exactly one work order); create/edit/detail/send/override/void/apply-schedule-impact all live under `/dashboard/change-orders/[id]` and `/dashboard/work-orders/[id]/change-orders/new`.

## API

| Route | Methods | Permission |
|---|---|---|
| `/api/work-orders/[id]/change-orders` | GET, POST | `canViewChangeOrders` / `canManageChangeOrders` |
| `/api/change-orders/[id]` | GET, PATCH (version) | view / manage |
| `/api/change-orders/[id]/transition` | POST (version, to) — only `"voided"` accepted | `canVoidChangeOrders` |
| `/api/change-orders/[id]/send` | POST (version, recipient?, expires_in_days) | `canSendEstimateEmail` (rate-limited) |
| `/api/change-orders/[id]/override` | POST (reason) | `canOverrideChangeOrderLock` |
| `/api/change-orders/[id]/revoke-token` | POST | manage |
| `/api/change-orders/[id]/apply-schedule-impact` | POST (visit_id, new_scheduled_date) | `canApplyScheduleImpact` |
| `/api/change-orders/[id]/versions` | GET | view |
| `/api/change-orders/[id]/activity` | GET | view |
| `/api/public/change-orders/[token]` | GET | none (token) — rate-limited, redacted |
| `/api/public/change-orders/[token]/accept` | POST | none (token) — idempotent |
| `/api/public/change-orders/[token]/decline` | POST | none (token) — idempotent |

Cost-visibility (`unit_cost`/`cost_impact_cents`) rides the same `canViewItemCosts` rail as the pricebook and estimates (`redactChangeOrderCosts`/`redactChangeOrdersCosts`). Matrix pinned by `src/config/roles.test.ts`.

## Response conventions

Same as estimates (`specs/estimates.md`): `{ data }` (201 on create), 422 + `fieldErrors`, stale version → 409 + `currentVersion`, not-editable → 409, pending-schedule-impact edge cases → 409/422 with a specific reason code, cross-tenant/unknown → 404, public failures → one generic 404/410/409 (no oracle), replay → idempotent success.

## Deliberately out of scope (Phase 5)

- **`draft`↔`sent`/`viewed` re-open via `/transition`** — the state machine allows `rejected`/`expired → draft`, but the only currently-wired path back to `draft` from a locked status is `/override` (permissioned + reasoned). `/transition` only accepts `to: "voided"` from staff.
- **Tenant-wide change-order list/search page** — every change order is scoped to its parent work order; there is no cross-work-order list endpoint or page.
- **Automatic contract-value reversal on override** — see above; a corrective change order is the intended path.

## Tests

State machine (12), totals (7), public serializer redaction (9), completion-requirements evaluator (10, shared with `specs/work-order-projects.md`) — plus `qa/change-order-test-plan.md` for the flows that need a live DB/browser (replay, concurrency, cross-tenant, rate limiting, PDF/email escaping).
