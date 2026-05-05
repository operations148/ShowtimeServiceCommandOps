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
import { updateWorkOrder } from "@/lib/mock-data/store";
import { updateOpportunity } from "./client";
import { enqueueGhlSync } from "./retry-queue";

export async function syncCompletionToGhl(
  workOrder: WorkOrderWithRelations
): Promise<void> {
  const tag = `[ghl/sync-completion wo=${workOrder.id}]`;

  // Work order was created manually in ServiceOps — no GHL link to sync.
  if (!workOrder.ghl_opportunity_id) {
    console.log(`${tag} No ghl_opportunity_id — outbound sync skipped`);
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
      updateWorkOrder(workOrder.id, { ghl_sync_failed: false });
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

  // Enqueue for future retry (production: persistent queue + background worker).
  enqueueGhlSync({
    type: "opportunity_won",
    ghl_opportunity_id: workOrder.ghl_opportunity_id,
    work_order_id: workOrder.id,
    tenant_id: workOrder.tenant_id,
    payload: { status: "won" },
    lastError: result.error,
  });

  // Flag the work order so the admin dashboard can surface it.
  const flagResult = updateWorkOrder(workOrder.id, { ghl_sync_failed: true });
  if (!flagResult.ok) {
    // Should be unreachable — we just operated on this record.
    console.error(`${tag} Could not set ghl_sync_failed flag: work order no longer in store`);
  } else {
    console.warn(`${tag} ghl_sync_failed=true set on work order ${workOrder.id}`);
  }
}
