import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getJobExpenseById, updateJobExpense, deleteJobExpense } from "@/lib/db/queries/costing";
import { serializeJobExpenses } from "@/lib/costing/serialize";
import { canViewCosts, canModifyEntry } from "@/lib/costing/authorize";
import { UpdateJobExpenseSchema } from "@/lib/validation/costing";

type RouteContext = { params: Promise<{ id: string }> };
const NOT_FOUND = "Expense not found";

// PATCH /api/costing/expenses/[id]
//
// Editing the money on an expense (amount/billable/markup) requires
// canViewJobCosting — you must be able to SEE cost to author it. A cost-blind
// caller may still fix the description/vendor/category of their own entry.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const existing = await getJobExpenseById(id, tenantId);
  if (!existing || !canModifyEntry(auth.session, { createdBy: existing.created_by })) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UpdateJobExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const touchesMoney =
    parsed.data.amount_cents !== undefined ||
    parsed.data.billable !== undefined ||
    parsed.data.markup_percent !== undefined;
  if (touchesMoney && !canViewCosts(auth.session)) {
    return NextResponse.json({ error: "You can't set expense amounts or markup" }, { status: 403 });
  }

  try {
    const updated = await updateJobExpense(id, parsed.data, tenantId);
    if (!updated) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const [serialized] = serializeJobExpenses([updated], canViewCosts(auth.session));
    return NextResponse.json({ data: serialized });
  } catch (err) {
    console.error("[api] PATCH expense:", err);
    const message = err instanceof RangeError ? err.message : "Failed to update expense";
    return NextResponse.json({ error: message }, { status: err instanceof RangeError ? 422 : 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const existing = await getJobExpenseById(id, tenantId);
  if (!existing || !canModifyEntry(auth.session, { createdBy: existing.created_by })) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  try {
    await deleteJobExpense(id, tenantId);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[api] DELETE expense:", err);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
