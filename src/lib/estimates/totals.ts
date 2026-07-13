import { calcDocumentTotals, type DocumentLineInput } from "@/lib/money/money";
import type { EstimateLineItem } from "@/types/estimate";

/**
 * Authoritative estimate totals (Phase 3). Computed server-side from stored
 * line items — never trusted from the client or the browser.
 *
 * Only SELECTED lines contribute: standard lines are always selected; optional
 * and package/recommended lines contribute only when `is_selected` is true.
 * This is the single place selection is turned into money, so the public
 * accept path and the admin edit path agree by construction.
 */

export interface EstimateTotals {
  subtotal: number;
  discount_amount: number;
  taxable_base: number;
  tax_amount: number;
  total: number;
}

export function selectedLines(lines: EstimateLineItem[]): EstimateLineItem[] {
  return lines.filter((l) => l.kind === "standard" || l.is_selected);
}

export function computeEstimateTotals(
  lines: EstimateLineItem[],
  taxRate: number,
  documentDiscountCents = 0
): EstimateTotals {
  const docLines: DocumentLineInput[] = selectedLines(lines).map((l) => ({
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount_amount: l.discount_amount,
    taxable: l.taxable,
  }));

  return calcDocumentTotals({
    lines: docLines,
    taxRate,
    documentDiscountCents,
  });
}

/**
 * Validates a set of customer selections against the stored lines before
 * acceptance: every referenced id must exist and be selectable (optional/
 * recommended), and at most one line per option_group may be selected
 * (mutually-exclusive packages). Returns the normalized selected-id set or an
 * error describing the first violation.
 */
export type SelectionResult =
  | { ok: true; selectedIds: Set<string> }
  | { ok: false; reason: string };

export function validateSelections(
  lines: EstimateLineItem[],
  requestedSelectedIds: string[]
): SelectionResult {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const requested = new Set(requestedSelectedIds);

  for (const id of requested) {
    const line = byId.get(id);
    if (!line) return { ok: false, reason: `Unknown line item: ${id}` };
    if (line.kind === "standard") {
      // Selecting a standard line is a no-op (always included) but not an error.
      continue;
    }
  }

  // Enforce one-per-option-group among the requested selections.
  const groupSeen = new Set<string>();
  for (const id of requested) {
    const line = byId.get(id);
    if (!line?.option_group) continue;
    if (groupSeen.has(line.option_group)) {
      return {
        ok: false,
        reason: `Only one option may be selected from group "${line.option_group}"`,
      };
    }
    groupSeen.add(line.option_group);
  }

  return { ok: true, selectedIds: requested };
}

/**
 * Applies a validated selection set to the lines, returning a new array with
 * `is_selected` reflecting the customer's choices (standard lines forced true,
 * optional/recommended set from the selection set). Pure — does not mutate.
 */
export function applySelections(
  lines: EstimateLineItem[],
  selectedIds: Set<string>
): EstimateLineItem[] {
  return lines.map((l) => ({
    ...l,
    is_selected: l.kind === "standard" ? true : selectedIds.has(l.id),
  }));
}
