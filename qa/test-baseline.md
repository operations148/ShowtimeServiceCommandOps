# Test & Build Baseline — Phase 0

_Captured 2026-07-11 on branch `feat/phase-0-audit`, commit `9977037` (parent). Node v24.16.0, npm 11.13.0._

## Commands run

| Command | Result | Notes |
|---|---|---|
| `npm install` | Skipped — `node_modules/` already present and consistent with `package-lock.json` from prior session work | Not re-run to avoid an unnecessary lockfile diff; no dependency changes were made in Phase 0. |
| `npm run typecheck` (`tsc --noEmit`) | ✅ **Pass** — zero errors | Clean baseline. |
| `npm run lint` (`next lint`) | ✅ **Pass** — zero errors, 17 pre-existing warnings | All warnings are `@typescript-eslint/no-unused-vars` (unused imports/params) and two `react-hooks/exhaustive-deps` warnings in `OverviewDashboard.tsx` / `PropertiesTable.tsx`. None are new; all predate Phase 0. Full list below. |
| `npm run build` (`next build`) | ✅ **Pass** — production build completes, all routes compile | 41 static/dynamic routes generated successfully, including the newly added `/api/stripe/webhook`. |
| Test suite | ⚠️ **No test framework exists** | No `test` script in `package.json`, no Jest/Vitest/Playwright config, no `*.test.*`/`*.spec.*` files anywhere in the repo. This is a hard gap — see below. |
| `npm audit` | ⚠️ 14 vulnerabilities (8 high, 5 moderate, 1 low, 0 critical) | Full detail in `docs/audits/dependency-audit.md`. |

## Lint warnings (pre-existing, not introduced by Phase 0)

```
./src/app/accept-invite/[token]/AcceptInviteClient.tsx
13:9  'router' is assigned a value but never used.

./src/app/api/ghl/test-connection/route.ts
11:27  '_request' is defined but never used.

./src/app/api/notifications/route.ts
17:27  '_req' is defined but never used.

./src/app/api/profile/avatar/route.ts
64:30  '_request' is defined but never used.

./src/app/api/reports/refresh/route.ts
5:28  '_req' is defined but never used.

./src/app/api/settings/company/logo/route.ts
79:30  '_request' is defined but never used.

./src/app/dashboard/reports/va/page.tsx
5:10  'Wrench' is defined but never used.

./src/components/dashboard/EditTechnicianPanel.tsx
9:3  'User' is defined but never used.

./src/components/dashboard/EstimatesPageClient.tsx
11:3  'AlertTriangle' is defined but never used.

./src/components/dashboard/OverviewDashboard.tsx
230:9  react-hooks/exhaustive-deps (x2, lines 258 and 273)

./src/components/dashboard/PropertiesTable.tsx
50:9  react-hooks/exhaustive-deps

./src/components/dashboard/WorkOrderDetail.tsx
8:3  'CalendarDays' is defined but never used.
89:10  'formatDate' is defined but never used.

./src/lib/ghl/reporting-service.ts
140:3  '_tenantId' is defined but never used.

./src/lib/ghl/work-order-factory.ts
14:44  'Priority' is defined but never used.
25:10  'resolveTenantId' is defined but never used.
```

## No test framework — this is a Phase 0/1 gap, not a pre-existing "acceptable" state

`coding-standards.md` and `testing-rules.md` both mandate test coverage ("Manual test plan in qa/ before each phase," "All user roles tested for permission boundaries," "Tenant isolation tested with two test tenants"), and the master Phase prompts require "Add or update automated tests for every material behavior" starting Phase 1. Currently:

- Zero automated tests of any kind exist.
- All "testing" to date has been manual (see `qa/manual-test-plan.md`, `qa/role-permission-test-cases.md`, etc. — these are checklists for a human, not executable suites).
- There is no CI pipeline (no `.github/workflows/`) running any of the above on push/PR.

Per this phase's scope ("add only the minimum non-invasive test scaffolding needed to support later phases — do not begin feature implementation"), Phase 0 does **not** stand up a full test framework. That decision is deferred to Phase 1, which explicitly requires tests for cross-tenant denial, read-only mutation denial, session revocation, etc. — those tests need a real framework choice (Vitest is the natural fit given Next.js 15 + TypeScript strict; Playwright for the public-token/webhook integration paths) made deliberately in Phase 1, not bolted on here.

## CI/CD

No `.github/workflows/` directory exists. There is no automated pipeline running lint/typecheck/build/audit on push or PR — all of the results above were captured by running the commands locally. This is itself a Phase 1 requirement ("Add: Lockfile enforcement, `npm ci`, Lint, Typecheck, Unit tests, Integration tests, Build, Dependency audit, Secret scan, Static analysis, Migration checks").
