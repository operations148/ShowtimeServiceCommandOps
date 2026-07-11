import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { overrideEstimateLock } from "@/lib/estimates/override";
import { EstimateOverrideSchema } from "@/lib/validation/estimate";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/estimates/[id]/override — re-open a locked estimate. Requires the
// canOverrideEstimateLock permission AND a mandatory reason (audited).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canOverrideEstimateLock");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = EstimateOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A reason is required to override an estimate lock", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await overrideEstimateLock(id, tenantId, parsed.data.reason, {
      userId,
      name: (auth.session.user as { name?: string }).name,
    });
    if (!result.ok) {
      if (result.reason === "not_overridable") {
        return NextResponse.json({ error: `An estimate in status '${result.status}' cannot be overridden` }, { status: 409 });
      }
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "estimate.override",
      description: `Overrode estimate lock ${id}`,
      entityType: "estimate",
      entityId: id,
      metadata: { reason: parsed.data.reason },
    });

    return NextResponse.json({ data: { newVersion: result.newVersion } });
  } catch (err) {
    console.error("[api] POST /api/estimates/[id]/override:", err);
    return NextResponse.json({ error: "Failed to override estimate" }, { status: 500 });
  }
}
