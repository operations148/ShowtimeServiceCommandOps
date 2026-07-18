import { describe, it, expect } from "vitest";
import { rolePermissions } from "./roles";
import { UserRole } from "@/types/technician";

// Internal-cost permission matrix (Phase 2 requirement: "Do not expose
// internal cost to technicians or customer portal users unless explicitly
// permitted"). These assertions freeze the intended matrix — changing it
// should be a deliberate, reviewed act that updates this test.

describe("pricebook permission matrix", () => {
  it("technicians have no pricebook access at all", () => {
    const p = rolePermissions[UserRole.TECHNICIAN];
    expect(p.canViewPricebook).toBe(false);
    expect(p.canViewItemCosts).toBe(false);
    expect(p.canCreatePricebookItems).toBe(false);
    expect(p.canEditPricebookItems).toBe(false);
    expect(p.canArchivePricebookItems).toBe(false);
    expect(p.canExportPricebook).toBe(false);
  });

  it("office staff manage the pricebook but never see margins", () => {
    const p = rolePermissions[UserRole.OFFICE_STAFF];
    expect(p.canViewPricebook).toBe(true);
    expect(p.canCreatePricebookItems).toBe(true);
    expect(p.canEditPricebookItems).toBe(true);
    expect(p.canViewItemCosts).toBe(false);
    expect(p.canExportPricebook).toBe(false);
  });

  it("read-only owner sees everything including costs, writes nothing", () => {
    const p = rolePermissions[UserRole.READ_ONLY_OWNER];
    expect(p.canViewPricebook).toBe(true);
    expect(p.canViewItemCosts).toBe(true);
    expect(p.canExportPricebook).toBe(true);
    expect(p.canCreatePricebookItems).toBe(false);
    expect(p.canEditPricebookItems).toBe(false);
    expect(p.canArchivePricebookItems).toBe(false);
  });

  it("tenant admin and platform owner have full pricebook access", () => {
    for (const role of [UserRole.TENANT_ADMIN, UserRole.PLATFORM_OWNER]) {
      const p = rolePermissions[role];
      expect(p.canViewPricebook).toBe(true);
      expect(p.canCreatePricebookItems).toBe(true);
      expect(p.canEditPricebookItems).toBe(true);
      expect(p.canArchivePricebookItems).toBe(true);
      expect(p.canViewItemCosts).toBe(true);
      expect(p.canExportPricebook).toBe(true);
    }
  });
});

describe("estimate permission matrix (Phase 3)", () => {
  it("technicians have no estimate surface", () => {
    const p = rolePermissions[UserRole.TECHNICIAN];
    expect(p.canViewEstimates).toBe(false);
    expect(p.canManageEstimates).toBe(false);
    expect(p.canVoidEstimates).toBe(false);
  });

  it("office staff manage and send but cannot void", () => {
    const p = rolePermissions[UserRole.OFFICE_STAFF];
    expect(p.canViewEstimates).toBe(true);
    expect(p.canManageEstimates).toBe(true);
    expect(p.canSendEstimateEmail).toBe(true);
    expect(p.canVoidEstimates).toBe(false);
    expect(p.canOverrideEstimateLock).toBe(false);
  });

  it("read-only owner views estimates but cannot manage, send, or void", () => {
    const p = rolePermissions[UserRole.READ_ONLY_OWNER];
    expect(p.canViewEstimates).toBe(true);
    expect(p.canManageEstimates).toBe(false);
    expect(p.canSendEstimateEmail).toBe(false);
    expect(p.canVoidEstimates).toBe(false);
  });

  it("tenant admin and platform owner have full estimate control incl. override", () => {
    for (const role of [UserRole.TENANT_ADMIN, UserRole.PLATFORM_OWNER]) {
      const p = rolePermissions[role];
      expect(p.canViewEstimates).toBe(true);
      expect(p.canManageEstimates).toBe(true);
      expect(p.canVoidEstimates).toBe(true);
      expect(p.canOverrideEstimateLock).toBe(true);
    }
  });
});

