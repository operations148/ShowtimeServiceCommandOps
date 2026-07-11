import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listEstimates, createEstimate } from "@/lib/db/queries/estimates";
import { CreateEstimateSchema, ListEstimatesQuerySchema } from "@/lib/validation/estimate";
import { redactEstimateCosts } from "@/lib/estimates/redact-costs";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

function canViewCosts(role: string): boolean {
  return rolePermissions[role as UserRole]?.canViewItemCosts ?? false;
}

// GET /api/estimates?q=&status=&work_order_id=
export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = new URL(request.url);
  const parsed = ListEstimatesQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    work_order_id: searchParams.get("work_order_id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const estimates = await listEstimates(tenantId, parsed.data);
    return NextResponse.json({ data: estimates });
  } catch (err) {
    console.error("[api] GET /api/estimates:", err);
    return NextResponse.json({ error: "Failed to load estimates" }, { status: 500 });
  }
}

// POST /api/estimates
export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManageEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateEstimateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createEstimate(parsed.data, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: "A referenced pricebook item was not found for this tenant", badItemId: result.badItemId },
        { status: 422 }
      );
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "estimate.created",
      description: `Created estimate ${result.data.estimate_number} — ${result.data.title}`,
      entityType: "estimate",
      entityId: result.data.id,
    });

    return NextResponse.json({ data: redactEstimateCosts(result.data, canViewCosts(auth.session.user.role)) }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/estimates:", err);
    return NextResponse.json({ error: "Failed to create estimate" }, { status: 500 });
  }
}
