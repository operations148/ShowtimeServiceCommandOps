import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";
import { UpdateCostingRatesSchema } from "@/lib/validation/costing";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// GET/PATCH /api/settings/costing-rates
//
// The tenant's mileage rate and the fallback labor cost. Owner-only
// (canManageJobCosting) — these ARE cost data, and the labor fallback is
// compensation-adjacent.
//
// Changing a rate is FORWARD-ONLY: existing entries keep their frozen snapshot,
// so last quarter's margin can't move because payroll changed today
// (ADR-0016 §1). Audited for the same reason.
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requirePermission("canManageJobCosting");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { data, error } = await db
    .from("tenants")
    .select("default_mileage_rate_cents, default_labor_cost_cents")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[api] GET costing-rates:", error.message);
    return NextResponse.json({ error: "Failed to load rates" }, { status: 500 });
  }
  return NextResponse.json({
    data: {
      default_mileage_rate_cents: (data as { default_mileage_rate_cents?: number })?.default_mileage_rate_cents ?? 0,
      default_labor_cost_cents: (data as { default_labor_cost_cents?: number })?.default_labor_cost_cents ?? 0,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("canManageJobCosting");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UpdateCostingRatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const payload: Record<string, unknown> = {};
  if (parsed.data.default_mileage_rate_cents !== undefined) payload.default_mileage_rate_cents = parsed.data.default_mileage_rate_cents;
  if (parsed.data.default_labor_cost_cents !== undefined) payload.default_labor_cost_cents = parsed.data.default_labor_cost_cents;
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 422 });

  const { data, error } = await db
    .from("tenants").update(payload).eq("id", tenantId)
    .select("default_mileage_rate_cents, default_labor_cost_cents").single();
  if (error) {
    console.error("[api] PATCH costing-rates:", error.message);
    return NextResponse.json({ error: "Failed to update rates" }, { status: 500 });
  }

  await recordAuditEvent({
    tenantId, userId, actionType: "costing.rates_updated",
    description: `Updated tenant costing rates (${Object.keys(payload).join(", ")})`,
    entityType: "tenant", entityId: tenantId,
  });

  return NextResponse.json({ data });
}
