// Role Permissions Configuration

import { UserRole } from "@/types/technician";

export interface RolePermissions {
  canViewAllWorkOrders: boolean;
  canCreateWorkOrders: boolean;
  canAssignTechnicians: boolean;
  canViewAllProperties: boolean;
  canEditProperties: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  canManageTenants: boolean;
  canViewOwnJobsOnly: boolean;

  // Granular permissions added Phase 1 (security-audit: "Replace overly broad
  // write authorization with explicit permissions"). Existing coarse flags
  // above are unchanged and still used by most routes; these are applied
  // where Phase 1 fixed a specific under-permissioned route (e.g.
  // send-estimate, security-audit H4) and are available for later phases
  // (estimates/invoices/payments/audit-log) to adopt without another
  // rolePermissions redesign.
  canSendEstimateEmail: boolean;
  canOverrideEstimateLock: boolean;
  canManageInvoices: boolean;
  canRefundPayments: boolean;
  canApproveTime: boolean;
  canViewFinancialReports: boolean;
  canInviteTeamMembers: boolean;
  canChangeTeamRoles: boolean;
  canReadAuditLog: boolean;

  // Pricebook permissions (Phase 2). canViewItemCosts guards internal_cost —
  // it is stripped server-side (src/lib/pricebook/cost-visibility.ts) for
  // roles without it; technicians and customer-portal users must never see
  // margins.
  canViewPricebook: boolean;
  canCreatePricebookItems: boolean;
  canEditPricebookItems: boolean;
  canArchivePricebookItems: boolean;
  canViewItemCosts: boolean;
  canExportPricebook: boolean;

  // Estimate documents (Phase 3). canSendEstimateEmail (Phase 1) already gates
  // the manual send action; these add view/manage/void. Cost visibility on
  // estimate lines rides canViewItemCosts (same rail as the pricebook).
  canViewEstimates: boolean;
  canManageEstimates: boolean;
  canVoidEstimates: boolean;

  // Dispatch & scheduling (Phase 4). canAssignTechnicians (existing) still gates
  // assignment; these add the calendar/visits-admin read surface and the
  // broader schedule-management actions (reschedule, blocked time, recurring
  // pause/skip). Technicians remain scoped to their own visits (see
  // isTechnicianScoped) and get neither flag.
  canViewSchedule: boolean;
  canManageSchedule: boolean;

  // Work-order project expansion (Phase 5). canCreateWorkOrders still gates
  // create/archive/restore (the old delete-permission slot). These add the
  // more deliberate lifecycle actions and the internal task/attachment
  // surface, which technicians can update for their own assigned tasks but
  // not manage broadly.
  canCloseWorkOrders: boolean;
  canManageWorkOrderTasks: boolean;
  canManageWorkOrderAttachments: boolean;
  canManageChecklistTemplates: boolean;
  canManageCompletionRequirements: boolean;

  // Change orders (Phase 5). Mirrors the estimate permission shape.
  // canSendEstimateEmail (Phase 1) is reused for the manual-send gate rather
  // than adding a parallel flag, since it already represents "this role may
  // trigger a customer-facing send."
  canViewChangeOrders: boolean;
  canManageChangeOrders: boolean;
  canVoidChangeOrders: boolean;
  canOverrideChangeOrderLock: boolean;
  /** Applying an accepted change order's schedule impact to a visit (ADR-0011). */
  canApplyScheduleImpact: boolean;

  // Invoices & payments (Phase 6). canManageInvoices and canRefundPayments
  // already exist (Phase 1); this adds the read flag so READ_ONLY_OWNER can
  // see invoices without managing them (same view/manage split as estimates
  // and change orders). Stripe Connect onboarding rides canManageSettings;
  // manual send rides canSendEstimateEmail (same reuse rationale as change
  // orders — one "may trigger a customer-facing send" flag).
  canViewInvoices: boolean;

  // Customer portal admin (Phase 7). Invite/enable/revoke portal customers,
  // review access history + sessions, resend secure invites. A customer-
  // facing surface, so treated like team/settings management (not office
  // staff by default — it grants a customer login to tenant data).
  canManagePortalUsers: boolean;

  // Job costing (Phase 9). THREE deliberately separate rails (ADR-0016 §3):
  //
  //   canLogJobCosts     — may RECORD time/mileage/expenses. Technicians: YES,
  //                        it's their job. Read-only owners: NO (read-only).
  //   canViewJobCosting  — may SEE rates, cost_cents and margin. Follows the
  //                        SAME line as canViewItemCosts/canViewFinancialReports:
  //                        owners only. Office staff run billing but do not see
  //                        cost — and job costing exposes LABOR rates, which are
  //                        compensation-adjacent, so this is the stricter of the
  //                        two rails, not the looser one.
  //   canManageJobCosting — may edit/delete ANY entry (not just their own) and
  //                        set technician/tenant rates. Owner-level: setting a
  //                        labor rate is editing compensation data.
  //
  // NOT folded into canViewItemCosts on purpose: pricebook cost is "what a part
  // costs us"; job costing is "what a person costs us + what we made". A tenant
  // could reasonably grant one without the other.
  //
  // Cost fields are stripped SERVER-SIDE by src/lib/costing/serialize.ts for
  // roles without canViewJobCosting — the UI is not the control.
  canLogJobCosts: boolean;
  canViewJobCosting: boolean;
  canManageJobCosting: boolean;
}

