/**
 * Completion payload webhook → GHL Inbound Webhook trigger (Phase 12, ADR-0018).
 *
 * The client's GHL account runs a Google-review-request workflow triggered by
 * an Inbound Webhook. When a work order completes, ServiceOps POSTs this
 * payload to the tenant-configured URL (tenants.ghl_completion_webhook_url).
 * ServiceOps only reports the operational fact — GHL owns all customer
 * messaging (product boundary).
 *
 * buildCompletionPayload is pure and unit-tested. Delivery failures are
 * enqueued in the durable GHL outbox (job_type 'completion_webhook') and
 * retried with backoff by the drain cron.
 */

import type { WorkOrderWithRelations } from "@/types/work-order";

export interface CompletionWebhookPayload {
  event: "work_order.completed";
  /** GHL identifiers for contact/opportunity matching in the workflow. */
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;

  work_order_number: string;
  work_order_title: string;
  service_category: string;

  customer_name: string;
  property_address: string;

  completed_at: string;         // ISO
  completed_by: string | null;  // technician display name
  completion_message: string | null;

  tenant_name: string | null;
  source: "serviceops";
}

/** Pure. Flat-ish on purpose — GHL's inbound-webhook field mapper favors flat keys. */
export function buildCompletionPayload(
  wo: WorkOrderWithRelations,
  tenantName?: string | null,
  completedAtFallback?: string
): CompletionWebhookPayload {
  return {
    event: "work_order.completed",
    ghl_contact_id: wo.ghl_contact_id ?? null,
    ghl_opportunity_id: wo.ghl_opportunity_id ?? null,

    work_order_number: wo.wo_number,
    work_order_title: wo.title,
    service_category: wo.service_category,

    customer_name: wo.property_customer_name,
    property_address: wo.property_address,

    completed_at: wo.tech_completed_at ?? completedAtFallback ?? new Date().toISOString(),
    completed_by: wo.tech_completed_by ?? null,
    completion_message: wo.tech_completion_message ?? null,

    tenant_name: tenantName ?? null,
    source: "serviceops",
  };
}

const WEBHOOK_TIMEOUT_MS = 10_000;

export type WebhookSendResult = { ok: true; status: number } | { ok: false; status?: number; error: string };

/**
 * POST the payload to the GHL inbound-webhook URL. Only https URLs are ever
 * sent (the settings validator enforces this too — defense in depth against a
 * mis-set internal URL becoming an SSRF vector). 2xx = delivered.
 */
export async function postCompletionWebhook(
  url: string,
  payload: CompletionWebhookPayload | Record<string, unknown>
): Promise<WebhookSendResult> {
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, error: "Webhook URL must be https" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  } finally {
    clearTimeout(timer);
  }
}
