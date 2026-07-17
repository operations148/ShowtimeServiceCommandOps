# QA Test Plan — Financial Reporting, Platform Admin & White-Label (Phase 10)

Automated: `src/lib/reports/financial.test.ts` (16 tests — revenue split, refund netting, AR aging buckets, margin null-vs-0, caveats) + Phase 10 block in `src/config/roles.test.ts`. Run: `npx vitest run src/lib/reports src/config/roles.test.ts`.

## 1. Financial reporting — correctness
| # | Step | Expected |
|---|---|---|
| 1.1 | As tenant admin, open Reports → Financial | Loads; revenue/cost/margin/AR panels render |
| 1.2 | A period with invoices + payments + costs | Invoiced, Collected, Outstanding are three distinct numbers; profit = invoiced − cost |
| 1.3 | Period with a refund | Collected = payments − refunds (not gross) |
| 1.4 | Period with a void/credited invoice | Counted as Written-off, not Invoiced |
| 1.5 | Invoices but zero logged cost | Margin shows 100% **with** an amber caveat "set rates and log costs…" |
| 1.6 | Nothing invoiced in period | Margin shows "—" (not 0%) + "undefined rather than 0%" caveat |
| 1.7 | Cost exceeds invoiced | Gross profit negative, shown red |
| 1.8 | Overdue invoices of varying age | Land in correct AR buckets (current/1-30/31-60/61-90/90+) relative to today |
| 1.9 | Open invoice with no due date | Counts as **current**, never 90+ |
| 1.10 | Switch 7d / 30d / 90d / 1y | Report reloads for the new window |

## 2. Financial reporting — permission
| # | Step | Expected |
|---|---|---|
| 2.1 | Tenant admin / platform owner / read-only owner | See the Financial tab; API 200 |
| 2.2 | **Office staff** | Financial tab **absent**; `GET /api/reports/financial` → 403 |
| 2.3 | **Technician** | Same — no tab, API 403 |
| 2.4 | `from` after `to`, or malformed date | 422 |

## 3. Platform admin — gating (the important part)
| # | Step | Expected |
|---|---|---|
| 3.1 | Flag `NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED` unset/false | `/dashboard/platform` → 404; `GET /api/platform/tenants` → 404; nav item absent |
| 3.2 | Flag on, as **platform owner** | Page loads; nav "Platform Admin" visible; tenant list renders |
| 3.3 | Flag on, as **tenant admin** | Page → 404 (notFound); API → 403 (permission, independent of flag) |
| 3.4 | Flag on, as office staff / technician | Page 404; API 403 |
| 3.5 | Inspect `GET /api/platform/tenants` payload | Aggregate counts only — **no** customer names, invoice details, or job data |

## 4. Platform admin — actions
| # | Step | Expected |
|---|---|---|
| 4.1 | Suspend another tenant | `is_active=false`; audit row `platform.tenant_suspended` |
| 4.2 | Reactivate it | `is_active=true`; audit `platform.tenant_activated` |
| 4.3 | Attempt to suspend **your own** tenant | 409 "You can't suspend your own tenant" |
| 4.4 | PATCH a non-existent tenant id | 404 |
| 4.5 | Suspended tenant's users try to use the app | (Downstream — tenant-active enforcement is existing behavior; verify login/session handling) |

## 5. White-label reality
| # | Step | Expected |
|---|---|---|
| 5.1 | Inspect `tenants.ghl_api_token_encrypted` comment (`\d tenants` or Supabase) after migration | Comment marks it DEPRECATED/INERT with ADR-0017 reference |
| 5.2 | Grep the codebase | Column still never read/written; the `Tenant` type field carries `@deprecated` |
| 5.3 | GHL calls | Still resolve from the single shared `GHL_PRIVATE_INTEGRATION_TOKEN` (unchanged) |

## 6. Regression gate
`tsc --noEmit` clean · `next lint` no new errors · `vitest run` all green · `npm run build` succeeds. Migration `20260717000003` applied (or noted pending). `NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED` left unset in prod until a second tenant exists.
