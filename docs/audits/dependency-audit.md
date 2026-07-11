# Dependency Audit — Phase 0

_Generated 2026-07-11. Command: `npm audit` / `npm outdated` on Node v24.16.0, npm 11.13.0, 845 total resolved dependencies._

## Vulnerability summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 8 |
| Moderate | 5 |
| Low      | 1 |
| **Total**| **14** |

## Findings

| Package | Installed | Severity | Advisory | Fix path | Notes |
|---|---|---|---|---|---|
| `next` | 15.5.15 | **High** | GHSA-fr5h-rqp8-mj6g (SSRF in Server Actions), GHSA-7gfc-8cq8-jh5f (authorization bypass), GHSA-4342-x723-ch2f (middleware SSRF), GHSA-492v-c6pp-mqqv (middleware bypass via dynamic route param injection), GHSA-267c-6grr-h53f (middleware bypass via segment-prefetch), plus ~15 more DoS/cache-poisoning/XSS advisories | `npm install next@15.5.20` (non-breaking patch, same major) | **Highest-priority fix.** Multiple advisories are directly relevant to this app's threat model (middleware is the only auth gate for `/dashboard` and `/tech`; a middleware bypass CVE is a real tenant-isolation risk). Upgrade before Phase 1 security work, not after. |
| `next-pwa` (transitive: `workbox-build` → `rollup-plugin-terser` → `serialize-javascript`) | current | **High** | GHSA-5c6j-r48x-rmvq (RCE via `RegExp.flags`/`toISOString`) | Only via `npm audit fix --force`, which downgrades to `next-pwa@2.0.2` (breaking) | Build-time-only dependency (webpack plugin), not part of the request-handling path — lower practical exploitability than the `next` findings, but still an 8-high-severity chain sitting in `devDependencies`-adjacent tooling. Recommend evaluating whether `next-pwa` (last published for older Next versions, no active maintenance signal) should be replaced with a manually maintained service worker + Workbox CLI, tracked as a Phase-8 (offline PWA) decision rather than patched blindly. |
| `ws` | 8.0.0–8.20.1 | **High** | GHSA-58qx-3vcg-4xpx (uninitialized memory disclosure), GHSA-96hv-2xvq-fx4p (DoS via tiny fragments) | `npm audit fix` (non-breaking) | Easy fix, no code impact expected — apply in Phase 1. |
| `next-auth` (transitive: `uuid`) | 4.24.14 | Moderate | GHSA-w5hq-g745-h8pq (`uuid` buffer bounds check) | `npm audit fix --force` reports a "fix" of `next-auth@3.29.10` — **do not take this path**, it is a major downgrade to an older next-auth line, not a real fix | No safe automated fix currently available. Track upstream `next-auth` v4 patch release; do not force-downgrade. |
| `postcss` | <8.5.10 (via `next`'s and `@types/next-pwa`'s vendored copies) | Moderate | GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>` in stringify output) | No fix available for the vendored copies; top-level `postcss` (8.5.13) is already ahead of the vulnerable range | Root-level dependency is fine; vulnerable copies are nested inside `next`/`@types/next-pwa` — resolves itself once `next` is upgraded. |
| `@babel/core` | ≤7.29.0 | Moderate (dev-only) | GHSA-4x5r-pxfx-6jf8 (arbitrary file read via `sourceMappingURL`) | `npm audit fix` | Build-tool-only exposure (not shipped to the browser or server runtime). Low urgency. |
| `brace-expansion` (via `@typescript-eslint`) | 5.0.2–5.0.5 | Moderate (dev-only) | GHSA-jxxr-4gwj-5jf2 (ReDoS) | `npm audit fix` | Lint-tooling only. Low urgency. |
| `js-yaml` | 4.0.0–4.1.1 (dev-only) | Moderate | GHSA-h67p-54hq-rp68 (quadratic DoS) | `npm audit fix` | Build-tooling only. Low urgency. |

## Outdated packages (non-security)

| Package | Current | Latest (same major) | Latest (any) | Recommendation |
|---|---|---|---|---|
| `next` | 15.5.15 | 15.5.20 | 16.2.10 | Take the 15.5.20 patch now (see above); defer the Next 16 major to its own scoped migration, not bundled into Phase 1. |
| `eslint-config-next` | 15.5.15 | 15.5.20 | 16.2.10 | Bump alongside `next`. |
| `@supabase/supabase-js` | 2.105.3 | 2.110.2 | — | Safe minor bump; take opportunistically. |
| `stripe` | 22.2.0 | 22.3.1 | — | Safe minor bump. |
| `resend`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `recharts`, `tailwind-merge`, `date-fns`, `@radix-ui/react-tabs`, `autoprefixer`, `zod` | various | — | latest minor | All safe minor/patch bumps, no code changes expected. |
| `react` / `react-dom` | 18.3.1 | — | 19.2.7 | **Do not upgrade to React 19 opportunistically.** This is a major with its own breaking-change surface (ref handling, `useFormState`, etc.) — scope as its own change if/when it becomes necessary, not part of routine maintenance. |
| `tailwindcss` | 3.4.19 | — | 4.3.2 | Tailwind 4 is a rewrite of the config/build model. Do not upgrade without a dedicated migration pass — out of scope for Phase 0/1. |
| `typescript` | 5.9.3 | — | 7.0.2 | TypeScript 6/7 numbering reflects a major toolchain shift upstream; stay on 5.x until the ecosystem (Next.js, ESLint config) has caught up. |

## Recommended action for Phase 1

1. `npm install next@15.5.20 eslint-config-next@15.5.20` — closes the highest-severity, most relevant advisories with zero breaking changes.
2. `npm audit fix` (non-force) — closes the `ws`, `@babel/core`, `brace-expansion`, `js-yaml` findings.
3. Leave `next-auth`'s transitive `uuid` advisory and the `next-pwa`/`workbox` chain **open with a documented exception** until Phase 1 decides whether to replace `next-pwa` — do not run `--force`, which trades a real (if lower-severity) vulnerability for a major downgrade of two unrelated packages.
4. Re-run `npm audit` after step 1–2 and record the new baseline in this file before closing out Phase 1's dependency work.
