# Confirmed Facts — Updated 2026-06-11

## Client
- **Name**: Showtime Pool Service
- **Location**: California
- **Current stack**: GoHighLevel (CRM, marketing, customer comms)

## Integration
- **GHL auth**: Private Integration Token (`pit-0bf9...`) — confirmed, SET in Vercel
- **GHL Location ID**: `E4iish4R...` — SET in Vercel
- **GHL pipeline stages**: 10 stages confirmed 2026-05-15 (see MEMORY.md for full table)
- **Job-ready stages**: Diagnosis Booked, Estimate Approved, In Progress
- **Webhook endpoint**: `https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks`
- **Webhook auth**: `Authorization: Bearer <GHL_WEBHOOK_SECRET>` in GHL Custom Webhook header

## System Boundaries
- **GHL handles**: CRM, contacts, conversations, lead pipeline, calendars, SMS/email, marketing automations
- **ServiceOps handles**: work orders, field ops, visits, checklists, photos, notes, completion reports, recurring schedules, estimate handoffs

## Services Offered by Client
- Weekly pool maintenance
- Pool repairs
- Filter cleaning
- Heater service
- Equipment installation
- Pool remodels
- Emergency service

## Team
- Owner/operator + field technicians (exact count TBD)

## Technical Decisions Confirmed
- Photo storage: Supabase Storage ✅
- Recurring visits: Internal cron scheduler (not GHL calendar sync) ✅
- Estimate handoff: Creates GHL task (not pipeline stage change) ✅
- Technician app: Mobile web for MVP (not native) ✅

## Production URLs
- App: https://serviceops-ghl-workorders.vercel.app
- GitHub: https://github.com/Eriin2816/service-command-ops.git
