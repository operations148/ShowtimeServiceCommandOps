import type {
  Estimate,
  EstimateLineItem,
  PublicEstimate,
  PublicEstimateLineItem,
} from "@/types/estimate";
import { EstimateStatus } from "@/types/estimate";

/**
 * Redacts a full estimate down to the ONLY fields safe to expose on the public
 * customer route (Phase 3, ADR-0007). This is an allowlist, not a denylist:
 * the output type `PublicEstimate` literally cannot carry internal fields, so a
 * future column addition can never leak by default — it simply won't be copied.
 *
 * Explicitly NEVER exposed: internal_cost/unit_cost, markup, tax_category,
 * source pricebook pointers, internal_notes, tenant_id, GHL ids, estimator/
 * staff ids, token hashes, IP/user-agent capture, version internals.
 */

export interface TenantBranding {
  company_name: string;
  company_logo_url?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
}

function toPublicLine(line: EstimateLineItem): PublicEstimateLineItem {
  return {
    id: line.id,
    kind: line.kind,
    option_group: line.option_group ?? null,
    is_selected: line.is_selected,
    name: line.name,
    description: line.description ?? null,
    unit: line.unit ?? null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    taxable: line.taxable,
    total: line.total,
  };
}

export function isEstimateExpired(estimate: Pick<Estimate, "expires_at" | "status">, now = new Date()): boolean {
  if (estimate.status === EstimateStatus.EXPIRED) return true;
  if (!estimate.expires_at) return false;
  return new Date(estimate.expires_at).getTime() < now.getTime();
}

export function toPublicEstimate(
  estimate: Estimate,
  lines: EstimateLineItem[],
  branding: TenantBranding,
  now = new Date()
): PublicEstimate {
  return {
    estimate_number: estimate.estimate_number,
    title: estimate.title,
    status: estimate.status,
    customer_name: estimate.customer_name,
    issue_date: estimate.issue_date,
    expires_at: estimate.expires_at ?? null,
    customer_notes: estimate.customer_notes ?? null,
    terms: estimate.terms ?? null,
    proposal_template: estimate.proposal_template,

    subtotal: estimate.subtotal,
    tax_rate: estimate.tax_rate,
    tax_amount: estimate.tax_amount,
    discount_amount: estimate.discount_amount,
    total: estimate.total,

    line_items: lines
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toPublicLine),

    company_name: branding.company_name,
    company_logo_url: branding.company_logo_url ?? null,
    company_phone: branding.company_phone ?? null,
    company_email: branding.company_email ?? null,

    accepted_at: estimate.accepted_at ?? null,
    declined_at: estimate.declined_at ?? null,
    is_expired: isEstimateExpired(estimate, now),
  };
}
