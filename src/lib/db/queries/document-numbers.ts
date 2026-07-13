import { db } from "@/lib/db/client";

/**
 * Tenant-safe document numbering (Phase 2).
 *
 * Replaces app-layer COUNT(*)+1 (race-prone: two concurrent creators read the
 * same count and both issue e.g. INV-0007). Numbers are claimed by the
 * next_document_number() Postgres function — a single atomic
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING statement. Concurrent
 * callers serialize on the (tenant_id, doc_type) row lock and each receive a
 * distinct, monotonically increasing value. Duplicates are impossible; gaps
 * are possible when a claimed number's document insert subsequently fails
 * (claimed numbers are never reused). See migration 20260711000002 and
 * ADR-0005 for the full concurrency analysis.
 *
 * wo_number is NOT managed here — it predates this system as a DB identity
 * column and is already concurrency-safe (see ADR-0005 for why it stays).
 */

export type DocumentType = "invoice" | "estimate" | "change_order" | "payment";

const DOC_PREFIX: Record<DocumentType, string> = {
  invoice: "INV",
  estimate: "EST",
  change_order: "CO",
  payment: "PAY",
};

/**
 * Formats a claimed sequence value for display: (invoice, 7) → "INV-0007".
 * Values past 9999 widen naturally ("INV-12345") — padStart never truncates.
 */
export function formatDocumentNumber(docType: DocumentType, value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`document number must be a positive integer, got ${value}`);
  }
  return `${DOC_PREFIX[docType]}-${String(value).padStart(4, "0")}`;
}

/**
 * Claims the next number for (tenant, docType) and returns it formatted.
 * Throws on any DB failure — callers must not fall back to COUNT-based
 * numbering, ever.
 */
export async function nextDocumentNumber(
  tenantId: string,
  docType: DocumentType
): Promise<string> {
  const { data, error } = await db.rpc("next_document_number", {
    p_tenant_id: tenantId,
    p_doc_type: docType,
  });

  if (error) {
    throw new Error(`[db] next_document_number(${docType}): ${error.message}`);
  }

  const value = Number(data);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `[db] next_document_number(${docType}) returned a non-positive value: ${String(data)}`
    );
  }

  return formatDocumentNumber(docType, value);
}
