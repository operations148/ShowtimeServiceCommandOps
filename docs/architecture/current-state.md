# Current-State Architecture — Phase 0

_As of branch `feat/phase-0-audit`, parent commit `9977037`._

## Framework, runtime, rendering model, deployment

- **Framework**: Next.js 15.5.15 (App Router only — no `pages/` directory exists). React 18.3.1, TypeScript 5.9.3 strict mode.
- **Rendering**: Mixed static (`○`) and dynamic/server-rendered (`ƒ`) per `next build` output — 41 routes total, roughly half static dashboard shells and half dynamic (all `/api/*`, all `[id]`/`[token]` dynamic segments).
- **Deployment**: Vercel, `serverExternalPackages: ["pdfkit"]` configured in `next.config.ts` (required because pdfkit is CJS and reads font files via `require()` at runtime — webpack would otherwise mangle the path). No `runtime = 'edge'` directives found anywhere except the implicit Node.js default; `src/app/api/stripe/webhook/route.ts` explicitly sets `runtime = 'nodejs'` (required for raw-body Stripe signature verification).
- **Middleware**: `src/middleware.ts` wraps `next-auth/middleware`'s `withAuth`. Matcher is `["/dashboard/:path*", "/tech/:path*", "/login"]` — **`/api/*` is not covered by middleware at all**; every API route is individually responsible for its own auth via `requireApiAuth()`/`requirePermission()`, with no shared gate, rate limiter, or origin check in front of them.
- **Authentication**: NextAuth.js v4, `CredentialsProvider`, JWT session strategy, 8-hour `maxAge`. `src/lib/auth/config.ts` queries the `users` table directly with the service-role Supabase client and verifies passwords with bcrypt. No OAuth providers, no MFA, no session revocation mechanism (a role change or deactivation does not invalidate an already-issued JWT until it naturally expires up to 8 hours later).
- **Session handling**: Session payload carries `id`, `name`, `role`, `tenant_id`, `technician_id?`, `avatar_url?`. No custom cookie configuration is set in `authOptions` — NextAuth's default cookie flags (`httpOnly`, `SameSite=Lax`, `Secure` in production) are relied on as the only implicit CSRF mitigation; there is no explicit CSRF token layer for the app's own (non-NextAuth) API routes.
- **API routes**: 35 `route.ts` files under `src/app/api/**`, all using the Next.js App Router route-handler convention (named exports per HTTP method). See `docs/audits/repository-inventory.md` for the full per-route table.
- **Background/scheduled jobs**: One cron endpoint, `GET /api/cron/generate-visits`, intended to be triggered by Vercel Cron (or an external scheduler) on a recurring basis to materialize upcoming visits from `recurring_schedules`. **This endpoint fails open (proceeds unauthenticated) if `CRON_SECRET` is unset** — see `docs/audits/security-audit.md`.
- **PWA**: `next-pwa` wraps the Next config (`dest: "public"`, `register: true`, `skipWaiting: true`, disabled in development). `public/manifest.json` and a generated `sw.js`/`workbox-*.js` exist. An `InstallPromptBanner.tsx` component is wired into the layout. `runtimeCaching: []` — no custom caching strategies configured, so offline behavior beyond the app shell precache is minimal.
- **External integrations**: GoHighLevel (Private Integration Token, REST API — `src/lib/ghl/client.ts`), Supabase (Postgres + Storage), Resend (transactional email), Stripe (Connect, direct charges — newly added, env vars not yet populated in any environment), pdfkit (server-side PDF generation, no external service).
- **Error handling and logging**: No custom `error.tsx`, `global-error.tsx`, or `not-found.tsx` exists anywhere under `src/app/` — Next.js's default error UI is used unmodified. There is no structured logger module anywhere in `src/lib/`; all logging across the codebase is raw `console.log`/`console.warn`/`console.error` calls, which directly contradicts the project's own documented rule ("No console.log in production code — use proper logger," `.claude/rules/coding-standards.md`). The GHL webhook route in particular logs very verbosely (full payload key lists, contact names, stage names) on every request — see security-audit.md for exactly what is and isn't logged.

## App Router pages and layouts

```
src/app/
  layout.tsx                 root layout — fonts (Sora + Plus Jakarta Sans), SessionProvider
  page.tsx                   redirects to /dashboard/overview
  login/                     split-screen login (server) + LoginForm (client)
  accept-invite/[token]/     invite acceptance — public, token-gated
  dashboard/                 admin surface, gated by middleware for all non-TECHNICIAN roles
    overview, work-orders, work-orders/[id], properties, properties/[id],
    technicians, team, estimates, visits, reports (+ marketing/owner/va),
    settings, ai-knowledge (stub)
  tech/                      technician mobile surface, gated by middleware, TECHNICIAN-only redirect logic
    today, job/[id]
  api/                       35 route.ts handlers — see repository-inventory.md
```

No route exists under `src/app` for a public customer-facing estimate/invoice page (`/estimate/[token]` or similar) despite `estimate_handoffs.accept_token` and `invoices.public_token` columns existing in the database and the Stripe deposit-checkout code constructing a redirect URL (`/estimate/${invoice.public_token}?status=paid`) that currently points at a non-existent page. See `docs/audits/repository-inventory.md` module-completion table for full detail.

## Server vs. client components

Convention observed throughout: page-level `page.tsx` files are server components that fetch data and pass it as props to a co-located `'use client'` component (e.g. `work-orders/[id]/page.tsx` → `WorkOrderDetail.tsx`, `tech/job/[id]/page.tsx` → `JobDetail.tsx`). All interactive state (forms, modals, filters, the technician job-completion state machine) lives in client components. `src/lib/db/browser.ts` (anon-key Supabase client) is defined for client-component direct DB access but has zero call sites — client components fetch exclusively through the app's own `/api/*` routes via `fetch()`, never talking to Supabase directly.

## Validation and data-access conventions

- Zod v4 schemas in `src/lib/validation/*.ts`, one `Create*Schema` + `Patch*Schema` pair per domain (work-order, property, visit, technician, recurring-schedule, invoice). Not every route uses one — several GET routes accept raw query-string params without a schema (low risk, but inconsistent with the "Zod validation on all API inputs" rule taken literally).
- All DB access goes through `src/lib/db/queries/*.ts` using the singleton service-role client from `src/lib/db/client.ts`. `getTenantId(session)` (throws if missing) is the sole mechanism enforcing tenant isolation at the application layer — there is no database-level backstop currently active (see erd.md's RLS caveat).
- Discriminated-union result types are used consistently for operations with multiple outcomes (`{ outcome: 'created' | 'already_exists' | 'error' }`, `{ ok: true; data } | { ok: false; notFound: true }`), which is a genuinely good, consistently-applied pattern worth preserving in new phases.