describe("scheduling permission matrix (Phase 4)", () => {
  it("technicians get no admin schedule surface (own-visit scoped instead)", () => {
    const p = rolePermissions[UserRole.TECHNICIAN];
    expect(p.canViewSchedule).toBe(false);
    expect(p.canManageSchedule).toBe(false);
    expect(p.canAssignTechnicians).toBe(false);
  });

  it("office staff can view and manage the schedule", () => {
    const p = rolePermissions[UserRole.OFFICE_STAFF];
    expect(p.canViewSchedule).toBe(true);
    expect(p.canManageSchedule).toBe(true);
    expect(p.canAssignTechnicians).toBe(true);
  });

  it("read-only owner can view but not manage the schedule", () => {
    const p = rolePermissions[UserRole.READ_ONLY_OWNER];
    expect(p.canViewSchedule).toBe(true);
    expect(p.canManageSchedule).toBe(false);
  });

  it("tenant admin and platform owner fully manage the schedule", () => {
    for (const role of [UserRole.TENANT_ADMIN, UserRole.PLATFORM_OWNER]) {
      const p = rolePermissions[role];
      expect(p.canViewSchedule).toBe(true);
      expect(p.canManageSchedule).toBe(true);
    }
  });
});

describe("work-order project + change-order permission matrix (Phase 5)", () => {
  it("technicians have no project-management or change-order surface", () => {
    const p = rolePermissions[UserRole.TECHNICIAN];
    expect(p.canCloseWorkOrders).toBe(false);
    expect(p.canManageWorkOrderTasks).toBe(false);
    expect(p.canManageWorkOrderAttachments).toBe(false);
    expect(p.canViewChangeOrders).toBe(false);
    expect(p.canManageChangeOrders).toBe(false);
    expect(p.canOverrideChangeOrderLock).toBe(false);
  });

  it("office staff run day-to-day project ops but cannot void or override a change order", () => {
    const p = rolePermissions[UserRole.OFFICE_STAFF];
    expect(p.canCloseWorkOrders).toBe(true);
    expect(p.canManageWorkOrderTasks).toBe(true);
    expect(p.canViewChangeOrders).toBe(true);
    expect(p.canManageChangeOrders).toBe(true);
    expect(p.canVoidChangeOrders).toBe(false);
    expect(p.canOverrideChangeOrderLock).toBe(false);
    expect(p.canManageCompletionRequirements).toBe(false);
  });

  it("read-only owner can view change orders but manage nothing", () => {
    const p = rolePermissions[UserRole.READ_ONLY_OWNER];
    expect(p.canViewChangeOrders).toBe(true);
    expect(p.canManageChangeOrders).toBe(false);
    expect(p.canCloseWorkOrders).toBe(false);
  });

  it("tenant admin and platform owner have full control including override and completion-requirement config", () => {
    for (const role of [UserRole.TENANT_ADMIN, UserRole.PLATFORM_OWNER]) {
      const p = rolePermissions[role];
      expect(p.canCloseWorkOrders).toBe(true);
      expect(p.canManageChangeOrders).toBe(true);
      expect(p.canVoidChangeOrders).toBe(true);
      expect(p.canOverrideChangeOrderLock).toBe(true);
      expect(p.canManageCompletionRequirements).toBe(true);
    }
  });
});

describe("invoice + payment permission matrix (Phase 6)", () => {
  it("technicians have no billing surface", () => {
    const p = rolePermissions[UserRole.TECHNICIAN];
    expect(p.canViewInvoices).toBe(false);
    expect(p.canManageInvoices).toBe(false);
    expect(p.canRefundPayments).toBe(false);
  });

  it("office staff run billing day-to-day but cannot refund", () => {
    const p = rolePermissions[UserRole.OFFICE_STAFF];
    expect(p.canViewInvoices).toBe(true);
    expect(p.canManageInvoices).toBe(true);
    expect(p.canRefundPayments).toBe(false);
    // Stripe Connect onboarding rides canManageSettings — staff cannot onboard.
    expect(p.canManageSettings).toBe(false);
  });

  it("read-only owner views invoices but manages nothing", () => {
    const p = rolePermissions[UserRole.READ_ONLY_OWNER];
    expect(p.canViewInvoices).toBe(true);
    expect(p.canManageInvoices).toBe(false);
    expect(p.canRefundPayments).toBe(false);
  });

  it("tenant admin and platform owner have the full billing surface including refunds", () => {
    for (const role of [UserRole.TENANT_ADMIN, UserRole.PLATFORM_OWNER]) {
      const p = rolePermissions[role];
      expect(p.canViewInvoices).toBe(true);
      expect(p.canManageInvoices).toBe(true);
      expect(p.canRefundPayments).toBe(true);
      expect(p.canManageSettings).toBe(true);
    }
  });
});

