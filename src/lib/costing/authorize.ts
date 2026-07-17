import type { Session } from "next-auth";
import { isTechnicianScoped } from "@/lib/auth/api-auth";
import { rolePermissions } from "@/config/roles";
import { UserRole } from "@/types/technician";
import { db } from "@/lib/db/client";

/**
 * Job-costing authorization helpers (Phase 9, ADR-0016 §3).
 *
 * Centralised so the ownership rules can't drift between the six costing
 * routes. Two distinct questions:
 *   - May this caller SEE money?         → canViewJobCosting
 *   - May this caller touch THIS entry?  → own entry, or canManageJobCosting
 */

export function canViewCosts(session: Session): boolean {
  return rolePermissions[session.user.role as UserRole].canViewJobCosting;
}

export function canManageAnyEntry(session: Session): boolean {
  return rolePermissions[session.user.role as UserRole].canManageJobCosting;
}

/**
 * A technician may only log against a work order actually assigned to them —
 * their first cost-relevant write surface, so it is ownership-scoped rather
 * than tenant-scoped. Non-technician roles with canLogJobCosts may log against
 * any work order in their tenant.
 */
export async function canLogAgainstWorkOrder(
  session: Session, workOrderId: string, tenantId: string
): Promise<boolean> {
  if (!isTechnicianScoped(session)) return true;

  const techId = session.user.technician_id;
  if (!techId) return false;

  const { data } = await db
    .from("work_orders")
    .select("assigned_technician_id")
    .eq("id", workOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (data && (data as { assigned_technician_id?: string }).assigned_technician_id === techId) return true;

  // Fall back to visit assignment: a tech may be on a visit for the work order
  // without being its lead assignee (multi-tech jobs, Phase 4).
  const { data: visit } = await db
    .from("visits")
    .select("id")
    .eq("work_order_id", workOrderId)
    .eq("tenant_id", tenantId)
    .eq("technician_id", techId)
    .limit(1)
    .maybeSingle();
  return !!visit;
}

/**
 * May this caller modify/delete this specific entry? Owners (canManageJobCosting)
 * may touch anything in their tenant; everyone else only their own entries.
 * `entryTechnicianId` is the entry's technician_id (time/mileage); for expenses
 * pass the entry's created_by against the caller's user id instead.
 */
export function canModifyEntry(
  session: Session,
  entryOwner: { technicianId?: string | null; createdBy?: string | null }
): boolean {
  if (canManageAnyEntry(session)) return true;
  const perms = rolePermissions[session.user.role as UserRole];
  if (!perms.canLogJobCosts) return false;

  if (entryOwner.technicianId && session.user.technician_id) {
    return entryOwner.technicianId === session.user.technician_id;
  }
  if (entryOwner.createdBy) {
    return entryOwner.createdBy === session.user.id;
  }
  return false;
}

/**
 * The technician a new entry should be attributed to. A technician-scoped
 * caller can ONLY log against themselves — the request's technician_id is
 * ignored for them, so a tech can't attribute (and thereby expose) time to a
 * colleague. Office staff may log on someone's behalf.
 */
export function resolveEntryTechnicianId(
  session: Session, requestedTechnicianId: string | undefined
): string | null {
  if (isTechnicianScoped(session)) return session.user.technician_id ?? null;
  return requestedTechnicianId ?? session.user.technician_id ?? null;
}
