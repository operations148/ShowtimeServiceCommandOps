# ADR-0002 — Identity Model: Tenant-Scoped Email, Not Global Identity

**Status**: Accepted
**Date**: 2026-07-11
**Context**: Phase 0 security-audit finding M18; Phase 1 spec requires this be resolved explicitly rather than left ambiguous.

## Context

`users.email` is unique only per-tenant (`UNIQUE(tenant_id, email)`, migration `20260506000003`), but the login `authorize()` callback queried by email alone with no tenant/slug disambiguation. If the same email were ever active in two tenants, Supabase's `.single()`/`.maybeSingle()` lookup has no way to know which tenant the person is trying to log into.

Two models were considered, per the Phase 1 prompt's explicit framing:

1. **Global identity + organization memberships**: one `users` row per person, a separate `memberships` join table for tenant+role pairs. Standard for scalable multi-tenant SaaS where the same person legitimately belongs to multiple organizations (e.g., a contractor who works with two different service companies).
2. **Tenant-scoped identity** (current model, kept): a `users` row is inherently tied to exactly one tenant. The same email *can* exist across tenants as fully separate accounts, but the application never needs to resolve "which tenant does this login belong to" ambiguously because it doesn't yet support a person holding memberships in more than one tenant.

## Decision

**Keep the tenant-scoped identity model.** Do not build global identity + memberships in Phase 1.

Rationale:
- ServiceOps is not yet a self-serve multi-tenant platform where the same person plausibly holds accounts across multiple independent tenants — it is one production tenant (Showtime Pool Service) with a `PLATFORM_OWNER` role reserved for future platform administration (Phase 10). Building a memberships model now would be solving a problem that doesn't exist yet, ahead of the phase (10) that actually introduces multi-tenant onboarding.
- The practical risk M18 identified was **not** silent cross-tenant data leakage — Supabase's `.maybeSingle()`/`.single()` correctly errors (returns no row / an ambiguity error) rather than picking one arbitrarily when multiple rows match, so a duplicate email across tenants breaks login for that email rather than leaking data to the wrong tenant. That's a correctness/availability bug, not a security bypass, and is now further mitigated by Phase 1's rate limiting and structured logging making such a collision immediately visible in logs rather than silently mysterious.
- The fix applied in Phase 1 (see `src/lib/auth/config.ts`) is to keep the login query as `email + is_active` (unchanged in shape) but document this constraint explicitly: **operationally, do not create two active users with the same email across two different tenants.** This is enforced socially/by admin process for now, not by a global uniqueness constraint, since a global constraint would itself need the memberships model to make sense (a global email uniqueness constraint would make it impossible for the same real person to legitimately have separate logins at two client companies — the opposite of what's wanted at MVP scale).

## Consequences

- If/when Phase 10 (platform administration, white-label) needs the same person to hold roles across multiple tenants, this ADR is superseded and the migration to global identity + memberships happens then, with its own ADR documenting the migration path (existing `users` rows become the first membership row per person).
- Until then, `getTenantId(session)` + tenant-scoped queries remain the correct and sufficient tenant-isolation mechanism — this ADR does not change any authorization code, only records the deliberate choice not to build memberships prematurely.
