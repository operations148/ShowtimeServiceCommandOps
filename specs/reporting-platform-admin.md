# Spec — Financial Reporting, Platform Admin & White-Label Reality (Phase 10)

**Status:** Code-complete (branch `feat/serviceops-phase-10-reporting-admin`, not merged/deployed)
**Related:** ADR-0017 (white-label credentials reality), `qa/reporting-platform-admin-test-plan.md`

Phase 10 addresses three Phase 0 findings: financial reporting was entirely missing, `canManageTenants` had no UI, and `tenants.ghl_api_token_encrypted` was dead schema implying a white-label capability the product lacks.

## 1. Financial reporting (the headline)

Financial reporting was **un-buildable** until now: revenue needed Phase 6 (invoices + payment ledger) and cost needed Phase 9 (job costing). This is the first surface that joins them.

### What it reports (`/dashboard/reports/financial`, `GET /api/reports/financial`)
- **Revenue as three distinct numbers** — because conflating them is how a service business convinces itself it's profitable while running out of cash:
  - *Invoiced* (billed): non-void invoice totals issued in the period.
  - *Collected* (banked): succeeded payments **minus** refunds, ledger-true. A credit note is **not** collected cash.
  - *Outstanding* (owed): open-invoice balance as of the report date.
  - *Written off*: void/credited value.
- **Cost to deliver**: labor + mileage + expenses, summed from the Phase 9 entry-level `cost_cents` for the period (NOT `work_orders.actual_cost_cents`, which is a lifetime rollup that can't be date-sliced).
- **Gross profit** (invoiced − cost) and **gross margin** — `null`, not 0, when nothing was invoiced (undefined ≠ break-even), reusing `money.grossProfit`/`grossMargin`.
- **AR aging**: outstanding balance bucketed current / 1–30 / 31–60 / 61–90 / 90+ days overdue relative to the report date. A no-due-date balance is *current*, never invented as delinquent.

### Honesty by construction
The report carries its own **caveats** as data (rendered, not hidden):
- Period-level profitability ≠ per-job matching (a job billed in March can carry February's labor — per-job margin lives on the work order).
- If revenue exists but no costs are logged, margin reads 100% — flagged explicitly as "set rates and log costs before trusting this."

### Permission
`canViewFinancialReports` — the **same owners-only rail** as cost/margin visibility (platform owner, tenant admin, read-only owner; office staff and technicians excluded). The tab hides itself for roles without it; the API 403s regardless. No new exposure.

## 2. Platform admin (`/dashboard/platform`)

The cross-tenant surface for `canManageTenants` (platform_owner only) — **the highest-privilege surface in the app.** Scoped deliberately narrow:
- **Lists all tenants** with aggregate operational metadata: name, slug, active status, created date, and counts (users, technicians, work orders, open invoices) via `count/head` queries that never return rows.
- **No customer PII crosses the tenant boundary** — a platform owner sees that a tenant exists and how busy it is, not its customers, invoices, or job details. Cross-tenant *data* access is a separate, deliberately unbuilt concern.
- **Activate / suspend a tenant** — audited (`platform.tenant_activated` / `platform.tenant_suspended`); suspending your own tenant is blocked (self-lockout guard).

### Two independent gates
1. **`NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED`** kill-switch (default OFF) — cross-tenant access is opt-in, never silently present. When off, the page and both API routes return **404** (not 403 — the surface doesn't acknowledge it exists).
2. **`canManageTenants`** permission — enforced server-side on the page (via `notFound()`) and every route, independent of the flag.

The `platform-admin.ts` query module is explicitly labeled a danger surface: it deliberately does not scope by `tenant_id` and must only be reached from these double-gated routes.

## 3. White-label credentials — corrected, not built (ADR-0017)

`tenants.ghl_api_token_encrypted` is inert: never read/written, no encryption code, one shared env token (`GHL_PRIVATE_INTEGRATION_TOKEN`) drives all GHL calls. Rather than build phase-sized per-tenant encrypted credentials for a product with one live tenant (overbuild, real security surface), Phase 10 **corrects the record**:
- Migration `20260717000003` adds a `COMMENT ON COLUMN` marking it deprecated/inert (not dropped — reversible, and a future real design can adopt it).
- The `Tenant` type field is `@deprecated`-annotated.
- Onboarding a second tenant is now a documented known blocker, not a mid-onboarding surprise.

## 4. Out of scope

- Per-tenant encrypted GHL credentials (ADR-0017 — deferred until a real second tenant).
- Cross-tenant data access (platform admin is metadata + activate only).
- CSV/PDF export of the financial report (numbers first; export is a later nicety).
- Per-job P&L view (already exists on the work order via Phase 9; this is the period roll-up).

## 5. Gates

`tsc` clean · `next lint` no new errors · `vitest` green (+ financial-math and permission tests) · `next build` passing. Migration `20260717000003` **not applied** until approved. `NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED` stays unset (admin surface dormant) until a second tenant exists.
