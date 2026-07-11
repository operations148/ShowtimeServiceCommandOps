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
  },
};
