import { describe, it, expect } from "vitest";
import { assertPropertyAccess } from "./auth";
import type { PortalContext } from "@/types/portal";

const ctx: PortalContext = {
  portalCustomerId: "cust-1",
  tenantId: "tenant-1",
  sessionId: "sess-1",
  email: "dana@example.com",
  name: "Dana",
  propertyIds: ["prop-a", "prop-b"],
};

describe("assertPropertyAccess (portal property scoping)", () => {
  it("allows a linked property", () => {
    expect(assertPropertyAccess(ctx, "prop-a")).toBe(true);
    expect(assertPropertyAccess(ctx, "prop-b")).toBe(true);
  });

  it("denies a property the customer is not linked to (cross-customer isolation)", () => {
    expect(assertPropertyAccess(ctx, "prop-other")).toBe(false);
  });

  it("denies null/undefined/empty property ids", () => {
    expect(assertPropertyAccess(ctx, null)).toBe(false);
    expect(assertPropertyAccess(ctx, undefined)).toBe(false);
    expect(assertPropertyAccess(ctx, "")).toBe(false);
  });

  it("denies everything when the customer has no linked properties", () => {
    const empty: PortalContext = { ...ctx, propertyIds: [] };
    expect(assertPropertyAccess(empty, "prop-a")).toBe(false);
  });
});
