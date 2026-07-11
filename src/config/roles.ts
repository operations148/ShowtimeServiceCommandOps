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
  },
};
