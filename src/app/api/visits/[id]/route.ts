import { type NextRequest, NextResponse, after } from "next/server";
import { PatchVisitSchema } from "@/lib/validation/visit";
import { getVisitById, updateVisit } from "@/lib/db/queries/visits";
import { VisitStatus } from "@/types/visit";
import { WorkOrderStatus, EstimateHandoffStatus } from "@/types/work-order";
import { updateWorkOrder, getWorkOrderById } from "@/lib/db/queries/work-orders";
import { createEstimateHandoff } from "@/lib/db/queries/estimate-handoffs";
import { syncEstimateToGhl } from "@/lib/ghl/sync-estimate";
import { syncCompletionToGhl } from "@/lib/ghl/sync-completion";
import { requireApiAuth, isTechnicianScoped, getTenantId } from "@/lib/auth/api-auth";
import { resolveCompletionRuleForTenant } from "@/lib/db/queries/completion-requirements";
import { resolveChecklistForCategory, writeVisitChecklistSnapshot } from "@/lib/db/queries/checklist-templates";
import { evaluateCompletionRequirements, describeMissingRequirements } from "@/lib/work-orders/completion-requirements";
import type { VisitCompletionData } from "@/types/completion-requirements";
import type { ResolvedChecklistItem } from "@/types/checklist-template";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/visits/[id]
//
// TECHNICIAN: allowed only if the visit belongs to them (technician_id match).
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  let visit;
  try {
    visit = await getVisitById(id, tenantId);
  } catch (err) {
    console.error("[api] GET /api/visits/[id] failed:", err);
    return NextResponse.json({ error: "Failed to load visit" }, { status: 500 });
  }
  if (!visit) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  if (isTechnicianScoped(auth.session) && visit.technician_id !== auth.session.user.technician_id) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  return NextResponse.json({ data: visit });
}

