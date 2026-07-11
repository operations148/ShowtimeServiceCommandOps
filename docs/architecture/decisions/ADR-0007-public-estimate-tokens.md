# ADR-0007 — Public Estimate Tokens and the Customer Decision Surface

**Status:** Accepted (Phase 3, 2026-07-12)

## Context

Phase 3 introduces the first **unauthenticated, customer-facing** surface in ServiceOps: a public estimate page where a customer views a proposal and accepts or declines it. There is no login; the link itself is the credential. This is a materially larger attack surface than anything before it (which all sat behind NextAuth + the trusted context), so its security properties are decided here explicitly.

## Decision

### 1. High-entropy token, hashed at rest

Each send issues a fresh 256-bit token (`randomBytes(32).toString("base64url")`). Only its SHA-256 hash is stored (`estimates.public_token_hash`, unique-indexed). The plaintext exists solely in the emailed URL and is never persisted or logged. This mirrors the Phase 1 invitation/password-reset design but with double the entropy because the link is longer-lived and exposes a financial document. Lookups are by hash equality on the indexed column — never by iterating rows.

### 2. Token lifecycle: expiry + revocation + re-issue

- **Expiry**: `token_expires_at` (default 30 days, capped 90). Checked on every public request.
- **Revocation**: `token_revoked_at` — set explicitly (admin "revoke link"), on override, and implicitly superseded when a resend issues a new hash.
- **Re-issue on resend**: a resend replaces the hash, invalidating the prior link.

Validity is a pure function (`checkTokenValidity`) returning a coarse reason for **server-side logging only**.

### 3. One generic error — no oracle

Every public failure (unknown token, revoked, expired, wrong tenant) returns the **same** generic 404 message. The customer is never told *why* a link failed, so the endpoint can't be used to probe which tokens exist or what state they're in.

### 4. Strict output redaction (allowlist, not denylist)

The public route serializes through `toPublicEstimate`, whose output type `PublicEstimate` structurally **cannot** carry internal fields. Never exposed: `internal_cost`/`unit_cost`, markup, `tax_category`, source pricebook pointers, `internal_notes`, `tenant_id`, GHL ids, estimator/staff ids, token hashes, IP/UA capture. A future column addition can't leak by default — it simply isn't copied. A unit test serializes a fully-populated estimate and asserts none of the secret values appear in the JSON.

### 5. Rate limiting + replay protection

- Views: `publicEstimateView` (30/min per IP). Decisions: `publicEstimateDecision` (10/hour per IP). Postgres-backed (Phase 1 limiter).
- The token IS the credential; there is no session cookie, so classic CSRF doesn't apply (an attacker would need the token). No origin check is imposed on the public POSTs for that reason.
- Decision idempotency + replay safety live in ADR-0008 (atomic status+version claim).

### 6. Tenant derivation, never tenant trust

The public resolver looks up the estimate by token hash **without tenant scoping** — there is no ambient session — and derives `tenant_id` from the found row. A cross-tenant token simply resolves to its own tenant; there is no caller-supplied tenant to confuse. All subsequent queries are scoped by that derived tenant.

## Alternatives considered

- **Signed JWT in the URL instead of an opaque token** — rejected: revocation requires a denylist anyway, and a leaked signing key would forge every estimate; an opaque random token with a DB row is simpler and revocable per-estimate.
- **Storing the token in plaintext** — rejected outright; a DB read would expose every live customer link.
- **Requiring a customer login** — rejected: contradicts the product ("secure link" flow) and GHL owns identity; a login wall would tank acceptance rates.

## Consequences

- The public surface is small (3 routes) and uniformly rate-limited, redacted, and generic-errored.
- `noindex` is set on the public page so links never enter search indexes.
- Phase 7 (customer portal) can reuse this token pattern as its baseline; if it adds authenticated customer accounts, this remains the fallback share mechanism.
