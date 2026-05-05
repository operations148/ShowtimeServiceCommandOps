import { type NextRequest, NextResponse } from "next/server";
import { PatchWorkOrderSchema } from "@/lib/validation/work-order";
import {
  getWorkOrderById,
  updateWorkOrder,
  deleteWorkOrder,
} from "@/lib/mock-data/store";
import { WorkOrderStatus } from "@/types/work-order";
import { syncCompletionToGhl } from "@/lib/ghl/sync-completion";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const workOrder = getWorkOrderById(id);
  if (!workOrder) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  return NextResponse.json({ data: workOrder });
}

// ---------------------------------------------------------------------------
// PATCH /api/work-orders/[id]
// Supports partial updates. Status changes are validated against the allowed
// transition map — an invalid transition returns 422 with a clear error.
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  if (!getWorkOrderById(id)) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = PatchWorkOrderSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const updateResult = updateWorkOrder(id, result.data);

  if (!updateResult.ok) {
    if (updateResult.notFound) {
      return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
    }
    const { transitionError } = updateResult;
    return NextResponse.json(
      {
        error: `Invalid status transition: "${transitionError.from}" → "${transitionError.to}"`,
        allowed_transitions: transitionError.allowed,
      },
      { status: 422 }
    );
  }

  const updatedWo = updateResult.data;

  // Fire-and-forget GHL sync on completion. Not awaited so the HTTP response
  // is not held open waiting for an external API call. In a serverless
  // deployment wrap this with waitUntil() to prevent premature context teardown.
  if (updatedWo.status === WorkOrderStatus.COMPLETED) {
    void syncCompletionToGhl(updatedWo);
  }

  return NextResponse.json({ data: updatedWo });
}

// ---------------------------------------------------------------------------
// DELETE /api/work-orders/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const deleted = deleteWorkOrder(id);
  if (!deleted) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  return NextResponse.json({ data: { id, deleted: true } });
}
