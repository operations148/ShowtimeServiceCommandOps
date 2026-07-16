import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { transitionInvoice } from "@/lib/db/queries/invoices";
import { InvoiceStatus } from "@/types/invoice";
import { InvoiceTransitionSchema } from "@/lib/validation/invoice";
import { recordInvoiceEvent } from "@/lib/db/queries/invoices";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/invoices/[id]/transition — staff draft ⇄ ready only. Sent is via
// /send; payment transitions are ledger-driven; void is via /void.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageInvoices");
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

  const parsed = InvoiceTransitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const to = parsed.data.to === "ready" ? InvoiceStatus.READY : InvoiceStatus.DRAFT;

  try {
    const result = await transitionInvoice(id, to, parsed.data.version, tenantId);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This invoice was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      if ("invalidTransition" in result) return NextResponse.json({ error: `Cannot move an invoice from '${result.from}' to '${to}'` }, { status: 409 });
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    await recordInvoiceEvent({ invoiceId: id, tenantId, eventType: "updated", actorUserId: userId, metadata: { transition: to } });
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.transitioned",
      description: `Invoice ${result.data.invoice_number} → ${to}`,
      entityType: "invoice",
      entityId: id,
    });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/transition:", err);
    return NextResponse.json({ error: "Failed to update invoice status" }, { status: 500 });
  }
}
