import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

/**
 * GET /api/health
 * Liveness/readiness endpoint (Phase 1: "Health and readiness endpoints
 * without secrets"). No auth required, no secret values or internal error
 * detail in the response body — only boolean reachability.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;

  try {
    const { error } = await db.from("tenants").select("id").limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    database: dbOk ? "reachable" : "unreachable",
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
