# Test Matrix — Phase 1 Onward

_Maps the security-audit findings and master-plan phases to the specific automated tests each phase must add. No test framework exists yet (see `qa/test-baseline.md`) — Phase 1 selects one (recommended: Vitest for unit/integration, Playwright reserved for public-token/portal E2E in Phase 3/7) as part of standing this matrix up for real._

| Test | Verifies | Phase | Traces to finding |
|---|---|---|---|
| Cross-tenant denial (read + write) for every resource type | Tenant isolation holds even though RLS is currently inert | 1 | M1 |
| Read-only role (READ_ONLY_OWNER) cannot mutate any resource | Permission model correctness | 1 | Repository-inventory permission matrix |
| Technician scoping — cannot read/write another technician's work order/visit | `isTechnicianScoped` correctness | 1 | Baseline (currently correct) — regression guard |
| `deleteWorkOrder`/`deleteRecurringSchedule` reject a missing tenantId | Delete functions can't run tenant-unscoped | 1 | M2 |
| Session revocation on role change | Deactivation/role-change takes effect immediately | 1 | H2 |
| Session revocation on deactivation | Same | 1 | H2 |
| Login rate limiting / lockout after N attempts | Brute-force mitigation | 1 | H1 |
| Invitation replay (same token twice) | Atomic, race-safe acceptance | 1 | M12 |
| Invitation token is hashed at rest | Plaintext-token fix | 1 | M11 |
| Reset-token replay (once a reset flow exists) | N/A until Phase 1 builds one | 1 | L4 |
| CSRF/origin rejection on state-changing routes | New origin-check control | 1 | M10 |
| Webhook invalid signature (GHL + Stripe) | Signature verification holds | 1 | Baseline (Stripe already correct; GHL needs constant-time fix, L1) |
| Webhook duplicate event (GHL + Stripe) | Idempotency holds | 1 | Baseline (both already correct) — regression guard |
| Durable retry (GHL outbox) | Replaces in-memory queue | 1 | L7 |
| Unauthorized file deletion (cross-visit photo IDOR) | M7 fix verified | 1 | M7 |
| MIME spoofing on upload (magic-byte check) | M4 fix verified | 1 | M4 |
| SVG upload rejected or sanitized | M5 fix verified | 1 | M5 |
| Oversized image rejected server-side | Regression guard (already correct) | 1 | Baseline |
| Missing cron secret → 401/503, not silent pass-through | H3 fix verified | 1 | H3 |
| Redacted logging (no PII/secret-metadata in log output) | M14/M15 fix verified | 1 | M14, M15 |
| `send-estimate` requires permission + ownership | H4 fix verified | 1 | H4 |
| `POST /api/visits` validates cross-tenant work_order_id/property_id | M8 fix verified | 1 | M8 |
| Money calculation tests (cents, tax, discount, markup, rounding) | Phase 2 money utilities | 2 | Traceability matrix |
| Tenant-safe sequence concurrency (parallel invoice/estimate creation) | No duplicate/skipped numbers under load | 2 | Traceability matrix — invoice numbering not yet concurrency-safe |
| Cross-tenant pricebook access denial | New module's tenant isolation | 2 | — |
| Internal-cost hidden from technician/portal views | Pricebook permission requirement | 2 | — |
| Archive (not hard-delete) behavior on pricebook items | Soft-delete consistency | 2 | M3 pattern extended |
| Snapshot immutability (pricebook item edited after being used in a document) | Line-item snapshot correctness | 2 | — |
| Optimistic concurrency (stale write rejected) | Row-versioning correctness | 2 | — |
| Estimate state-machine transition tests | Formal lifecycle correctness | 3 | — |
| Public estimate token: hashed, expiring, revocable, rate-limited | New public surface security | 3 | Dead `accept_token` schema being activated |
| Estimate acceptance idempotency/replay | No duplicate invoice from repeated submission | 3 | Pattern already proven correct in `createInvoiceFromEstimate` — reuse |
| Cross-tenant public token (estimate token from tenant A rejected against tenant B's data) | Public-surface tenant isolation | 3 | — |
| Estimate PDF escaping (XSS via customer-supplied text) | Output safety | 3 | — |
| Schedule/dispatch cross-tenant denial | New module | 4 | — |
| Multi-technician assignment correctness | New assignment model | 4 | — |
| DST / cross-midnight / recurrence-duplicate-prevention | Timezone safety | 4 | — |
| Cron missing-secret / replay | Extends H3 fix to the recurring-visit generator specifically | 4 | H3 |
| Work-order parent/child authorization | New project model | 5 | — |
| Change-order public token (same security bar as estimates) | New public surface | 5 | Same pattern as Phase 3 |
| Pending-change-order invoicing block | Business-rule enforcement | 5 | — |
| Invoice/payment reconciliation correctness | Phase 6 completeness | 6 | Untracked-table gap resolved in Phase 2 |
| Deposit/checkout idempotency under replayed Stripe events | Regression guard (already correct) | 6 | Baseline |
| Customer portal: field allow-listing (no internal cost/notes/tenant ID ever exposed) | New public surface's most important control | 7 | — |
| Offline mutation conflict resolution | New sync logic correctness | 8 | — |
| Job-costing rollup correctness | New financial calculation | 9 | — |
| Cross-tenant platform-admin access denial | Highest-privilege surface | 10 | — |

## CI wiring (Phase 1)

Once a framework is chosen, this matrix's Phase-1 rows become the initial CI suite, run on every PR via a new `.github/workflows/` pipeline alongside `npm ci`, lint, typecheck, build, and `npm audit` (per the master plan's Phase 1 CI/supply-chain item). Later phases' rows are added to the same pipeline as their code lands — no phase merges without its own rows passing in CI, per the phase-prompt's completion-gate rule.
