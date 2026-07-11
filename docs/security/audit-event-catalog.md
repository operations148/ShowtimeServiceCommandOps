# Audit Event Catalog

_Every `action_type` value ever written to `user_activity_log` via `recordAuditEvent()` (`src/lib/security/audit.ts`), what triggers it, and what's in `metadata`. Append-only table; no UPDATE/DELETE policy exists (see RLS in `supabase/migrations/20260515000001_create_user_activity_log.sql`)._

## Live event types (real call sites exist)

| `action_type` | Trigger | Entity | Notes |
|---|---|---|---|
| `invitation.created` | `POST /api/team` creates a new team member | `user` (the invitee) | Fires after the invite email is queued |
| `invitation.resent` | `POST /api/team/[id]/resend-invite` | `user` | Prior unaccepted invitations are expired first |
| `invitation.accepted` | `POST /api/invitations/accept` succeeds | `user` | Only fires after the atomic claim + password set succeed |
| `password.reset_requested` | `POST /api/auth/password-reset/request` finds a matching active user | `user` | Does **not** fire for unknown/inactive emails (would leak account existence via the audit log itself) |
| `password.reset_completed` | `POST /api/auth/password-reset/confirm` succeeds | `user` | |
| `password.admin_reset` | Admin sets `new_password` via `PATCH /api/team/[id]` or `PATCH /api/technicians/[id]` | `user` (the target) | `userId` on the row is the *admin* performing the action, `entityId` is the target |
| `user.role_changed` | `PATCH /api/team/[id]` changes `role` | `user` | Only fires if the new role differs from the existing one |
| `user.deactivated` / `user.reactivated` | `PATCH /api/team/[id]` or `PATCH /api/technicians/[id]` toggles `is_active` | `user` | |
| `user.deleted` | `DELETE /api/team/[id]` | `user` | Requires prior deactivation (route-level guard, unchanged from before Phase 1) |
| `estimate.lock_override` | Admin overrides a locked estimate handoff via `PATCH /api/work-orders/[id]` with `{ override: true }` | `estimate_handoff` | Pre-existing, from Phase 15 work — the only call site that existed before Phase 1 |

## Reserved but not yet emitted (no call site exists)

These are valid `AuditActionType` union members with no current trigger — reserved so future phases don't need another type-union bikeshed:

| `action_type` | Intended trigger (future phase) |
|---|---|
| `work_order.deleted` | Phase 5's archive/cancel model replacing hard delete |
| `recurring_schedule.deleted` | Could retrofit onto the Phase 1 soft-delete change, not done this phase to keep the diff focused on the delete-semantics fix itself |
| `file.uploaded` / `file.deleted` | Phase 1 file-security work stopped at validation; upload/delete audit logging is a natural follow-up, not done this pass |
| `ghl.credential_replaced` | Phase 10 (per-tenant GHL credential storage, if built) |
| `report.exported` | Any future export/download feature |

## Fields

`tenant_id`, `user_id` (the actor — always a real, existing user; the table's FK constraints mean system-level events with no real actor, e.g. a misconfigured-cron-secret event, cannot be logged here and use structured `logger.*` output instead — see `docs/security/incident-response.md`), `action_type`, `description` (free text, human-readable), `entity_type`/`entity_id` (what was acted on), `metadata` (JSONB, redacted via the same key-blocklist as `src/lib/security/logger.ts` — `password`/`token`/`secret` keys are never persisted even if accidentally passed), `request_id`, `source` (defaults to `"api"`), `schema_version` (currently `1`), `created_at`.

## Redaction

`recordAuditEvent()` redacts `metadata` keys matching `password|password_hash|token|token_hash|secret` before insert — the same discipline as the structured logger, applied independently in case a future call site passes a raw credential into `metadata` by mistake.
