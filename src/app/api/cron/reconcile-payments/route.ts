import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runReconciliation } from "@/lib/payments/reconcile";
import { logger } from "@/lib/security/logger";

/**
 * GET /api/cron/reconcile-payments
 * Scheduled payment reconciliation (Phase 6, ADR-0012). Cross-checks the
 * ledger against invoice aggregates and Stripe, flags mismatches, and marks
 * overdue invoices. Fails closed without CRON_SECRET. Configure in vercel.json
 * (daily on the Hobby plan).
 */

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("[cron/reconcile-payments] CRON_SECRET not configured — rejecting");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeEquals(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runReconciliation("cron");
    logger.info("[cron/reconcile-payments] complete", result as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron/reconcile-payments] failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}