export const rolePermissions: Record<UserRole, RolePermissions> = {
  [UserRole.PLATFORM_OWNER]: {
    canViewAllWorkOrders: true,
    canCreateWorkOrders: true,
    canAssignTechnicians: true,
    canViewAllProperties: true,
    canEditProperties: true,
    canViewReports: true,
    canManageSettings: true,
    canManageTenants: true,
    canViewOwnJobsOnly: false,
    canSendEstimateEmail: true,
    canOverrideEstimateLock: true,
    canManageInvoices: true,
    canRefundPayments: true,
    canApproveTime: true,
    canViewFinancialReports: true,
    canInviteTeamMembers: true,
    canChangeTeamRoles: true,
    canReadAuditLog: true,
    canViewPricebook: true,
    canCreatePricebookItems: true,
    canEditPricebookItems: true,
    canArchivePricebookItems: true,
    canViewItemCosts: true,
    canExportPricebook: true,
    canViewEstimates: true,
    canManageEstimates: true,
    canVoidEstimates: true,
    canViewSchedule: true,
    canManageSchedule: true,
    canCloseWorkOrders: true,
    canManageWorkOrderTasks: true,
    canManageWorkOrderAttachments: true,
    canManageChecklistTemplates: true,
    canManageCompletionRequirements: true,
    canViewChangeOrders: true,
    canManageChangeOrders: true,
    canVoidChangeOrders: true,
    canOverrideChangeOrderLock: true,
    canApplyScheduleImpact: true,
    canViewInvoices: true,
    canManagePortalUsers: true,
    canLogJobCosts: true,
    canViewJobCosting: true,
    canManageJobCosting: true,
  },
  [UserRole.TENANT_ADMIN]: {
    canViewAllWorkOrders: true,
    canCreateWorkOrders: true,
    canAssignTechnicians: true,
    canViewAllProperties: true,
    canEditProperties: true,
    canViewReports: true,
    canManageSettings: true,
    canManageTenants: false,
    canViewOwnJobsOnly: false,
    canSendEstimateEmail: true,
    canOverrideEstimateLock: true,
    canManageInvoices: true,
    canRefundPayments: true,
    canApproveTime: true,
    canViewFinancialReports: true,
    canInviteTeamMembers: true,
    canChangeTeamRoles: true,
    canReadAuditLog: true,
    canViewPricebook: true,
    canCreatePricebookItems: true,
    canEditPricebookItems: true,
    canArchivePricebookItems: true,
    canViewItemCosts: true,
    canExportPricebook: true,
    canViewEstimates: true,
    canManageEstimates: true,
    canVoidEstimates: true,
    canViewSchedule: true,
    canManageSchedule: true,
    canCloseWorkOrders: true,
    canManageWorkOrderTasks: true,
    canManageWorkOrderAttachments: true,
    canManageChecklistTemplates: true,
    canManageCompletionRequirements: true,
    canViewChangeOrders: true,
    canManageChangeOrders: true,
    canVoidChangeOrders: true,
    canOverrideChangeOrderLock: true,
    canApplyScheduleImpact: true,
    canViewInvoices: true,
    canManagePortalUsers: true,
    canLogJobCosts: true,
    canViewJobCosting: true,
    canManageJobCosting: true,
  },
  [UserRole.OFFICE_STAFF]: {
    canViewAllWorkOrders: true,
    canCreateWorkOrders: true,
    canAssignTechnicians: true,
    canViewAllProperties: true,
    canEditProperties: true,
    canViewReports: true,
    canManageSettings: false,
    canManageTenants: false,
    canViewOwnJobsOnly: false,
    canSendEstimateEmail: true,
    canOverrideEstimateLock: false,
    canManageInvoices: true,
    canRefundPayments: false,
    canApproveTime: true,
    canViewFinancialReports: false,
    canInviteTeamMembers: false,
    canChangeTeamRoles: false,
    canReadAuditLog: false,
    // Office staff build estimates from the pricebook but do not see margins.
    canViewPricebook: true,
    canCreatePricebookItems: true,
    canEditPricebookItems: true,
    canArchivePricebookItems: true,
    canViewItemCosts: false,
    canExportPricebook: false,
    // Office staff create/edit/send estimates but cannot void a live document.
    canViewEstimates: true,
    canManageEstimates: true,
    canVoidEstimates: false,
    // Office staff run scheduling/dispatch (per the role table in CLAUDE.md §7).
    canViewSchedule: true,
    canManageSchedule: true,
    // Office staff run day-to-day project ops but cannot void a change order
    // or override an accepted-lock without escalation.
    canCloseWorkOrders: true,
    canManageWorkOrderTasks: true,
    canManageWorkOrderAttachments: true,
    canManageChecklistTemplates: true,
    canManageCompletionRequirements: false,
    canViewChangeOrders: true,
    canManageChangeOrders: true,
    canVoidChangeOrders: false,
    canOverrideChangeOrderLock: false,
    canApplyScheduleImpact: true,
    // Office staff run billing day-to-day (canManageInvoices: true) — view rides along.
    canViewInvoices: true,
    canManagePortalUsers: false,
    // Office staff do the day-to-day costing data entry (receipts, expenses)
    // but never see cost or margin — the same line already drawn by
    // canViewItemCosts: false / canViewFinancialReports: false above.
    canLogJobCosts: true,
    canViewJobCosting: false,
    canManageJobCosting: false,
  },
  [UserRole.TECHNICIAN]: {
    canViewAllWorkOrders: false,
    canCreateWorkOrders: false,
    canAssignTechnicians: false,
    canViewAllProperties: false,
    canEditProperties: false,
    canViewReports: false,
    canManageSettings: false,
    canManageTenants: false,
    canViewOwnJobsOnly: true,
    canSendEstimateEmail: false,
    canOverrideEstimateLock: false,
    canManageInvoices: false,
    canRefundPayments: false,
    canApproveTime: false,
    canViewFinancialReports: false,
    canInviteTeamMembers: false,
    canChangeTeamRoles: false,
    canReadAuditLog: false,
    // Technicians have no pricebook surface in Phase 2; revisit when Phase 3
    // estimate-building reaches the tech mobile view (ADR-0006).
    canViewPricebook: false,
    canCreatePricebookItems: false,
    canEditPricebookItems: false,
    canArchivePricebookItems: false,
    canViewItemCosts: false,
    canExportPricebook: false,
    // No estimate surface for technicians in Phase 3.
    canViewEstimates: false,
    canManageEstimates: false,
    canVoidEstimates: false,
    // Technicians see only their own visits (isTechnicianScoped) — no admin
    // calendar/dispatch surface.
    canViewSchedule: false,
    canManageSchedule: false,
    // Technicians can complete their own assigned tasks (route-level ownership
    // check, not this flag) but have no broader project-management surface.
    canCloseWorkOrders: false,
    canManageWorkOrderTasks: false,
    canManageWorkOrderAttachments: false,
    canManageChecklistTemplates: false,
    canManageCompletionRequirements: false,
    canViewChangeOrders: false,
    canManageChangeOrders: false,
    canVoidChangeOrders: false,
    canOverrideChangeOrderLock: false,
    canApplyScheduleImpact: false,
    // No billing surface for technicians.
    canViewInvoices: false,
    canManagePortalUsers: false,
    // Technicians log their own time/mileage/expenses — that IS their job — but
    // are structurally cost-blind: they never see their burdened rate, the job's
    // cost, or its margin (ADR-0016 §3).
    canLogJobCosts: true,
    canViewJobCosting: false,
    canManageJobCosting: false,
  },
  [UserRole.READ_ONLY_OWNER]: {
    canViewAllWorkOrders: true,
    canCreateWorkOrders: false,
    canAssignTechnicians: false,
    canViewAllProperties: true,
    canEditProperties: false,
    canViewReports: true,
    canManageSettings: false,
    canManageTenants: false,
    canViewOwnJobsOnly: false,
    canSendEstimateEmail: false,
    canOverrideEstimateLock: false,
    canManageInvoices: false,
    canRefundPayments: false,
    canApproveTime: false,
    canViewFinancialReports: true,
    canInviteTeamMembers: false,
    canChangeTeamRoles: false,
    canReadAuditLog: false,
    // The owner sees everything read-only, including costs and exports.
    canViewPricebook: true,
    canCreatePricebookItems: false,
    canEditPricebookItems: false,
    canArchivePricebookItems: false,
    canViewItemCosts: true,
    canExportPricebook: true,
    // Read-only owner can view estimates + activity but not create/send/void.
    canViewEstimates: true,
    canManageEstimates: false,
    canVoidEstimates: false,
    // Owner can view the schedule read-only but cannot dispatch.
    canViewSchedule: true,
    canManageSchedule: false,
    // Read-only across the board for project/change-order data.
    canCloseWorkOrders: false,
    canManageWorkOrderTasks: false,
    canManageWorkOrderAttachments: false,
    canManageChecklistTemplates: false,
    canManageCompletionRequirements: false,
    canViewChangeOrders: true,
    canManageChangeOrders: false,
    canVoidChangeOrders: false,
    canOverrideChangeOrderLock: false,
    canApplyScheduleImpact: false,
    // Read-only owner sees invoices/payments but cannot manage them.
    canViewInvoices: true,
    canManagePortalUsers: false,
    // Sees the money (consistent with canViewItemCosts / canViewFinancialReports
    // above) but writes nothing — read-only means read-only.
    canLogJobCosts: false,
    canViewJobCosting: true,
    canManageJobCosting: false,
  },
};
