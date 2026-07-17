# QA Test Plan — Time, Mileage, Expenses & Job Costing (Phase 9)

Automated (pure logic + permissions): `src/lib/costing/{costing,serialize,authorize}.test.ts` + the Phase 9 block in `src/config/roles.test.ts` — 55+ tests. Run: `npx vitest run src/lib/costing src/config/roles.test.ts`.

Prereq: migration `20260717000001` applied to a test DB. Set a tenant mileage rate + labor fallback, and an `hourly_cost_cents` on at least one technician (otherwise everything correctly costs $0).

## 1. Cost blindness — the security core (ADR-0016 §3)
| # | Step | Expected |
|---|---|---|
| 1.1 | As a **technician**, open a job and log 90 min + 12 mi | Saves fine; card shows totals and **no money anywhere** |
| 1.2 | Inspect the raw JSON of `GET /api/work-orders/[id]/time-entries` as a technician | **No** `hourly_cost_cents`, **no** `cost_cents` — fields structurally absent, not blanked |
| 1.3 | Same for mileage + expenses as a technician | No `rate_cents_per_mile`, `cost_cents`, `amount_cents`, `markup_percent`, `billable_amount_cents` |
| 1.4 | As a technician, `GET /api/work-orders/[id]/costing` | **403** — no redacted variant of the summary exists |
| 1.5 | As **office staff**, same summary request | **403** (office staff do billing but never see cost/margin) |
| 1.6 | As **tenant admin**, same | 200 with full breakdown + margin |
| 1.7 | As a technician, POST an expense with `amount_cents: 999999, billable: true` | Stored as **amount 0, non-billable** — a cost-blind caller cannot author a price |

## 2. Server-priced entries (client never sets a price)
| # | Step | Expected |
|---|---|---|
| 2.1 | POST a time entry with an injected `cost_cents`/`hourly_cost_cents` in the body | Ignored — schema doesn't accept them; cost computed from the server-held rate |
| 2.2 | Tech has `hourly_cost_cents = 6000`, log 90 min | `cost_cents = 9000` ($90) |
| 2.3 | Tech has **no** rate, tenant fallback = 4000, log 60 min | `cost_cents = 4000` (fallback used — not $0) |
| 2.4 | Log 12.4 mi at 67c/mi | `cost_cents = 831` (rounded once) |
| 2.5 | Log 7 min @ $50/hr | `cost_cents = 583` (583.33 → 583, single rounding) |

## 3. Frozen rate snapshots (ADR-0016 §1)
| # | Step | Expected |
|---|---|---|
| 3.1 | Log time at $50/hr. Raise the tech's rate to $80/hr. Re-open the job. | The existing entry still costs **$50/hr** — history did not move |
| 3.2 | Edit that entry's minutes after the raise | Re-priced at the entry's **frozen $50/hr**, not $80 |
| 3.3 | Change the tenant mileage rate, then edit an old mileage entry's miles | Re-priced at the entry's frozen rate |
| 3.4 | Change a rate | Written to the audit log (`costing.rates_updated` / `costing.technician_rate_updated`) |

## 4. Derived rollup, never incremented (ADR-0016 §2)
| # | Step | Expected |
|---|---|---|
| 4.1 | Add 3 time entries + 1 mileage + 1 expense | `work_orders.actual_cost_cents` = sum of all `cost_cents` + expense `amount_cents` |
| 4.2 | Delete one entry | Total **recomputed downward** correctly (an increment-based impl would leave it stale) |
| 4.3 | Manually corrupt `actual_cost_cents` in the DB, then add any entry | Value **self-heals** to the true rollup |
| 4.4 | Expense marked billable with markup | `actual_cost_cents` counts the **amount paid**, not the billable amount |

## 5. Margin
| # | Step | Expected |
|---|---|---|
| 5.1 | Contract $500, cost $146.70 | Margin $353.30, ~70.7% |
| 5.2 | Cost exceeds contract | **Negative** margin shown in red |
| 5.3 | Work order with **no** contract value | Margin % renders **"—" / "No contract value set"**, NOT 0% |
| 5.4 | Contract exactly equals cost | Renders **0.0%** (distinct from 5.3) |

## 6. Ownership & authorization
| # | Step | Expected |
|---|---|---|
| 6.1 | Technician logs against a work order **not** assigned to them | 404 |
| 6.2 | Technician on a **visit** of a job they don't lead | Allowed (multi-tech jobs) |
| 6.3 | Technician POSTs `technician_id` of a colleague | Ignored — forced to their own id |
| 6.4 | Technician edits a colleague's entry | 404 (same generic response as not-found — no existence oracle) |
| 6.5 | Tenant admin edits anyone's entry | Allowed |
| 6.6 | **Read-only owner** attempts to log or edit | 403 (view ≠ write) |
| 6.7 | Office staff attempts to PATCH an expense `amount_cents` | 403 (must be able to see cost to author it) |
| 6.8 | Cross-tenant id on any costing route | 404 |

## 7. Validation bounds (mirror the DB CHECKs)
| # | Step | Expected |
|---|---|---|
| 7.1 | minutes = 0, negative, 1441, or fractional | 422 |
| 7.2 | miles = 0, negative, or > 2000 | 422 |
| 7.3 | Time entry with `started_at` but no `ended_at` | 422 |
| 7.4 | Timer range where `ended_at <= started_at` | 422 |
| 7.5 | Expense with a bad `incurred_on` format | 422 |

## 8. UI
| # | Step | Expected |
|---|---|---|
| 8.1 | Owner opens a work order | Job Costing panel visible with breakdown + entries |
| 8.2 | Technician/office staff open the same work order | Panel **absent** (and the API would 403 regardless) |
| 8.3 | Owner adds an expense via the modal | Dollars input → integer cents on the wire; totals refresh |
| 8.4 | Billable expenses exist | Amber note: not added to any invoice automatically |
| 8.5 | Tech card while the job is locked/submitting | Logging disabled |

## 9. Regression gate
`npx tsc --noEmit` clean · `npx next lint` no new errors · `npx vitest run` all green · `npm run build` succeeds.
