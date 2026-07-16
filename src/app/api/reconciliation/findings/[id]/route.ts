import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { resolveReconciliationFinding } from "@/lib/db/queries/reconciliation";
import { ResolveReconciliationFindingSchema } from "@/lib/validation/invoice";
import { recordAuditEvent } from "@/lib/security/audit";

// PATCH /api/reconciliation/findings/[id] — resolve or ignore, with a
// mandatory reason (admin resolution trail, ADR-0012).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewFinancialReports");
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

  const parsed = ResolveReconciliationFindingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A resolution reason is required", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await resolveReconciliationFinding(id, tenantId, userId, parsed.data.status, parsed.data.resolution_reason);
    if (!result.ok) {
      return NextResponse.json({ error: "Finding not found or already resolved" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "reconciliation.finding_resolved",
      description: `${parsed.data.status === "resolved" ? "Resolved" : "Ignored"} reconciliation finding ${id}`,
      entityType: "reconciliation_finding",
      entityId: id,
      metadata: { reason: parsed.data.resolution_reason },
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PATCH /api/reconciliation/findings/[id]:", err);
    return NextResponse.json({ error: "Failed to resolve finding" }, { status: 500 });
  }
}
