/**
 * Shared image upload validation: magic-byte sniffing (not just trusting the
 * client-supplied Content-Type) plus re-encoding, which strips all EXIF/GPS/
 * ICC metadata as a side effect (security-audit M4/M6 — no upload path
 * previously did either). Used by the avatar, company-logo, and job-photo
 * upload routes.
 */

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ValidatedImage {
  /** Re-encoded image bytes with all metadata stripped. */
  buffer: Buffer;
  /** The image's real (sniffed, not client-claimed) MIME type. */
  mime: string;
  /** File extension matching `mime`, safe to use in a storage key. */
  ext: string;
}

export type ImageValidationResult =
  | { ok: true; image: ValidatedImage }
  | { ok: false; reason: string };

export interface ValidateImageOptions {
  maxSizeBytes: number;
}

export async function validateAndReencodeImage(
  input: Buffer,
  { maxSizeBytes }: ValidateImageOptions
): Promise<ImageValidationResult> {
  if (input.length === 0) {
    return { ok: false, reason: "File is empty." };
  }
  if (input.length > maxSizeBytes) {
    return {
      ok: false,
      reason: `File too large. Maximum size is ${Math.round(maxSizeBytes / (1024 * 1024))} MB.`,
    };
  }

  const sniffed = await fileTypeFromBuffer(input);
  if (!sniffed || !ALLOWED_IMAGE_MIMES.has(sniffed.mime)) {
    return { ok: false, reason: "Unsupported file type. Use JPEG, PNG, or WebP." };
  }

  // Re-encoding via sharp both normalizes the format and strips all metadata
  // (EXIF/GPS/ICC) by default — sharp only preserves it when .withMetadata()
  // is explicitly called, which this deliberately never does.
  let reencoded: Buffer;
  try {
    const pipeline = sharp(input, { failOn: "error" });
    if (sniffed.mime === "image/png") {
      reencoded = await pipeline.png().toBuffer();
    } else if (sniffed.mime === "image/webp") {
      reencoded = await pipeline.webp().toBuffer();
    } else {
      reencoded = await pipeline.jpeg({ quality: 90 }).toBuffer();
    }
  } catch {
    return { ok: false, reason: "Could not process image. The file may be corrupted." };
  }

  return { ok: true, image: { buffer: reencoded, mime: sniffed.mime, ext: sniffed.ext } };
}
