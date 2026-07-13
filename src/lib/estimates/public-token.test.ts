import { describe, it, expect } from "vitest";
import { generatePublicToken, hashPublicToken, checkTokenValidity } from "./public-token";

describe("generatePublicToken", () => {
  it("returns a high-entropy token and its matching hash", () => {
    const { token, hash } = generatePublicToken();
    expect(token.length).toBeGreaterThanOrEqual(42); // 32 bytes base64url ≈ 43 chars
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashPublicToken(token));
  });

  it("never stores the plaintext (hash is not derivable back to token, and differs)", () => {
    const { token, hash } = generatePublicToken();
    expect(hash).not.toBe(token);
  });

  it("produces distinct tokens across calls", () => {
    const a = generatePublicToken();
    const b = generatePublicToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashPublicToken", () => {
  it("is deterministic", () => {
    expect(hashPublicToken("abc")).toBe(hashPublicToken("abc"));
  });
  it("is sensitive to input", () => {
    expect(hashPublicToken("abc")).not.toBe(hashPublicToken("abd"));
  });
});

describe("checkTokenValidity", () => {
  const hash = "a".repeat(64);

  it("valid when a hash is present, not revoked, not expired", () => {
    expect(
      checkTokenValidity({ public_token_hash: hash, token_expires_at: "2999-01-01T00:00:00Z" })
    ).toEqual({ valid: true });
  });

  it("invalid with no token", () => {
    expect(checkTokenValidity({ public_token_hash: null })).toEqual({
      valid: false,
      reason: "no_token",
    });
  });

  it("invalid when revoked", () => {
    expect(
      checkTokenValidity({ public_token_hash: hash, token_revoked_at: "2026-07-11T00:00:00Z" })
    ).toEqual({ valid: false, reason: "revoked" });
  });

  it("invalid when expired", () => {
    expect(
      checkTokenValidity(
        { public_token_hash: hash, token_expires_at: "2026-07-01T00:00:00Z" },
        new Date("2026-07-15")
      )
    ).toEqual({ valid: false, reason: "expired" });
  });

  it("revocation takes precedence over expiry", () => {
    expect(
      checkTokenValidity(
        {
          public_token_hash: hash,
          token_revoked_at: "2026-07-10T00:00:00Z",
          token_expires_at: "2026-07-01T00:00:00Z",
        },
        new Date("2026-07-15")
      )
    ).toEqual({ valid: false, reason: "revoked" });
  });
});
