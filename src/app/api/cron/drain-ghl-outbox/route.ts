import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { drainGhlSyncOutbox } from "@/lib/ghl/sync-outbox";
import { logger } from "@/lib/security/logger";

/**
 * GET /api/cron/drain-ghl-outbox
 * Drains the durable GHL sync outbox (security-audit L7 / master-plan Phase 1
 * "durable webhook and integration work"). Intended to run every few minutes
 * via Vercel Cron — configure alongside generate-visits in vercel.json.
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
    logger.error("[cron/drain-ghl-outbox] CRON_SECRET is not configured — rejecting request");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeEquals(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainGhlSyncOutbox(25);
    logger.info("[cron/drain-ghl-outbox] complete", result as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron/drain-ghl-outbox] failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Drain failed" }, { status: 500 });
  }
}
