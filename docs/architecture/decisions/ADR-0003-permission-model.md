# ADR-0003 — Permission Model: Extend the Existing Flag Map, Don't Replace It

**Status**: Accepted
**Date**: 2026-07-11
**Context**: Phase 0 found a flat 9-boolean `RolePermissions` map; the Phase 1 spec asks for ~15 granular permission keys (work-order read/create/update/assign/archive, invoice read/manage, payment refund, etc.).

## Decision

Extend `src/config/roles.ts`'s `RolePermissions` interface with 9 new named flags (`canSendEstimateEmail`, `canOverrideEstimateLock`, `canManageInvoices`, `canRefundPayments`, `canApproveTime`, `canViewFinancialReports`, `canInviteTeamMembers`, `canChangeTeamRoles`, `canReadAuditLog`), computed consistently with each role's existing coarse permissions. Apply the new flags where Phase 0 found a concretely broken route (`canSendEstimateEmail` on `send-estimate`, fixing H4). Do **not** retrofit all 35 existing routes to the finer-grained model in this pass.

## Rationale

Phase 0's own route-by-route audit independently verified that the existing coarse 9-flag model already produces the *correct* allow/deny decision for every route except the one fixed in this phase (`send-estimate`, which used no permission check at all rather than a wrong one). Retrofitting, say, `canViewAllWorkOrders` into four separate `workOrderRead`/`workOrderCreate`/`workOrderUpdate`/`workOrderArchive` flags across every work-order route would touch a large surface area for zero behavioral change today — every role's effective access stays identical, since the coarse flag and the four fine flags would be set identically for every role under the current product requirements.

The value of granular permissions is real but forward-looking: Phase 2's pricebook needs a `canViewCost` distinction technicians/portal users shouldn't get; Phase 6's invoices need `canRefundPayments` distinct from `canManageInvoices`; Phase 10's audit log needs `canReadAuditLog` as its own gate. These are exactly the 9 flags added here — available for the phases that actually need the distinction, without a second permission-model redesign later.

## Consequences

- `RolePermissions` now has 18 total flags. Every role's block in `rolePermissions` sets all 18 explicitly (no defaults/inheritance) — this is intentional: an incomplete role definition fails TypeScript compilation rather than silently defaulting a new permission to an unsafe value.
- Future phases that introduce a new resource type (change orders, time entries, expenses) should add named flags following the same pattern rather than reusing an existing coarse flag that happens to produce the right answer today but wouldn't generalize.
- This is deliberately **not** a move to a fully data-driven/DB-backed permission system (e.g., a `permissions` table with per-tenant custom roles) — that's a bigger architectural decision (custom roles per tenant, admin UI to manage them) outside Phase 1's scope and not requested by the current 5-role model.
