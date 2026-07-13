import { describe, it, expect } from "vitest";
import { generateToken, hashToken, safeCompare } from "./tokens";

describe("tokens", () => {
  it("generates unique tokens", () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it("hashes deterministically", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it("safeCompare matches equal strings", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
  });

  it("safeCompare rejects different strings without throwing on length mismatch", () => {
    expect(safeCompare("abc", "abcd")).toBe(false);
    expect(safeCompare("abc", "xyz")).toBe(false);
  });
});
