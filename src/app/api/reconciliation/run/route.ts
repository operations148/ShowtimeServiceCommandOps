import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { runReconciliation } from "@/lib/payments/reconcile";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/reconciliation/run — admin-triggered reconciliation. Gated on
// canViewFinancialReports (the same rail as financial oversight).
export async function POST(_request: NextRequest) {
  const auth = await requirePermission("canViewFinancialReports");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  try {
    const result = await runReconciliation("manual", userId);
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "reconciliation.run",
      description: `Ran payment reconciliation (${result.findingsCount} finding(s), ${result.overdueMarked} overdue)`,
      entityType: "reconciliation_run",
      entityId: result.runId,
      metadata: result as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[api] POST /api/reconciliation/run:", err);
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}
