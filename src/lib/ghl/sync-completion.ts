// Outbound sync: work order COMPLETED → GHL opportunity status "won".
//
// Called fire-and-forget from the PATCH /api/work-orders/[id] route handler
// after a successful COMPLETED transition. Must never throw — the HTTP
// response has already been sent (or is about to be) and the caller does not
// await this function.
//
// On success: logs confirmation.
// On GHL failure: logs error, flags ghl_sync_failed on the work order,
//                 enqueues item for future retry.

import type { WorkOrderWithRelations } from "@/types/work-order";
import { updateWorkOrder } from "@/lib/db/queries/work-orders";
import { getTenantById } from "@/lib/db/queries/tenants";
import { updateOpportunity } from "./client";
import { enqueueGhlSync } from "./sync-outbox";
import { buildCompletionPayload, postCompletionWebhook } from "./completion-webhook";

/**
 * Phase 12 (ADR-0018): POST the completion payload to the tenant's GHL
 * Inbound Webhook URL (their review-request workflow trigger). Independent of
 * the opportunity→won sync: fires even for manually-created work orders with
 * no GHL opportunity, and a failure in one never blocks the other. Skipped
 * silently when no URL is configured. Durable via the outbox on failure.
 */
async function sendCompletionPayload(workOrder: WorkOrderWithRelations, tag: string): Promise<void> {
  try {
    const tenant = await getTenantById(workOrder.tenant_id);
    const url = (tenant as { ghl_completion_webhook_url?: string | null } | undefined)?.ghl_completion_webhook_url;
    if (!url) return; // not configured — not an error

    const payload = buildCompletionPayload(workOrder, tenant?.name ?? null);
    const result = await postCompletionWebhook(url, payload);

    if (result.ok) {
      console.log(`${tag} completion webhook delivered (${result.status})`);
      return;
    }

    console.error(`${tag} completion webhook failed: ${result.error} — enqueueing for retry`);
    await enqueueGhlSync({
      type: "completion_webhook",
      ghl_opportunity_id: workOrder.ghl_opportunity_id ?? "",
      work_order_id: workOrder.id,
      tenant_id: workOrder.tenant_id,
      payload: { url, body: payload as unknown as Record<string, unknown> },
      lastError: result.error,
    });
  } catch (err) {
    console.error(`${tag} completion webhook unexpected error:`, err);
  }
}

export async function syncCompletionToGhl(
  workOrder: WorkOrderWithRelations
): Promise<void> {
  const tag = `[ghl/sync-completion wo=${workOrder.id}]`;

  // Payload webhook first — it does NOT require a GHL opportunity link
  // (manually-created jobs still notify the review workflow; the payload
  // carries the customer name/address for matching).
  await sendCompletionPayload(workOrder, tag);

  // Work order was created manually in ServiceOps — no GHL link to sync.
  if (!workOrder.ghl_opportunity_id) {
    console.log(`${tag} No ghl_opportunity_id — opportunity sync skipped`);
    return;
  }

  console.log(
    `${tag} Syncing to GHL — setting opportunity ${workOrder.ghl_opportunity_id} → "won"`
  );

  const result = await updateOpportunity(workOrder.ghl_opportunity_id, {
    status: "won",
  });

  if (result.ok) {
    console.log(
      `${tag} GHL opportunity ${workOrder.ghl_opportunity_id} updated to "won" ` +
      `— sync complete`
    );

    // Clear any previous sync failure flag now that we succeeded.
    if (workOrder.ghl_sync_failed) {
      await updateWorkOrder(workOrder.id, { ghl_sync_failed: false }, workOrder.tenant_id);
    }

    return;
  }

  // ── GHL call failed ────────────────────────────────────────────────────────
  console.error(
    `${tag} GHL sync failed | ` +
    `status=${result.status ?? "network_error"} ` +
    `retries=${result.retriesUsed} | ` +
    `error: ${result.error}`
  );

  // Enqueue for durable retry (ghl_sync_outbox table, drained by
  // /api/cron/drain-ghl-outbox — see src/lib/ghl/sync-outbox.ts).
  await enqueueGhlSync({
    type: "opportunity_won",
    ghl_opportunity_id: workOrder.ghl_opportunity_id,
    work_order_id: workOrder.id,
    tenant_id: workOrder.tenant_id,
    payload: { status: "won" },
    lastError: result.error,
  });

  // Flag the work order so the admin dashboard can surface it.
  await updateWorkOrder(workOrder.id, { ghl_sync_failed: true }, workOrder.tenant_id);
  console.warn(`${tag} ghl_sync_failed=true set on work order ${workOrder.id}`);
}
