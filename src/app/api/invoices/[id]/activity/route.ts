import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getInvoiceEvents } from "@/lib/db/queries/invoices";

// GET /api/invoices/[id]/activity — append-only invoice event log.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await getInvoiceEvents(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/invoices/[id]/activity:", err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
