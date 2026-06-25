# Client: Showtime Pool Service — Updated 2026-06-11

## Basic Info
- **Name**: Showtime Pool Service
- **Location**: California
- **Industry**: Pool service

## Current Stack
- GoHighLevel for CRM, marketing, and customer communication
- Private Integration Token confirmed (`pit-0bf9...`)
- Location ID: `E4iish4R...`

## Services
- Weekly pool maintenance
- Pool repairs
- Filter cleaning
- Heater service
- Equipment installation
- Pool remodels
- Emergency service

## Team
- Owner/operator
- Field technicians (exact count TBD — seats to be seeded in Supabase `users` table)

## GHL Pipeline (Confirmed 2026-05-15)
10 stages in exact order:
1. New Lead (no action)
2. Diagnosis Booked → creates WorkOrder
3. Diagnosis Completed → WO completed
4. Estimate Sent → flags estimate
5. Review Estimate (no action)
6. Estimate Approved → creates WorkOrder
7. Invoice Sent (no action)
8. Invoice Paid (no action)
9. In Progress → WO in_progress
10. Completed/Won → WO completed + GHL sync

## Key Needs
- Work orders for field jobs
- Technician job view on phone (mobile web)
- Property profiles with pool equipment records
- Job completion documentation (checklists, notes, photos)
- Status updates back to GHL when job completes
- Estimate flagging → GHL task creation
- Owner reporting dashboard (live GHL data)

## Confirmed Decisions for This Client
- Photo storage: Supabase Storage ✅
- Recurring visits: Internal cron (not GHL calendar sync) ✅
- Estimate handoff: GHL task creation ✅
- Technician app: Mobile web ✅
- Webhook auth: Bearer token (`GHL_WEBHOOK_SECRET`) ✅

## Still Open
- GHL plan tier (affects rate limits)
- GHL custom field IDs for gate_code, access_notes, service_notes, scheduled_date, service_category, priority
- GHL calendar IDs for AppointmentBooked service category mapping
- Exact technician count for user seeding
- Existing property/address list for import
- Customer notification preferences (email/SMS on job complete)
