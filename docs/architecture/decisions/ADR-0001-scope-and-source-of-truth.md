# ADR-0001 — Scope and Source-of-Truth for the Markate-Inspired Expansion

**Status**: Accepted
**Date**: 2026-07-11
**Context**: Phase 0 repository audit, `ServiceOps_Claude_Code_All_Phases.md`

## Context

ServiceOps Command Center is an existing production SaaS (live for Showtime Pool Service) built around a strict boundary: GoHighLevel (GHL) owns CRM/contacts/conversations/marketing/calendar, and ServiceOps owns field-operations records (work orders, properties, visits, checklists, photos, notes, recurring schedules, estimate handoffs). This boundary is codified in `CLAUDE.md`, `.claude/rules/ghl-source-of-truth.md`, and `.claude/rules/product-boundaries.md`, and has held for 15 completed build phases.

The requester has now supplied a 12-phase expansion plan (`ServiceOps_Claude_Code_All_Phases.md`) modeled on Markate's feature set (pricebook, full estimates/proposals, dispatch/calendar, change orders, invoices + Stripe, customer portal, technician PWA, time/mileage/job-costing, platform admin/white-label). The plan explicitly excludes AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, and a native mobile app — i.e. it deliberately does **not** ask ServiceOps to become a CRM or a marketing platform. This is consistent with, not a reversal of, the existing GHL-boundary rules.

## Decision

1. **The existing GHL source-of-truth boundary is preserved without modification.** GHL remains authoritative for contacts, conversations, lead pipeline/opportunity status, calendars, forms, SMS/email, and marketing workflows. Every new module in this expansion (pricebook, estimates, dispatch, change orders, invoices, customer portal, time/costing, reporting, platform admin) is additive to ServiceOps's existing ownership of operational data — it does not migrate any GHL-owned data into ServiceOps, and it does not duplicate GHL functionality under a new name.

2. **"ServiceOps owns" is extended, not redefined**, to explicitly include: pricebook/items, full estimate/proposal documents (superseding estimate-handoff-only tracking), dispatch/schedule/visit assignment, change orders, invoices and payment ledger, time/mileage/expense/job-costing records, and platform-administration/tenant-billing state. These are net-new operational domains that GHL has no equivalent for (GHL's calendar remains the *lead-booking* calendar; ServiceOps's new dispatch/schedule layer is the *field-execution* schedule — see the distinction made explicit in Phase 4 of the master plan).

3. **Explicitly out of scope for this entire expansion** (confirmed exclusions, matching the phase-prompt's non-negotiable rule #6): AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, native mobile apps, enterprise warehouse/inventory management. Where Markate offers a capability that falls into one of these categories (e.g. Markate's AI receptionist, SMS/email drip campaigns, NiceJob/Zapier-style integration marketplace), this expansion does not build an equivalent — it is marked "Out of scope" in the gap-analysis matrix, not "deferred."

4. **The `.claude/rules/` files remain authoritative** and are not superseded by the phase-prompt document. Where the phase prompt and the existing rules agree (tenant isolation, Zod validation, soft delete, TypeScript strict mode, additive migrations), both are followed identically. No rule file is edited as part of this decision.

## Consequences

- Every subsequent phase's implementation must pass the "Does GHL already do this?" scope check from `product-boundaries.md` before adding a feature, even when the Markate report describes GHL-equivalent functionality (e.g. Markate's own lead pipeline, marketing blasts, or booking calendar) as part of its platform. Markate's report is a **capability reference**, not a target to clone feature-for-feature.
- The customer portal (Phase 7) and public estimate/change-order links (Phases 3, 5) introduce ServiceOps's first customer-facing, unauthenticated surfaces. These are new attack surface that GHL-boundary rules did not previously have to account for, and Phase 1's security foundation work is scoped accordingly (public-token protections, rate limiting, hashed tokens).
- Dispatch/scheduling (Phase 4) must not become a second booking calendar competing with GHL's calendar for the same lead-to-appointment step; it is scoped strictly to field-execution scheduling of already-created work orders/visits.
- Any future phase that appears to require GHL-equivalent functionality not on the explicit ServiceOps-owns list must stop and get explicit owner confirmation before building, per Critical Warning #6 in `CLAUDE.md` ("Do NOT overbuild — ask before adding scope").
