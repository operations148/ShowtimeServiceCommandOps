import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listInvoices } from "@/lib/db/queries/invoices";
import { createInvoiceFromWorkOrder } from "@/lib/invoices/create-from-source";
import { InvoiceLineInputSchema } from "@/lib/validation/invoice";
import { recordAuditEvent } from "@/lib/security/audit";
import { z } from "zod";

const CreateFromWorkOrderSchema = z.object({
  kind: z.enum(["standard", "milestone", "final"]).default("standard"),
  milestone_label: z.string().max(200).optional(),
  tax_rate: z.number().min(0).max(1).default(0),
  discount_cents: z.number().int().min(0).default(0),
  deposit_required: z.boolean().default(false),
  deposit_percent: z.number().min(10).max(100).default(10),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
  payment_instructions: z.string().max(2000).optional(),
  line_items: z.array(InvoiceLineInputSchema).min(1).max(200),
});

// GET /api/work-orders/[id]/invoices — invoices billed against this work order.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const invoices = await listInvoices(tenantId, { q: undefined, work_order_id: id, estimate_id: undefined });
    return NextResponse.json({ data: invoices });
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/invoices:", err);
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/invoices — bill this work order (standard /
// milestone / final). Snapshots the work order at creation time.
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

  const parsed = CreateFromWorkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createInvoiceFromWorkOrder(id, tenantId, userId, {
      kind: parsed.data.kind,
      milestoneLabel: parsed.data.milestone_label,
      lineItems: parsed.data.line_items,
      taxRate: parsed.data.tax_rate,
      discountCents: parsed.data.discount_cents,
      depositRequired: parsed.data.deposit_required,
      depositPercent: parsed.data.deposit_percent,
      dueDate: parsed.data.due_date,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
      paymentInstructions: parsed.data.payment_instructions,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.created",
      description: `Created ${parsed.data.kind} invoice ${result.invoice.invoice_number} from work order ${id}`,
      entityType: "invoice",
      entityId: result.invoice.id,
      metadata: { source: "work_order", work_order_id: id },
    });

    return NextResponse.json({ data: result.invoice }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/invoices:", err);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
