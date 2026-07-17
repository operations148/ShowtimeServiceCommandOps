/**
 * Stable client-generated id per captured photo (Phase 8, ADR-0015 §3). The
 * server embeds it in the stored object name and treats a repeat id as a no-op,
 * so an auto-retried offline upload can never create a duplicate. Pure + safe
 * on both client and server.
 */
export function generatePhotoId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Server-side sanitizer: the id becomes part of a storage path, so keep it strict. */
export function sanitizePhotoId(raw: string): string | null {
  const clean = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
  return clean.length >= 8 ? clean : null;
}
