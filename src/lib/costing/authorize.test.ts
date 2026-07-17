import { describe, it, expect } from "vitest";
import type { Session } from "next-auth";
import { canViewCosts, canManageAnyEntry, canModifyEntry, resolveEntryTechnicianId } from "./authorize";
import { UserRole } from "@/types/technician";

function sessionFor(role: UserRole, technicianId?: string, userId = "u1"): Session {
  return {
    user: { id: userId, role, technician_id: technicianId, tenant_id: "ten1" },
    expires: "",
  } as unknown as Session;
}

describe("canViewCosts", () => {
  it("is true for owners, false for office staff and technicians", () => {
    expect(canViewCosts(sessionFor(UserRole.PLATFORM_OWNER))).toBe(true);
    expect(canViewCosts(sessionFor(UserRole.TENANT_ADMIN))).toBe(true);
    expect(canViewCosts(sessionFor(UserRole.READ_ONLY_OWNER))).toBe(true);
    expect(canViewCosts(sessionFor(UserRole.OFFICE_STAFF))).toBe(false);
    expect(canViewCosts(sessionFor(UserRole.TECHNICIAN, "tech1"))).toBe(false);
  });
});

describe("canManageAnyEntry", () => {
  it("is owner-only", () => {
    expect(canManageAnyEntry(sessionFor(UserRole.TENANT_ADMIN))).toBe(true);
    expect(canManageAnyEntry(sessionFor(UserRole.OFFICE_STAFF))).toBe(false);
    expect(canManageAnyEntry(sessionFor(UserRole.TECHNICIAN, "tech1"))).toBe(false);
    expect(canManageAnyEntry(sessionFor(UserRole.READ_ONLY_OWNER))).toBe(false);
  });
});

describe("canModifyEntry", () => {
  it("lets an owner modify anyone's entry", () => {
    const admin = sessionFor(UserRole.TENANT_ADMIN);
    expect(canModifyEntry(admin, { technicianId: "someone-else" })).toBe(true);
  });

  it("lets a technician modify their OWN entry", () => {
    const tech = sessionFor(UserRole.TECHNICIAN, "tech1");
    expect(canModifyEntry(tech, { technicianId: "tech1" })).toBe(true);
  });

  it("BLOCKS a technician from modifying a colleague's entry", () => {
    const tech = sessionFor(UserRole.TECHNICIAN, "tech1");
    expect(canModifyEntry(tech, { technicianId: "tech2" })).toBe(false);
  });

  it("blocks a read-only owner from modifying anything (view != write)", () => {
    const ro = sessionFor(UserRole.READ_ONLY_OWNER);
    expect(canModifyEntry(ro, { technicianId: "tech1" })).toBe(false);
    expect(canModifyEntry(ro, { createdBy: "u1" })).toBe(false);
  });

  it("falls back to created_by for expenses (which have no technician_id)", () => {
    const staff = sessionFor(UserRole.OFFICE_STAFF, undefined, "u1");
    expect(canModifyEntry(staff, { createdBy: "u1" })).toBe(true);
    expect(canModifyEntry(staff, { createdBy: "u2" })).toBe(false);
  });

  it("denies when ownership is indeterminable", () => {
    const staff = sessionFor(UserRole.OFFICE_STAFF);
    expect(canModifyEntry(staff, {})).toBe(false);
  });
});

describe("resolveEntryTechnicianId", () => {
  it("FORCES a technician to log against themselves, ignoring a requested id", () => {
    const tech = sessionFor(UserRole.TECHNICIAN, "tech1");
    // A tech attempting to attribute time to a colleague is ignored.
    expect(resolveEntryTechnicianId(tech, "tech2")).toBe("tech1");
    expect(resolveEntryTechnicianId(tech, undefined)).toBe("tech1");
  });

  it("lets office staff log on another technician's behalf", () => {
    const staff = sessionFor(UserRole.OFFICE_STAFF);
    expect(resolveEntryTechnicianId(staff, "tech2")).toBe("tech2");
  });
});
