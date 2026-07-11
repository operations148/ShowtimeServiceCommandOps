import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db/client";
import { generateAllActiveVisits } from "@/lib/scheduling/generate-visits";
import { startCronRun, finishCronRun } from "@/lib/db/queries/cron-runs";
import { logger } from "@/lib/security/logger";

/**
 * GET /api/cron/generate-visits
 * Called by Vercel Cron every Monday at 6 AM UTC.
 * Generates work orders + visits for all active recurring schedules
 * across all tenants for the next 4 weeks.
 *
 * Protected by CRON_SECRET header. Set CRON_SECRET in Vercel env vars
 * and configure the same value in vercel.json cron authorization.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Fail CLOSED when the secret is unset (security-audit H3 — the previous
  // `if (secret && authHeader !== ...)` check short-circuited to `false` and
  // let every request through unauthenticated when CRON_SECRET was missing).
  if (!secret) {
    // user_activity_log requires a real tenant/user FK, so a system-level
    // misconfiguration like this is recorded via the structured logger
    // (ingested by the platform's log sink) rather than the tenant audit log.
    logger.error("[cron/generate-visits] CRON_SECRET is not configured — rejecting request");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeEquals(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("generate-visits");

  try {
    // Fetch all tenant IDs
    const { data: tenants, error: tenantError } = await db
      .from("tenants")
      .select("id");

    if (tenantError) throw new Error(`Failed to fetch tenants: ${tenantError.message}`);

    // Per-tenant isolation: one tenant's failure must not abort the whole run
    // (safe retry — generation is idempotent, so re-running only fills gaps).
    const results: Record<string, { created: number; skipped: number; schedules: number; error?: string }> = {};

    for (const tenant of tenants ?? []) {
      try {
        results[tenant.id] = await generateAllActiveVisits(tenant.id, 4);
      } catch (tenantErr) {
        const message = tenantErr instanceof Error ? tenantErr.message : String(tenantErr);
        logger.error("[cron/generate-visits] tenant failed", { tenantId: tenant.id, error: message });
        results[tenant.id] = { created: 0, skipped: 0, schedules: 0, error: message };
      }
    }

    const totals = Object.values(results).reduce(
      (acc, r) => ({
        created:   acc.created   + r.created,
        skipped:   acc.skipped   + r.skipped,
        schedules: acc.schedules + r.schedules,
      }),
      { created: 0, skipped: 0, schedules: 0 }
    );

    console.log(`[cron] generate-visits complete — ${totals.schedules} schedules, ${totals.created} created, ${totals.skipped} skipped`);

    await finishCronRun(runId, { status: "succeeded", totals, byTenant: results });
    return NextResponse.json({ ok: true, runId, totals, byTenant: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] generate-visits failed:", err);
    await finishCronRun(runId, { status: "failed", error: message });
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
