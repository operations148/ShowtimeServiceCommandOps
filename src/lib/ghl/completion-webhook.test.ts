import { describe, it, expect } from "vitest";
import { buildCompletionPayload } from "./completion-webhook";
import type { WorkOrderWithRelations } from "@/types/work-order";

function wo(over: Partial<WorkOrderWithRelations> = {}): WorkOrderWithRelations {
  return {
    id: "wo1", tenant_id: "ten1",
    wo_number: "WO-0042", title: "Weekly pool service", service_category: "maintenance",
    property_id: "p1", property_address: "1 Pool Ln, Malibu, CA 90265", property_customer_name: "Jane Doe",
    ghl_contact_id: "c_123", ghl_opportunity_id: "o_456",
    tech_completed_at: "2026-07-19T18:00:00Z", tech_completed_by: "Mike R.", tech_completion_message: "All chemistry balanced.",
    ...over,
  } as unknown as WorkOrderWithRelations;
}

describe("buildCompletionPayload", () => {
  it("carries the fields a GHL review workflow needs to match + personalize", () => {
    const p = buildCompletionPayload(wo(), "Showtime Pool Service");
    expect(p).toMatchObject({
      event: "work_order.completed",
      ghl_contact_id: "c_123",
      ghl_opportunity_id: "o_456",
      work_order_number: "WO-0042",
      customer_name: "Jane Doe",
      property_address: "1 Pool Ln, Malibu, CA 90265",
      completed_by: "Mike R.",
      completion_message: "All chemistry balanced.",
      tenant_name: "Showtime Pool Service",
      source: "serviceops",
    });
  });

  it("nulls GHL ids for a manually-created work order (still fires — matches on name/address)", () => {
    const p = buildCompletionPayload(wo({ ghl_contact_id: undefined, ghl_opportunity_id: undefined }));
    expect(p.ghl_contact_id).toBeNull();
    expect(p.ghl_opportunity_id).toBeNull();
    expect(p.customer_name).toBe("Jane Doe"); // still present for matching
  });

  it("falls back to a provided completion time when the WO has none", () => {
    const p = buildCompletionPayload(wo({ tech_completed_at: undefined }), null, "2026-07-19T20:00:00Z");
    expect(p.completed_at).toBe("2026-07-19T20:00:00Z");
  });

  it("tolerates missing optional fields", () => {
    const p = buildCompletionPayload(wo({ tech_completed_by: undefined, tech_completion_message: undefined }));
    expect(p.completed_by).toBeNull();
    expect(p.completion_message).toBeNull();
  });
});