describe("customer-portal admin permission matrix (Phase 7)", () => {
  it("only tenant admin and platform owner can manage portal users", () => {
    expect(rolePermissions[UserRole.PLATFORM_OWNER].canManagePortalUsers).toBe(true);
    expect(rolePermissions[UserRole.TENANT_ADMIN].canManagePortalUsers).toBe(true);
  });

  it("office staff, technicians, and read-only owners cannot manage portal users", () => {
    expect(rolePermissions[UserRole.OFFICE_STAFF].canManagePortalUsers).toBe(false);
    expect(rolePermissions[UserRole.TECHNICIAN].canManagePortalUsers).toBe(false);
    expect(rolePermissions[UserRole.READ_ONLY_OWNER].canManagePortalUsers).toBe(false);
  });
});

describe("job-costing permission matrix (Phase 9)", () => {
  // The defining rule of ADR-0016 §3: a technician records costs but is blind
  // to them. If this test ever goes green with canViewJobCosting: true for a
  // technician, the field app is leaking labor rates and job margin.
  it("technicians CAN log job costs", () => {
    expect(rolePermissions[UserRole.TECHNICIAN].canLogJobCosts).toBe(true);
  });

  it("technicians can NEVER view costs or margin", () => {
    expect(rolePermissions[UserRole.TECHNICIAN].canViewJobCosting).toBe(false);
    expect(rolePermissions[UserRole.TECHNICIAN].canManageJobCosting).toBe(false);
  });

  it("cost visibility follows the same owners-only line as pricebook costs", () => {
    for (const role of [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.READ_ONLY_OWNER]) {
      expect(rolePermissions[role].canViewJobCosting).toBe(true);
      expect(rolePermissions[role].canViewItemCosts).toBe(true);
    }
    // Office staff run billing but see neither pricebook cost nor job cost.
    expect(rolePermissions[UserRole.OFFICE_STAFF].canViewJobCosting).toBe(false);
    expect(rolePermissions[UserRole.OFFICE_STAFF].canViewItemCosts).toBe(false);
  });

  it("office staff can do costing data entry without seeing cost", () => {
    expect(rolePermissions[UserRole.OFFICE_STAFF].canLogJobCosts).toBe(true);
    expect(rolePermissions[UserRole.OFFICE_STAFF].canViewJobCosting).toBe(false);
  });

  it("read-only owner sees the money but writes nothing", () => {
    expect(rolePermissions[UserRole.READ_ONLY_OWNER].canViewJobCosting).toBe(true);
    expect(rolePermissions[UserRole.READ_ONLY_OWNER].canLogJobCosts).toBe(false);
    expect(rolePermissions[UserRole.READ_ONLY_OWNER].canManageJobCosting).toBe(false);
  });

  it("only owners may edit others' entries or set labor rates", () => {
    expect(rolePermissions[UserRole.PLATFORM_OWNER].canManageJobCosting).toBe(true);
    expect(rolePermissions[UserRole.TENANT_ADMIN].canManageJobCosting).toBe(true);
    expect(rolePermissions[UserRole.OFFICE_STAFF].canManageJobCosting).toBe(false);
  });

  it("anyone who can view job costing can also view financial reports (no back door)", () => {
    for (const role of Object.values(UserRole)) {
      if (rolePermissions[role].canViewJobCosting) {
        expect(rolePermissions[role].canViewFinancialReports).toBe(true);
      }
    }
  });
});

describe("platform-admin permission matrix (Phase 10)", () => {
  it("only the platform owner may manage tenants (cross-tenant surface)", () => {
    expect(rolePermissions[UserRole.PLATFORM_OWNER].canManageTenants).toBe(true);
    for (const role of [UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF, UserRole.TECHNICIAN, UserRole.READ_ONLY_OWNER]) {
      expect(rolePermissions[role].canManageTenants).toBe(false);
    }
  });
});
