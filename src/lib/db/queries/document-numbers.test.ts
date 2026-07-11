import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase client before importing the module under test.
const rpcMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { formatDocumentNumber, nextDocumentNumber } from "./document-numbers";

describe("formatDocumentNumber", () => {
  it("pads to 4 digits per document type", () => {
    expect(formatDocumentNumber("invoice", 7)).toBe("INV-0007");
    expect(formatDocumentNumber("estimate", 42)).toBe("EST-0042");
    expect(formatDocumentNumber("change_order", 1)).toBe("CO-0001");
    expect(formatDocumentNumber("payment", 999)).toBe("PAY-0999");
  });

  it("widens past 9999 without truncating", () => {
    expect(formatDocumentNumber("invoice", 12345)).toBe("INV-12345");
  });

  it("rejects zero, negatives, and non-integers", () => {
    expect(() => formatDocumentNumber("invoice", 0)).toThrow(RangeError);
    expect(() => formatDocumentNumber("invoice", -1)).toThrow(RangeError);
    expect(() => formatDocumentNumber("invoice", 1.5)).toThrow(RangeError);
  });
});

describe("nextDocumentNumber", () => {
  beforeEach(() => rpcMock.mockReset());

  it("calls the RPC with tenant and type, formats the result", async () => {
    rpcMock.mockResolvedValue({ data: 8, error: null });
    const result = await nextDocumentNumber("tenant-a", "invoice");
    expect(result).toBe("INV-0008");
    expect(rpcMock).toHaveBeenCalledWith("next_document_number", {
      p_tenant_id: "tenant-a",
      p_doc_type: "invoice",
    });
  });

  it("handles bigint-as-string responses from PostgREST", async () => {
    rpcMock.mockResolvedValue({ data: "15", error: null });
    expect(await nextDocumentNumber("tenant-a", "estimate")).toBe("EST-0015");
  });

  it("throws on RPC error — never falls back to COUNT-based numbering", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(nextDocumentNumber("tenant-a", "invoice")).rejects.toThrow(/boom/);
  });

  it("throws on a non-positive or non-numeric value", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });
    await expect(nextDocumentNumber("tenant-a", "invoice")).rejects.toThrow(/non-positive/);

    rpcMock.mockResolvedValue({ data: "not-a-number", error: null });
    await expect(nextDocumentNumber("tenant-a", "invoice")).rejects.toThrow(/non-positive/);
  });
});
