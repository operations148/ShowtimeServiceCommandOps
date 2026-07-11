import { describe, it, expect } from "vitest";
import { checkPasswordStrength } from "./password-policy";

describe("checkPasswordStrength", () => {
  it("rejects short passwords", () => {
    expect(checkPasswordStrength("Ab1").ok).toBe(false);
  });

  it("rejects common passwords", () => {
    expect(checkPasswordStrength("password123").ok).toBe(false);
  });

  it("rejects letters-only passwords", () => {
    expect(checkPasswordStrength("onlyletters").ok).toBe(false);
  });

  it("accepts a reasonable password", () => {
    expect(checkPasswordStrength("Correct-Horse-9").ok).toBe(true);
  });

  it("rejects passwords over 128 characters", () => {
    expect(checkPasswordStrength("Aa1" + "x".repeat(130)).ok).toBe(false);
  });
});
