# Target-State Architecture

_Created in Phase 2; the forward-looking companion to `current-state.md`. Updated at each phase boundary. See `docs/implementation/master-plan.md` for sequencing and `docs/architecture/decisions/` for the reasoning behind each block._

## End state (post Phase 11)

ServiceOps Command Center is a GHL-integrated field-operations SaaS where:

- **GHL owns** CRM contacts, conversations, pipelines, calendars, forms, marketing (ADR-0001 — unchanged, permanent).
- **ServiceOps owns** work orders, properties, visits, checklists, photos, recurring schedules, **and the full money stack**: pricebook → estimates/proposals → customer approval → change orders → invoices → payments/deposits → job costing → reporting.
- Every financial document is built from **immutable line-item snapshots** (ADR-0006) priced from the tenant's **pricebook**, numbered by **tenant-scoped atomic sequences** (ADR-0005), computed by **one server-side money module** (ADR-0005), and guarded by **granular server-enforced permissions** (ADR-0003) with internal costs visible only to permitted roles.
- Security foundation from Phase 1 (trusted per-request authorization context, durable rate limiting, audit log, webhook outbox/idempotency, secure file pipeline, CI) underneath everything.

## Layer status

| Layer | Status | Where |
|---|---|---|
| Security/tenancy/audit foundation | ✅ Phase 1 | `docs/security/security-controls.md` |
| Money arithmetic (cents, tax, discounts, margin) | ✅ Phase 2 | `src/lib/money/money.ts`, ADR-0005 |
| Tenant-safe document numbering | ✅ Phase 2 | `document_sequences`, `src/lib/db/queries/document-numbers.ts` |
| Schema reconciliation (one invoice model) | ✅ Phase 2 | `src/types/invoice.ts` authoritative; `estimate.ts` deleted |
| Pricebook (catalog, permissions, cost redaction, UI) | ✅ Phase 2 | `specs/pricebook.md`, ADR-0006 |
| Line-item snapshot foundation | ✅ Phase 2 | `src/lib/documents/line-item-snapshot.ts` |
| Full estimates/proposals + secure customer approval | ✅ Phase 3 | `src/lib/estimates/*`, `specs/estimates.md`, ADR-0007/0008 |
| Dispatch, calendar, visit admin, durable recurring work | ✅ Phase 4 | `src/lib/scheduling/*`, `specs/dispatch-and-scheduling.md`, ADR-0009 |
| Invoicing + payments (activate the orphaned backend) | Phase 5 | estimate acceptance already materialises a DRAFT invoice (idempotent); Phase 5 adds sending/deposit/payment + UI |
| Job costing + profitability | Phase 6 | needs `unit_cost` snapshots from Phase 2 |
| Customer portal | Phase 7 | can reuse the Phase 3 public-token pattern (ADR-0007) as its baseline; re-run RLS decision then |
| Reporting suite | Phase 8 | |
| Tenant onboarding/white-label | Phase 10 | global identity decision (ADR-0002) revisited here |
| Production readiness (RLS reachability, MFA, monitoring) | Phase 11 | |

## Standing architectural rules for future phases

1. **New financial primitives are forbidden** — estimates/change orders/invoices compose `calcDocumentTotals`, `createLineItemSnapshot`, `nextDocumentNumber`. If a phase thinks it needs new money math, it goes into `src/lib/money/` with tests, not inline.
2. **Documents snapshot, never reference-price.** A persisted document line must render identically forever regardless of pricebook edits.
3. **Cost fields ride the `canViewItemCosts` rail** — any new surface returning `internal_cost`/`unit_cost` passes through cost redaction before serialization.
4. **RLS stays "designed but unreachable" until a deliberate phase makes it reachable** (Supabase Auth or `SET LOCAL` session vars — Phase 7 or 11 decision). Until then application-layer tenancy (`tenant_id` on every query + trusted context) is the enforced boundary; new tables still ship RLS policies so the switch is a flip, not a retrofit.
5. **Additive migrations only**; the fresh-environment provisioning gap (migration 019 assumes a dashboard-created table) is closed by a live schema dump, not by rewriting applied migrations.
6. **All schedule time math goes through `src/lib/scheduling/timezone.ts`** (UTC storage, tenant-local display, calendar dates as strings); new `new Date(dateStr)`-in-local-time code is a review-blocking smell (ADR-0009). GHL owns original booking; ServiceOps owns operational scheduling.
