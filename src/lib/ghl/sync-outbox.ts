/**
 * Durable GHL outbound sync outbox (security-audit L7 — replaces the
 * in-memory retry-queue.ts, whose items were lost on every cold start /
 * redeploy). Backed by the ghl_sync_outbox table (migration 20260711000001).
 *
 * enqueueGhlSync() is called from the fire-and-forget sync paths when a GHL
 * call fails. drainGhlSyncOutbox() is called from the drain cron route and
 * retries pending items with exponential backoff, moving anything that
 * exhausts MAX_ATTEMPTS to a dead_letter state instead of retrying forever.
 */

import { db } from "@/lib/db/client";
import { updateOpportunity, createTask, type CreateTaskData } from "./client";
import { updateWorkOrder } from "@/lib/db/queries/work-orders";
import { markEstimateHandoffSentToGHL } from "@/lib/db/queries/estimate-handoffs";
import { EstimateHandoffStatus } from "@/types/work-order";
import { logger } from "@/lib/security/logger";

export type GHLSyncJobType = "opportunity_won" | "task_create";

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_SECONDS = 60; // attempt 2 retries ~2 min later, attempt 3 ~4 min, etc. (capped)
const MAX_BACKOFF_SECONDS = 60 * 60; // 1 hour cap

export interface EnqueueGhlSyncInput {
  type: GHLSyncJobType;
  ghl_opportunity_id: string;
  work_order_id: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  lastError: string;
}

export async function enqueueGhlSync(item: EnqueueGhlSyncInput): Promise<void> {
  const { error } = await db.from("ghl_sync_outbox").insert({
    tenant_id: item.tenant_id,
    job_type: item.type,
    ghl_opportunity_id: item.ghl_opportunity_id,
    work_order_id: item.work_order_id,
    payload: item.payload,
    last_error: item.lastError,
  });

  if (error) {
    logger.error("[ghl/sync-outbox] enqueue failed", {
      type: item.type,
      opportunityId: item.ghl_opportunity_id,
      error: error.message,
    });
    return;
  }

  logger.warn("[ghl/sync-outbox] enqueued for retry", {
    type: item.type,
    opportunityId: item.ghl_opportunity_id,
    workOrderId: item.work_order_id,
  });
}

interface OutboxRow {
  id: string;
  tenant_id: string;
  job_type: GHLSyncJobType;
  ghl_opportunity_id: string;
  work_order_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

function computeBackoffSeconds(attempts: number): number {
  return Math.min(BASE_BACKOFF_SECONDS * Math.pow(2, attempts), MAX_BACKOFF_SECONDS);
}

async function processOne(row: OutboxRow): Promise<{ ok: boolean; error?: string }> {
  if (row.job_type === "opportunity_won") {
    const result = await updateOpportunity(row.ghl_opportunity_id, { status: "won" });
    if (result.ok && row.work_order_id) {
      await updateWorkOrder(row.work_order_id, { ghl_sync_failed: false }, row.tenant_id);
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  if (row.job_type === "task_create") {
    const result = await createTask(row.ghl_opportunity_id, row.payload as unknown as CreateTaskData);
    if (result.ok && row.work_order_id) {
      await Promise.all([
        updateWorkOrder(row.work_order_id, { estimate_handoff_status: EstimateHandoffStatus.SENT_TO_GHL }, row.tenant_id),
        markEstimateHandoffSentToGHL(row.work_order_id, row.tenant_id, result.data.id),
      ]);
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  return { ok: false, error: `Unknown job_type: ${row.job_type}` };
}

export interface DrainResult {
  processed: number;
  succeeded: number;
  deadLettered: number;
}

/** Processes up to `limit` ready outbox items. Never throws. */
export async function drainGhlSyncOutbox(limit = 25): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, succeeded: 0, deadLettered: 0 };

  const { data: rows, error: fetchError } = await db
    .from("ghl_sync_outbox")
    .select("id, tenant_id, job_type, ghl_opportunity_id, work_order_id, payload, attempts")
    .in("status", ["pending"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    logger.error("[ghl/sync-outbox] drain fetch failed", { error: fetchError.message });
    return result;
  }

  for (const rawRow of rows ?? []) {
    const row = rawRow as unknown as OutboxRow;
    result.processed++;

    // Claim the row (processing) so a concurrent drain invocation doesn't
    // double-process it.
    await db.from("ghl_sync_outbox").update({ status: "processing" }).eq("id", row.id);

    const outcome = await processOne(row);

    if (outcome.ok) {
      await db.from("ghl_sync_outbox").update({ status: "done" }).eq("id", row.id);
      result.succeeded++;
      continue;
    }

    const nextAttempts = row.attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await db
        .from("ghl_sync_outbox")
        .update({ status: "dead_letter", attempts: nextAttempts, last_error: outcome.error ?? "unknown error" })
        .eq("id", row.id);
      result.deadLettered++;
      logger.error("[ghl/sync-outbox] moved to dead_letter after max attempts", {
        id: row.id, opportunityId: row.ghl_opportunity_id, attempts: nextAttempts,
      });
      continue;
    }

    const nextAttemptAt = new Date(Date.now() + computeBackoffSeconds(nextAttempts) * 1000).toISOString();
    await db
      .from("ghl_sync_outbox")
      .update({
        status: "pending",
        attempts: nextAttempts,
        last_error: outcome.error ?? "unknown error",
        next_attempt_at: nextAttemptAt,
      })
      .eq("id", row.id);
  }

  return result;
}
