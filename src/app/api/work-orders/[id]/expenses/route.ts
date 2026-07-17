import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listJobExpenses, createJobExpense } from "@/lib/db/queries/costing";
import { serializeJobExpenses } from "@/lib/costing/serialize";
import { canViewCosts, canLogAgainstWorkOrder } from "@/lib/costing/authorize";
import { CreateJobExpenseSchema } from "@/lib/validation/costing";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/work-orders/[id]/expenses — amounts/markup/billable are stripped
// server-side unless the caller has canViewJobCosting.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  if (!(await canLogAgainstWorkOrder(auth.session, id, tenantId))) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  try {
    const entries = await listJobExpenses(id, tenantId);
    return NextResponse.json({ data: serializeJobExpenses(entries, canViewCosts(auth.session)) });
  } catch (err) {
    console.error("[api] GET expenses:", err);
    return NextResponse.json({ error: "Failed to load expenses" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/expenses
//
// Unlike time/mileage, an expense amount IS supplied by the caller — it's a
// receipt total, not something the server can derive. The markup/billable math
// is still server-computed. Receipt upload is a separate step (reuses the
// job-photo storage rail + magic-byte validation).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = CreateJobExpenseSchema.safeParse({ ...(body as object), work_order_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  if (!(await canLogAgainstWorkOrder(auth.session, id, tenantId))) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // A technician may record that a part was used, but must not set its price or
  // its billable markup — that's cost/margin data they can't see and shouldn't
  // author. Force a cost-blind caller's expense to a neutral, non-billable
  // record the office can price afterwards.
  const costBlind = !canViewCosts(auth.session);
  const input = costBlind
    ? { ...parsed.data, amount_cents: 0, billable: false, markup_percent: 0 }
    : parsed.data;

  try {
    const entry = await createJobExpense(input, tenantId, auth.session.user.id);
    const [serialized] = serializeJobExpenses([entry], canViewCosts(auth.session));
    return NextResponse.json({ data: serialized }, { status: 201 });
  } catch (err) {
    console.error("[api] POST expenses:", err);
    const message = err instanceof RangeError ? err.message : "Failed to log expense";
    return NextResponse.json({ error: message }, { status: err instanceof RangeError ? 422 : 500 });
  }
}
