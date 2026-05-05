// Outbound sync: estimate_flagged visit → GHL opportunity task "Estimate Needed".
//
// Called fire-and-forget from PATCH /api/visits/[id] when estimate_flagged
// transitions to true. Must never throw — the HTTP response has already been
// sent and the caller does not await this function.
//
// On success: sets estimate_handoff_status → SENT_TO_GHL on the work order.
// On GHL failure: logs error, leaves estimate_handoff_status as FLAGGED so
//                 the dashboard can surface it to office staff.

import type { Visit } from "@/types/visit";
import { EstimateHandoffStatus } from "@/types/work-order";
import { getWorkOrderById, updateWorkOrder } from "@/lib/mock-data/store";
import { createTask } from "./client";

// Default due date offset: 24 hours from task creation.
const DUE_DATE_OFFSET_MS = 24 * 60 * 60 * 1000;

export async function syncEstimateToGhl(visit: Visit): Promise<void> {
  const tag = `[ghl/sync-estimate visit=${visit.id}]`;

  const workOrder = getWorkOrderById(visit.work_order_id);
  if (!workOrder) {
    console.error(`${tag} Work order "${visit.work_order_id}" not found — estimate sync skipped`);
    return;
  }

  if (!workOrder.ghl_opportunity_id) {
    console.log(
      `${tag} No ghl_opportunity_id on work order "${workOrder.id}" — ` +
      `GHL task creation skipped (manually created work order)`
    );
    return;
  }

  const assignedTo = process.env.GHL_DEFAULT_OFFICE_USER_ID;
  const dueDate = new Date(Date.now() + DUE_DATE_OFFSET_MS).toISOString();

  console.log(
    `${tag} Creating GHL task on opportunity ${workOrder.ghl_opportunity_id} — ` +
    `"Estimate Needed — ${workOrder.property_address}"`
  );

  const result = await createTask(workOrder.ghl_opportunity_id, {
    title: `Estimate Needed — ${workOrder.property_address}`,
    body: visit.technician_notes ?? undefined,
    assignedTo,
    dueDate,
    status: "incompleted",
  });

  if (result.ok) {
    console.log(
      `${tag} GHL task "${result.data.id}" created on opportunity ` +
      `${workOrder.ghl_opportunity_id} — setting estimate_handoff_status → SENT_TO_GHL`
    );
    updateWorkOrder(workOrder.id, {
      estimate_handoff_status: EstimateHandoffStatus.SENT_TO_GHL,
    });
    return;
  }

  // ── GHL call failed ────────────────────────────────────────────────────────
  // estimate_handoff_status stays FLAGGED — dashboard surfaces it to office staff.
  console.error(
    `${tag} GHL task creation failed | ` +
    `status=${result.status ?? "network_error"} ` +
    `retries=${result.retriesUsed} | ` +
    `error: ${result.error}`
  );
}
