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
