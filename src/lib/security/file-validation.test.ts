import { describe, it, expect } from "vitest";
import { validateAndReencodeImage } from "./file-validation";

// 1x1 transparent PNG, valid magic bytes
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("validateAndReencodeImage", () => {
  it("accepts a real PNG and re-encodes it", async () => {
    const buffer = Buffer.from(TINY_PNG_BASE64, "base64");
    const result = await validateAndReencodeImage(buffer, { maxSizeBytes: 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.image.mime).toBe("image/png");
      expect(result.image.buffer.length).toBeGreaterThan(0);
    }
  });

  it("rejects a file whose content does not match any known image format", async () => {
    const buffer = Buffer.from("this is definitely not an image, just plain text padding", "utf8");
    const result = await validateAndReencodeImage(buffer, { maxSizeBytes: 1024 * 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejects a renamed non-image file even with image-like extension expectations", async () => {
    // A PDF magic-byte header masquerading as an upload — this is exactly the
    // spoofed-Content-Type scenario magic-byte sniffing exists to catch.
    const fakeImage = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100)]);
    const result = await validateAndReencodeImage(fakeImage, { maxSizeBytes: 1024 * 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejects files over the size limit", async () => {
    const buffer = Buffer.from(TINY_PNG_BASE64, "base64");
    const result = await validateAndReencodeImage(buffer, { maxSizeBytes: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty file", async () => {
    const result = await validateAndReencodeImage(Buffer.alloc(0), { maxSizeBytes: 1024 });
    expect(result.ok).toBe(false);
  });
});
