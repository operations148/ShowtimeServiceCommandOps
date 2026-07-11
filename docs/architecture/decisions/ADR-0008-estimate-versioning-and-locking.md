# ADR-0008 — Estimate Versioning, Locking, and Transactional Acceptance

**Status:** Accepted (Phase 3, 2026-07-12)

## Context

An estimate is a financial document that a customer approves. Once approved, the approved figures must be **immutable** and the approval **auditable**, while draft edits must remain fluid. Acceptance happens on an unauthenticated public endpoint that can be double-submitted, replayed, or hit concurrently. This ADR fixes how versions, locking, and the acceptance transaction behave.

## Decisions

### 1. One state machine, nine states

`draft → ready → sent → viewed → accepted → converted` plus `declined`, `expired`, `voided`. Defined once in `src/lib/estimates/state-machine.ts` and used everywhere (admin transitions, send, decisions). Editing is allowed only in `draft`/`ready` (`isEditable`); `converted`/`voided` are terminal. Full table + predicates are unit-tested, including that an accepted estimate can **never** transition back to draft except via an explicit, permissioned override.

### 2. `version` = optimistic-concurrency token AND the customer's contract reference

Every mutating admin write is predicated on the client-supplied `version` (stale → 409 + `currentVersion`). The public accept/decline submit carries the `version` the customer's page was rendered from; if staff edited the estimate in between, the version no longer matches and the customer is told to reload before deciding. This prevents a customer accepting figures they never saw.

### 3. Immutable version snapshots

`estimate_versions` stores a full JSONB snapshot (estimate + line items) on every draft save, at send (`version_type='sent'`), and at acceptance (`version_type='accepted'`). Snapshots are append-only and never mutated — the accepted-version row is the durable record of exactly what the customer agreed to, independent of any later edits or overrides. `(estimate_id, version)` is unique.

### 4. Transactional, idempotent acceptance

supabase-js has no multi-statement transaction, so acceptance uses an **atomic conditional UPDATE as the decision claim**:

```
UPDATE estimates SET status='accepted', accepted_*=…, locked_at=…
WHERE id=? AND tenant_id=? AND version=? AND status IN ('sent','viewed')
```

Only one concurrent submission can match (exactly one row). The loser re-reads and reports the existing decision idempotently rather than erroring or double-writing. The sequence:

1. verify version, decidable status, not expired;
2. validate selections (one-per-option-group) and recompute totals **server-side** from stored lines;
3. atomic claim (above);
4. persist selection flags + write the accepted snapshot;
5. convert to a **draft invoice**, idempotent via a partial `UNIQUE(invoices.estimate_id)` — a second/concurrent conversion hits 23505 and adopts the existing invoice, so repeated submission never yields duplicate invoices;
6. record accept + converted events.

Replaying an already-accepted token returns `{ alreadyDecided: true }` — a success, not an error, and creates nothing new. Decline is the same pattern without conversion.

### 5. Locking + permissioned override

Acceptance sets `locked_at`; the accepted document is not editable. Re-opening a locked estimate (`accepted`/`declined`/`expired`) requires the `canOverrideEstimateLock` permission **and a mandatory reason** (min 5 chars, enforced by Zod and the domain function). Override snapshots the pre-override state, bumps the version, clears the decision/lock metadata back to a clean `draft`, **revokes the outstanding public link**, and writes an audited `override` event carrying the reason. A `converted` estimate cannot be overridden — an invoice already exists (unwinding that is Phase 5's concern).

### 6. Conversion target: draft invoice, not a sent/charged one

Acceptance materialises a **draft** invoice (10% deposit computed but nothing sent, no charge). This preserves the accepted work at decision time without implying customer billing — Phase 5 owns invoice sending and deposit collection. Documented so Phase 5 doesn't double-create.

## Alternatives considered

- **A real DB transaction / stored procedure for acceptance** — would be cleaner but requires moving logic into Postgres functions; the atomic-conditional-UPDATE claim + the UNIQUE conversion guard achieve the same no-duplicate guarantee within the existing service-role JS architecture. Revisit if acceptance grows more multi-table side effects.
- **Mutating the estimate row in place as the only history** — rejected; immutable snapshots are required to prove what was accepted after later edits/overrides.
- **Auto-sending the invoice on acceptance** — rejected; billing is an external-action gate (Phase 5), and auto-charging on a public endpoint is unacceptable.

## Consequences

- Concurrent/duplicate acceptance is provably safe (one claim wins; conversion is unique-guarded).
- The accepted snapshot + event log give a complete, tamper-evident approval trail.
- Overrides are rare, permissioned, reasoned, and audited — not a silent edit path around the lock.
