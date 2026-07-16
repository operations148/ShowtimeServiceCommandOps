import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listInvoices, createInvoiceDocument } from "@/lib/db/queries/invoices";
import { CreateInvoiceSchema, ListInvoicesQuerySchema } from "@/lib/validation/invoice";
import { recordInvoiceEvent } from "@/lib/db/queries/invoices";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/invoices?q=&status=&work_order_id=&estimate_id=&invoice_kind=
export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = new URL(request.url);
  const parsed = ListInvoicesQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    work_order_id: searchParams.get("work_order_id") ?? undefined,
    estimate_id: searchParams.get("estimate_id") ?? undefined,
    invoice_kind: searchParams.get("invoice_kind") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const invoices = await listInvoices(tenantId, parsed.data);
    return NextResponse.json({ data: invoices });
  } catch (err) {
    console.error("[api] GET /api/invoices:", err);
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}

// POST /api/invoices — manual authorized entry (server-owned totals).
export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManageInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const invoice = await createInvoiceDocument(parsed.data, tenantId, userId);
    await recordInvoiceEvent({ invoiceId: invoice.id, tenantId, eventType: "created", actorUserId: userId, metadata: { source: "manual" } });
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.created",
      description: `Created invoice ${invoice.invoice_number} — ${invoice.title}`,
      entityType: "invoice",
      entityId: invoice.id,
    });
    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/invoices:", err);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
