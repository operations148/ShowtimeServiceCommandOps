import { describe, it, expect } from "vitest";
import { pdfText } from "./pdf-text";

describe("pdfText", () => {
  it("passes clean text through", () => {
    expect(pdfText("Pool Remodel — Phase 2")).toBe("Pool Remodel — Phase 2");
  });
  it("strips control characters but keeps newline and tab", () => {
    expect(pdfText("a\x00b\x07c\td\ne")).toBe("abc\td\ne");
  });
  it("strips DEL and C1 controls", () => {
    expect(pdfText("x\x7Fy\x9Az")).toBe("xyz");
  });
  it("coerces null/undefined to empty", () => {
    expect(pdfText(null)).toBe("");
    expect(pdfText(undefined)).toBe("");
  });
  it("coerces non-strings", () => {
    expect(pdfText(42)).toBe("42");
  });
  it("caps pathological length with an ellipsis", () => {
    const out = pdfText("a".repeat(5000), 100);
    expect(out.length).toBe(100);
    expect(out.endsWith("…")).toBe(true);
  });
});
