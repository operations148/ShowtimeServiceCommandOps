import { db } from "@/lib/db/client";

/**
 * Cron run observability (Phase 4). Every cron invocation opens a run row,
 * then finalizes it with totals / per-tenant results / error. A crashed run
 * is left in status='running' (visible as a stuck run) rather than silently
 * vanishing.
 */

export async function startCronRun(jobName: string): Promise<string | null> {
  const { data, error } = await db
    .from("cron_runs")
    .insert({ job_name: jobName, status: "running" })
    .select("id")
    .single();
  if (error) {
    console.error("[cron] startCronRun:", error.message);
    return null; // don't let observability failure block the job
  }
  return (data as { id: string }).id;
}

export async function finishCronRun(
  runId: string | null,
  outcome:
    | { status: "succeeded"; totals: Record<string, unknown>; byTenant: Record<string, unknown> }
    | { status: "failed"; error: string }
): Promise<void> {
  if (!runId) return;
  const patch: Record<string, unknown> = { status: outcome.status, finished_at: new Date().toISOString() };
  if (outcome.status === "succeeded") {
    patch.totals = outcome.totals;
    patch.by_tenant = outcome.byTenant;
  } else {
    patch.error = outcome.error;
  }
  const { error } = await db.from("cron_runs").update(patch).eq("id", runId);
  if (error) console.error("[cron] finishCronRun:", error.message);
}
