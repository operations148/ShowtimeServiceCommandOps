import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { createInvoiceFromChangeOrder } from "@/lib/invoices/create-from-source";
import { recordAuditEvent } from "@/lib/security/audit";
import { z } from "zod";

const CreateFromChangeOrderSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
});

// POST /api/change-orders/[id]/invoice — bill an ACCEPTED change order's
// approved price impact. Snapshots the change order at creation time.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body allowed
  }
  const parsed = CreateFromChangeOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createInvoiceFromChangeOrder(id, tenantId, userId, parsed.data);
    if (!result.ok) {
      if (result.reason === "change_order_not_accepted") {
        return NextResponse.json({ error: "Only an accepted change order can be invoiced", detail: result.detail }, { status: 409 });
      }
      return NextResponse.json({ error: "Change order not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.created",
      description: `Created invoice ${result.invoice.invoice_number} from change order ${id}`,
      entityType: "invoice",
      entityId: result.invoice.id,
      metadata: { source: "change_order", change_order_id: id },
    });

    return NextResponse.json({ data: result.invoice }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/change-orders/[id]/invoice:", err);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
