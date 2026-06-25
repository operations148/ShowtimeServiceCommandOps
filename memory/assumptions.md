# Working Assumptions — Updated 2026-06-11

## Confirmed (No Longer Assumptions)
- ~~Supabase will be used for database and auth~~ → **CONFIRMED** ✅
- ~~GHL Private Integration Token (not OAuth) for MVP~~ → **CONFIRMED** ✅
- ~~Photo storage via Supabase Storage~~ → **CONFIRMED** ✅
- ~~Technician view will be mobile web (not native app) for MVP~~ → **CONFIRMED** ✅
- ~~Recurring visits will be internal schedule (not GHL calendar sync) for MVP~~ → **CONFIRMED** ✅
- ~~English-only for MVP~~ → Still assumed, not challenged
- ~~Single timezone per tenant for MVP~~ → Still assumed; `timezone` field on `tenant_company_profile` table for future use

## Still Unconfirmed
- GHL custom field IDs (gate_code, access_notes, service_notes, scheduled_date, service_category, priority) — assumed to exist in client's GHL account
- Stripe billing model for when billing is activated — assumed flat monthly or per-seat
- Technician count — assumed small (< 10) based on pool service company size
- Customer notification preference — assumed client wants to control this via GHL automations, not ServiceOps triggers
- `waitUntil()` runtime — assumed Node.js Vercel functions (not Edge runtime)
