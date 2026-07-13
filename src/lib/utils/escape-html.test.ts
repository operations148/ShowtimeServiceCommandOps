import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"
    );
  });
  it("escapes ampersands and quotes and backticks", () => {
    expect(escapeHtml('Tom & "Jerry" `co`')).toBe("Tom &amp; &quot;Jerry&quot; &#96;co&#96;");
  });
  it("neutralizes an attribute-breakout attempt", () => {
    expect(escapeHtml('" onmouseover="alert(1)')).toBe("&quot; onmouseover=&quot;alert(1)");
  });
  it("returns empty string for null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
  it("stringifies numbers and booleans", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(true)).toBe("true");
  });
  it("leaves safe text untouched", () => {
    expect(escapeHtml("Pool Remodel 2026")).toBe("Pool Remodel 2026");
  });
});