// ---------------------------------------------------------------------------
// PATCH /api/visits/[id]
//
// TECHNICIAN: allowed only for their own visits (checklist, notes, estimate flag).
// All store mutations receive tenantId for defense-in-depth.
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  let existingVisit;
  try {
    existingVisit = await getVisitById(id, tenantId);
  } catch (err) {
    console.error("[api] PATCH /api/visits/[id] pre-check failed:", err);
    return NextResponse.json({ error: "Failed to load visit" }, { status: 500 });
  }
  if (!existingVisit) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  if (isTechnicianScoped(auth.session) && existingVisit.technician_id !== auth.session.user.technician_id) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = PatchVisitSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // Pre-write gate: block the transition to COMPLETED if the tenant's
  // configured completion requirements (checklist, photos, signature, etc.)
  // aren't satisfied by the merged (existing + incoming) visit data.
  const willComplete =
    existingVisit.status !== VisitStatus.COMPLETED &&
    (result.data.status ?? existingVisit.status) === VisitStatus.COMPLETED;

  let resolvedChecklistForSnapshot: { items: ResolvedChecklistItem[]; templateId: string | null; templateVersion: number | null } | null = null;

  if (willComplete) {
    const workOrder = await getWorkOrderById(existingVisit.work_order_id, tenantId);
    if (!workOrder) {
      return NextResponse.json({ error: "Parent work order not found" }, { status: 404 });
    }

    const rule = await resolveCompletionRuleForTenant(tenantId, workOrder.service_category);
    const mergedChecklist = result.data.checklist ?? existingVisit.checklist;

    const completionData: VisitCompletionData = {
      checklistComplete: mergedChecklist.every((item) => item.completed),
      photoCount: existingVisit.photo_urls.length,
      technicianNote: result.data.technician_notes ?? existingVisit.technician_notes,
      customerSignature: result.data.customer_signature ?? existingVisit.customer_signature,
      equipmentReading: result.data.equipment_reading ?? existingVisit.equipment_reading,
      timeEntryMinutes: result.data.time_entry_minutes ?? existingVisit.time_entry_minutes,
      materialUsage: result.data.material_usage ?? existingVisit.material_usage,
      completionReason: result.data.completion_reason ?? existingVisit.completion_reason,
    };

    const { canComplete, missing } = evaluateCompletionRequirements(rule, completionData);
    if (!canComplete) {
      return NextResponse.json(
        { error: "Cannot complete visit — required fields are missing", missing: describeMissingRequirements(missing) },
        { status: 422 }
      );
    }

    // Resolve the checklist template in effect now, so the completion
    // snapshot records which items/labels were required at completion time.
    resolvedChecklistForSnapshot = await resolveChecklistForCategory(tenantId, workOrder.service_category);
  }

  let updateResult;
  try {
    updateResult = await updateVisit(id, result.data, tenantId);
  } catch (err) {
    console.error("[api] PATCH /api/visits/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update visit" }, { status: 500 });
  }
  if (!updateResult.ok) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  const updatedVisit = updateResult.data;

  // Detect estimate_flagged transition: false → true.
  const estimateFlaggedNow =
    !existingVisit.estimate_flagged && updatedVisit.estimate_flagged;

  if (estimateFlaggedNow) {
    // Update work order status + estimate_handoff_status field; propagate tech's estimate notes
    void updateWorkOrder(
      updatedVisit.work_order_id,
      {
        status: WorkOrderStatus.ESTIMATE_NEEDED,
        estimate_handoff_status: EstimateHandoffStatus.FLAGGED,
        ...(result.data.estimate_flag_notes
          ? { estimate_notes: result.data.estimate_flag_notes }
          : {}),
      },
      tenantId
    );
    // Write the estimate_handoffs record (source of truth for estimate state machine)
    void createEstimateHandoff({
      tenant_id:                tenantId,
      work_order_id:            updatedVisit.work_order_id,
      visit_id:                 updatedVisit.id,
      flagged_by_technician_id: auth.session.user.technician_id ?? undefined,
    }).catch((err) => console.error("[visits/PATCH] createEstimateHandoff failed:", err));
    // Sync to GHL (fire-and-forget)
    void syncEstimateToGhl(updatedVisit);
  }

  // Write the immutable checklist-completion snapshot the moment the visit
  // actually transitions to COMPLETED (independent of the completion_message
  // gate below, which only controls the work-order side-effect update).
  if (resolvedChecklistForSnapshot && updatedVisit.status === VisitStatus.COMPLETED) {
    const snapshotItems: ResolvedChecklistItem[] = resolvedChecklistForSnapshot.items.map((templateItem) => {
      const match = updatedVisit.checklist.find((c) => c.label === templateItem.label);
      return {
        label: templateItem.label,
        is_required: templateItem.is_required,
        completed: match?.completed ?? false,
        notes: match?.notes ?? null,
      };
    });
    void writeVisitChecklistSnapshot(
      updatedVisit.id,
      tenantId,
      snapshotItems,
      resolvedChecklistForSnapshot.templateId,
      resolvedChecklistForSnapshot.templateVersion
    ).catch((err) => console.error("[visits/PATCH] writeVisitChecklistSnapshot failed:", err));
  }

  // Detect completion: visit status → COMPLETED with a completion_message.
  const completedNow =
    existingVisit.status !== VisitStatus.COMPLETED &&
    updatedVisit.status  === VisitStatus.COMPLETED &&
    updatedVisit.completion_message != null;

  if (completedNow) {
    // Runs after the response is sent (after() — same pattern as the admin
    // work-order PATCH route); must never block or fail the tech's completion.
    after(async () => {
      try {
        const woId = updatedVisit.work_order_id;
        const priorWo = await getWorkOrderById(woId, tenantId);
        const alreadyCompleted = priorWo?.status === WorkOrderStatus.COMPLETED;

        await updateWorkOrder(
          woId,
          {
            status:                  WorkOrderStatus.COMPLETED,
            tech_completion_message: updatedVisit.completion_message ?? undefined,
            tech_completed_by:       updatedVisit.completed_by_name ?? undefined,
            tech_completed_at:       updatedVisit.completed_at ?? new Date().toISOString(),
          },
          tenantId
        );

        // Phase 12 fix (ADR-0018): this path previously updated the work order
        // via a direct DB call and NEVER notified GHL — the admin PATCH route
        // was the only trigger, so field-completed jobs (the majority) never
        // fired the client's review workflow. Fire the same sync here, gated
        // on the actual transition so a re-save of an already-completed work
        // order doesn't re-fire the webhook.
        if (!alreadyCompleted) {
          const updatedWo = await getWorkOrderById(woId, tenantId);
          if (updatedWo) await syncCompletionToGhl(updatedWo);
        }
      } catch (err) {
        console.error("[visits/PATCH] completion side-effects failed:", err);
      }
    });
  }

  return NextResponse.json({ data: updatedVisit });
}
