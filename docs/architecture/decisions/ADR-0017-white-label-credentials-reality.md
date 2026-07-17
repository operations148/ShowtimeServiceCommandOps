# ADR-0017 — White-Label GHL Credentials: Correct the Claim, Don't Build the Fiction

**Status:** Accepted (Phase 10, 2026-07-17)

## Context

`tenants.ghl_api_token_encrypted` has existed since the very first migration (`20260506000002_create_tenants.sql`), commented *"Encrypted GHL private integration token"*. Phase 0's audit flagged it as dead schema. Phase 10's mandate was explicit: **either** activate real per-tenant encrypted GHL credentials (true white-label) **or** correct the column/claim to reflect reality.

Verified this phase — the column is genuinely inert:
- It appears in exactly three places: the migration, `src/types/tenant.ts`, and `src/lib/db/types.ts`. **Never read. Never written.** No encryption code exists anywhere in the repo.
- Every GHL call resolves its token from a **single shared environment variable**, `GHL_PRIVATE_INTEGRATION_TOKEN` (`src/lib/ghl/client.ts`, `src/lib/ghl/ghl-api.ts`), with a single `GHL_LOCATION_ID`.

So the schema advertises a per-tenant white-label capability the product does not have. That gap is the actual risk here: a reader (or a future session) trusts the column, assumes credentials are isolated per tenant, and builds on a guarantee that was never implemented.

## Decision

**Correct the claim. Do not build per-tenant encrypted credentials in Phase 10.**

1. **The column is marked deprecated in the schema itself** (a `COMMENT ON COLUMN`), naming the reality: the product uses one shared GHL token; this column is inert and must not be read or written until a real multi-tenant credential design lands.
2. **It is NOT dropped.** Dropping is irreversible and the column is harmless while unread; a `COMMENT` carries the warning to anyone inspecting the schema (including `\d tenants` and Supabase's table editor) at zero risk. If a future phase implements real white-label, it can adopt the column rather than re-adding it.
3. **The types keep it but say so** — annotated as deprecated/never-populated, so autocomplete warns instead of misleads.
4. **The single-shared-token reality is documented** as an operational constraint, not a bug.

### Why not build it now

Real per-tenant credentials is not "one column" — it is: encryption at rest with a managed key, key rotation, a per-tenant GHL client resolver replacing the module-level singleton, migration of the existing live token, per-tenant location mapping (today `GHL_LOCATION_TO_TENANT` is an env map), and a credential-entry UI with its own permission and audit trail. That is a phase, not a task.

And it would serve **nobody today**: the product has exactly one live tenant (Showtime Pool Service). The project's own rule is *"Do NOT overbuild — ask before adding scope"* (`CLAUDE.md` §17). Building multi-tenant credential infrastructure with zero second tenants is speculative work carrying real security surface (a bad encryption/rotation design is worse than an env var), maintained for a hypothetical.

The honest sequence is: correct the record now, build it when a second tenant is actually being onboarded and the requirements are real.

## Consequences

- **The schema stops lying.** Anyone reading `tenants` sees the column is inert and why.
- **White-label remains a roadmap item, not a claimed feature.** `README`/roadmap language that implies per-tenant credentials must say "single shared GHL integration" until this changes.
- **Onboarding a second tenant is a known blocker**, not a surprise: it requires this work first. That is now written down rather than discovered mid-onboarding.
- **`GHL_LOCATION_TO_TENANT`** (env map) remains how a webhook's location resolves to a tenant — the actual multi-tenant seam today, and the natural place a real design would start.

## Alternatives considered

- **Build per-tenant encrypted credentials now** — rejected: a phase-sized security-sensitive build serving zero current tenants; classic overbuild.
- **Drop the column** — rejected: irreversible, and a future real implementation would want it back. A comment achieves the goal (stop misleading) at no risk.
- **Leave it silent** — rejected: this is precisely the failure Phase 0 catalogued (dead schema implying capability). Leaving it is how it survived 5 months.
