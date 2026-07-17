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
  | "estimate.token_revoked"
  // Scheduling / dispatch (Phase 4)
  | "visit.assigned"
  | "visit.reassigned"
  | "visit.rescheduled"
  | "visit.route_reordered"
  | "blocked_time.created"
  | "blocked_time.deleted"
  | "recurring.paused"
  | "recurring.resumed"
  | "recurring.occurrence_skipped"
  // Work-order project expansion (Phase 5)
  | "work_order.archived"
  | "work_order.restored"
  | "work_order.closed"
  | "work_order.reopened"
  | "work_order.cancelled"
  | "work_order.child_created"
  | "work_order_task.created"
  | "work_order_task.updated"
  | "work_order_task.deleted"
  | "work_order_attachment.uploaded"
  | "work_order_attachment.deleted"
  | "checklist_template.created"
  | "checklist_template.updated"
  | "checklist_template.archived"
  | "completion_requirement_rule.updated"
  // Change orders (Phase 5)
  | "change_order.created"
  | "change_order.updated"
  | "change_order.sent"
  | "change_order.send_failed"
  | "change_order.accepted"
  | "change_order.rejected"
  | "change_order.voided"
  | "change_order.override"
  | "change_order.contract_value_applied"
  | "change_order.schedule_impact_applied"
  | "change_order.token_revoked"
  // Invoices & payments (Phase 6)
  | "invoice.created"
  | "invoice.updated"
  | "invoice.sent"
  | "invoice.send_failed"
  | "invoice.voided"
  | "invoice.transitioned"
  | "invoice.token_revoked"
  | "payment.recorded"
  | "payment.refunded"
  | "payment.credited"
  | "stripe.onboarding_started"
  | "stripe.account_updated"
  | "reconciliation.run"
  | "reconciliation.finding_resolved"
  // Customer portal (Phase 7)
  | "portal_user.invited"
  | "portal_user.updated"
  | "portal_user.access_revoked"
  | "portal_user.reinvited"
  | "portal_user.sessions_revoked"
  // Job costing (Phase 9). Rate changes are compensation-adjacent and
  // forward-only (they never rewrite historical entries), so they're audited.
  | "costing.rates_updated"
  | "costing.technician_rate_updated";

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
