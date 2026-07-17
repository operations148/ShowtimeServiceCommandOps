import { describe, it, expect } from "vitest";
import { generatePhotoId, sanitizePhotoId } from "./photo-id";

describe("generatePhotoId", () => {
  it("produces a non-empty alphanumeric id", () => {
    const id = generatePhotoId();
    expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    expect(id.length).toBeGreaterThanOrEqual(8);
  });

  it("is unique across calls (idempotency depends on stability, not collisions)", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generatePhotoId()));
    expect(ids.size).toBe(500);
  });
});

describe("sanitizePhotoId", () => {
  it("passes through a clean id", () => {
    expect(sanitizePhotoId("abc123def456")).toBe("abc123def456");
  });

  it("strips path-dangerous characters", () => {
    expect(sanitizePhotoId("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizePhotoId("a1/b2.c3-d4_e5")).toBe("a1b2c3d4e5");
  });

  it("rejects too-short ids (an attacker can't force a broad dedup marker)", () => {
    expect(sanitizePhotoId("short")).toBeNull();
    expect(sanitizePhotoId("")).toBeNull();
    expect(sanitizePhotoId("!!!!!!")).toBeNull();
  });

  it("caps length so it can't blow up the storage path", () => {
    const long = "a".repeat(200);
    expect(sanitizePhotoId(long)?.length).toBe(40);
  });
});
