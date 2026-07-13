/**
 * Append-only audit log helper, writing to the (now-extended) user_activity_log
 * table. Centralizing this in one function means every call site gets the
 * same redaction and never-fatal behavior — an audit-log write failure must
 * never break the action it's recording (see docs/audits/security-audit.md
 * "Audit logs" — the table exists but previously had one call site).
 */

import { db } from "@/lib/db/client";
import { logger } from "@/lib/security/logger";

export type AuditActionType =
  | "invitation.created"
  | "invitation.accepted"
  | "invitation.resent"
  | "password.reset_requested"
  | "password.reset_completed"
  | "password.admin_reset"
  | "user.role_changed"
  | "user.deactivated"
  | "user.reactivated"
  | "user.deleted"
  | "estimate.lock_override"
  | "work_order.deleted"
  | "recurring_schedule.deleted"
  | "file.uploaded"
  | "file.deleted"
  | "ghl.credential_replaced"
  | "report.exported"
  // Pricebook (Phase 2) — price/cost changes are financially sensitive
  | "pricebook.category_created"
  | "pricebook.category_updated"
  | "pricebook.category_archived"
  | "pricebook.category_restored"
  | "pricebook.item_created"
  | "pricebook.item_updated"
  | "pricebook.item_archived"
  | "pricebook.item_restored"
  | "pricebook.bundle_updated"
  | "pricebook.exported"
  // Estimates (Phase 3)
  | "estimate.created"
  | "estimate.updated"
  | "estimate.sent"
  | "estimate.send_failed"
  | "estimate.accepted"
  | "estimate.declined"
  | "estimate.voided"
  | "estimate.override"
  | "estimate.converted"
  | "estimate.token_revoked";

export interface AuditEntry {
  tenantId: string;
  /** null for unauthenticated/customer-originated events (e.g. public estimate accept). */
  userId: string | null;
  actionType: AuditActionType;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  source?: string;
}

const METADATA_REDACT_KEYS = new Set(["password", "password_hash", "token", "token_hash", "secret"]);

function redactMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    out[k] = METADATA_REDACT_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await db.from("user_activity_log").insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId,
      action_type: entry.actionType,
      description: entry.description,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: redactMetadata(entry.metadata) ?? null,
      request_id: entry.requestId ?? null,
      source: entry.source ?? "api",
    });
    if (error) {
      logger.error("[audit] insert failed", { actionType: entry.actionType, error: error.message });
    }
  } catch (err) {
    logger.error("[audit] insert threw", {
      actionType: entry.actionType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
