import { type NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { PatchWorkOrderSchema } from "@/lib/validation/work-order";
import {
  getWorkOrderById,
  updateWorkOrder,
  deleteWorkOrder,
} from "@/lib/db/queries/work-orders";
import { WorkOrderStatus, EstimateHandoffStatus } from "@/types/work-order";
import { UserRole } from "@/types/technician";
import { syncCompletionToGhl } from "@/lib/ghl/sync-completion";
import { requireApiAuth, requirePermission, isTechnicianScoped, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]
//
// TECHNICIAN: allowed only if the work order is assigned to them.
// Post-fetch tenant check ensures cross-tenant ID guessing returns 404.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  let workOrder;
  try {
    workOrder = await getWorkOrderById(id, tenantId);
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id] failed:", err);
    return NextResponse.json({ error: "Failed to load work order" }, { status: 500 });
  }
  if (!workOrder) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  if (
    isTechnicianScoped(auth.session) &&
    workOrder.assigned_technician_id !== auth.session.user.technician_id
  ) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  return NextResponse.json({ data: workOrder });
}

// ---------------------------------------------------------------------------
// PATCH /api/work-orders/[id]
//
// TECHNICIAN: blocked (canViewAllWorkOrders: false for write access).
// tenantId is passed to updateWorkOrder for defense-in-depth.
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canViewAllWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  let workOrder;
  try {
    workOrder = await getWorkOrderById(id, tenantId);
  } catch (err) {
    console.error("[api] PATCH /api/work-orders/[id] pre-check failed:", err);
    return NextResponse.json({ error: "Failed to load work order" }, { status: 500 });
  }
  if (!workOrder) {
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

  // Extract non-DB fields before passing to update layer
  const { retry_ghl_sync: retryGhlSync, estimate_notes: estimateNotes, override, ...dbPatch } = result.data;
  // estimate_notes IS a DB column — include it back in the patch
  const fullDbPatch = estimateNotes !== undefined ? { ...dbPatch, estimate_notes: estimateNotes } : dbPatch;

  // ── Estimate lock guard ────────────────────────────────────────────────────
  // If estimate_handoff_status is being changed, check whether the handoff is
  // locked. Locked records are immutable unless the caller is TENANT_ADMIN or
  // PLATFORM_OWNER and passes { override: true } in the request body.
  type HandoffLockRow = { id: string; status: string; locked_at: string | null };
  let lockedHandoff: { id: string; status: string } | null = null;
  if (fullDbPatch.estimate_handoff_status !== undefined) {
    let handoffRow: HandoffLockRow | null = null;
    try {
      const { data, error: fetchErr } = await db
        .from("estimate_handoffs")
        .select("id, status, locked_at")
        .eq("work_order_id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      handoffRow = data as HandoffLockRow | null;
    } catch (err) {
      console.error("[api] PATCH estimate_handoffs lock check:", err);
      return NextResponse.json({ error: "Failed to check estimate lock" }, { status: 500 });
    }

    if (handoffRow?.locked_at) {
      const role = auth.session.user.role as UserRole;
      const canOverride =
        (role === UserRole.TENANT_ADMIN || role === UserRole.PLATFORM_OWNER) &&
        override === true;

      if (!canOverride) {
        return NextResponse.json({ error: "Estimate is locked" }, { status: 409 });
      }

      lockedHandoff = { id: handoffRow.id, status: handoffRow.status };
    }
  }

  let updateResult;
  try {
    updateResult = await updateWorkOrder(id, fullDbPatch, tenantId);
  } catch (err) {
    console.error("[api] PATCH /api/work-orders/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update work order" }, { status: 500 });
  }

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
  const changedByName = (auth.session.user as { name?: string }).name ?? "Admin";

  // ── Estimate lock override audit log ───────────────────────────────────────
  if (lockedHandoff) {
    db.from("user_activity_log")
      .insert({
        tenant_id:   tenantId,
        user_id:     auth.session.user.id,
        action_type: "estimate.lock_override",
        description: `before: ${lockedHandoff.status}, after: ${fullDbPatch.estimate_handoff_status ?? "unknown"}`,
        entity_type: "estimate_handoff",
        entity_id:   lockedHandoff.id,
      })
      .then(({ error }) => {
        if (error) console.error("[api] estimate lock override log:", error.message);
      });
  }

  // ── Status history log ─────────────────────────────────────────────────────
  if (fullDbPatch.status && fullDbPatch.status !== workOrder.status) {
    db.from("work_order_status_history")
      .insert({
        work_order_id:    id,
        tenant_id:        tenantId,
        previous_status:  workOrder.status,
        new_status:       fullDbPatch.status,
        changed_by_name:  changedByName,
      })
      .then(({ error }) => {
        if (error) console.error("[api] status history insert:", error.message);
      });
  }

  // ── Estimate handoff upsert ────────────────────────────────────────────────
  // When flagging estimate: upsert estimate_handoffs with notes.
  // When changing estimate_handoff_status to non-flagged: update existing record.
  if (fullDbPatch.estimate_handoff_status === EstimateHandoffStatus.FLAGGED) {
    db.from("estimate_handoffs")
      .upsert(
        {
          tenant_id:     tenantId,
          work_order_id: id,
          status:        EstimateHandoffStatus.FLAGGED,
          notes:         estimateNotes ?? null,
          flagged_at:    new Date().toISOString(),
        },
        { onConflict: "work_order_id" }
      )
      .then(({ error }) => {
        if (error) console.error("[api] estimate_handoffs upsert:", error.message);
      });
  } else if (fullDbPatch.estimate_handoff_status) {
    const tsField: Record<string, string> = {
      [EstimateHandoffStatus.SENT_TO_GHL]:   "sent_to_ghl_at",
      [EstimateHandoffStatus.ESTIMATE_SENT]: "estimate_sent_at",
      [EstimateHandoffStatus.APPROVED]:      "approved_at",
      [EstimateHandoffStatus.DECLINED]:      "declined_at",
    };
    const updateFields: Record<string, unknown> = { status: fullDbPatch.estimate_handoff_status };
    if (tsField[fullDbPatch.estimate_handoff_status]) {
      updateFields[tsField[fullDbPatch.estimate_handoff_status]] = new Date().toISOString();
    }
    db.from("estimate_handoffs")
      .update(updateFields)
      .eq("work_order_id", id)
      .eq("tenant_id", tenantId)
      .then(({ error }) => {
        if (error) console.error("[api] estimate_handoffs update:", error.message);
      });
  }

  // Trigger GHL sync when status transitions to COMPLETED, or when the
  // client explicitly requests a retry (retry_ghl_sync: true) after a
  // previous sync failure. Use pre-update workOrder.ghl_sync_failed to
  // decide — the DB record may have cleared it during the update.
  const shouldSync =
    updatedWo.status === WorkOrderStatus.COMPLETED ||
    (retryGhlSync === true && workOrder.ghl_sync_failed === true);

  if (shouldSync) {
    // after() schedules the callback to run once the response has been sent,
    // but keeps the serverless function instance alive until it finishes —
    // fixing a prior check against `globalThis.waitUntil`, which is not a
    // real API in this runtime and always evaluated false, silently reducing
    // this to an un-awaited floating promise (security-audit L6).
    after(() => syncCompletionToGhl(updatedWo).catch((err) => console.error("[after] syncCompletionToGhl failed:", err)));
  }

  return NextResponse.json({ data: updatedWo });
}

// ---------------------------------------------------------------------------
// DELETE /api/work-orders/[id]
//
// TECHNICIAN / READ_ONLY_OWNER: blocked (canCreateWorkOrders: false).
// tenantId is passed to deleteWorkOrder for defense-in-depth.
// ---------------------------------------------------------------------------

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canCreateWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  let workOrder;
  try {
    workOrder = await getWorkOrderById(id, tenantId);
  } catch (err) {
    console.error("[api] DELETE /api/work-orders/[id] pre-check failed:", err);
    return NextResponse.json({ error: "Failed to load work order" }, { status: 500 });
  }
  if (!workOrder) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  let deleted;
  try {
    deleted = await deleteWorkOrder(id, tenantId);
  } catch (err) {
    console.error("[api] DELETE /api/work-orders/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete work order" }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
