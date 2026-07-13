import type {
  ChangeOrder,
  ChangeOrderLineItem,
  PublicChangeOrder,
  PublicChangeOrderLineItem,
} from "@/types/change-order";
import { ChangeOrderStatus } from "@/types/change-order";
import type { TenantBranding } from "@/lib/estimates/public-serializer";

/**
 * Redacts a full change order down to the ONLY fields safe to expose on the
 * public customer route (Phase 5, reusing the ADR-0007 allowlist pattern).
 * `PublicChangeOrder` structurally cannot carry internal fields — a future
 * column addition can't leak by default. Explicitly NEVER exposed:
 * cost_impact_cents, unit_cost on lines, source pricebook pointers,
 * internal_notes, tenant_id, staff/estimator ids, token hashes, IP/UA.
 */

function toPublicLine(line: ChangeOrderLineItem): PublicChangeOrderLineItem {
  return {
    id: line.id,
    name: line.name,
    description: line.description ?? null,
    unit: line.unit ?? null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    taxable: line.taxable,
    total: line.total,
  };
}

export function isChangeOrderExpired(
  co: Pick<ChangeOrder, "token_expires_at" | "status">,
  now = new Date()
): boolean {
  if (co.status === ChangeOrderStatus.EXPIRED) return true;
  if (!co.token_expires_at) return false;
  return new Date(co.token_expires_at).getTime() < now.getTime();
}

export function toPublicChangeOrder(
  co: ChangeOrder,
  lines: ChangeOrderLineItem[],
  branding: TenantBranding,
  now = new Date()
): PublicChangeOrder {
  return {
    change_order_number: co.change_order_number,
    reason: co.reason,
    scope_description: co.scope_description ?? null,
    status: co.status,
    customer_name: co.customer_name,

    price_impact_cents: co.price_impact_cents,
    tax_impact_cents: co.tax_impact_cents,
    total_impact_cents: co.total_impact_cents,

    schedule_impact_days: co.schedule_impact_days ?? null,
    schedule_impact_note: co.schedule_impact_note ?? null,

    customer_notes: co.customer_notes ?? null,
    line_items: lines
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toPublicLine),

    company_name: branding.company_name,
    company_logo_url: branding.company_logo_url ?? null,
    company_phone: branding.company_phone ?? null,
    company_email: branding.company_email ?? null,

    accepted_at: co.accepted_at ?? null,
    rejected_at: co.rejected_at ?? null,
    is_expired: isChangeOrderExpired(co, now),
  };
}
