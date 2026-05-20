# GHL Calendar → Work Order Appointment Date Mapping

## Overview
When GHL fires an `OpportunityStatusChange` webhook for the **Diagnosis Booked** stage, the
appointment date and time are extracted and stored on the created work order as
`scheduled_date` (YYYY-MM-DD) and `scheduled_time_start` (HH:MM).

---

## Three-Step Resolution Chain

The factory tries each step in order, stopping when a date is found:

### Step 1 — Webhook body (primary, zero latency)
The webhook normalizer in `route.ts` reads the appointment datetime from the GHL workflow
body and stores it as private fields `_appointmentDate`, `_appointmentTime`, `_appointmentId`
on the raw payload object before dispatch. The factory reads these directly.

**GHL workflow body fields to include (add all to the webhook action):**

| Field key in GHL workflow | Description |
|---------------------------|-------------|
| `appointmentStartDateTime` | Full ISO datetime — preferred |
| `appointmentStartTime` | Alternate key used by some GHL versions |
| `appointmentDate` | Date-only fallback |
| `appointmentId` | Calendar event ID — used for fallback API call |
| `calendarId` | Calendar ID (optional, for diagnostics) |

In GHL Workflow → Action → Custom Webhook → Body (Key and Value):
```
appointmentStartDateTime  →  {{appointment.startTime}}
appointmentStartTime      →  {{appointment.startTime}}
appointmentDate           →  {{appointment.startDate}}
appointmentId             →  {{appointment.id}}
```

### Step 2 — Legacy customFields channel (backward compat)
If `_appointmentDate` is absent but `GHL_CF_OPP_SCHEDULED_DATE` env var is set and the
opportunity has a matching custom field, that value is used. Requires the GHL opportunity
to have a date custom field mapped to `GHL_CF_OPP_SCHEDULED_DATE` in `.env`.

### Step 3 — GHL Calendar API fallback
If no date was found in Steps 1 and 2, and `_appointmentId` is present, the factory calls:
```
GET /calendars/events/{appointmentId}
```
This adds ~200–500 ms latency but guarantees the date is captured even when the GHL
workflow body template doesn't include appointment fields.

---

## Data Flow

```
GHL Workflow fires
       ↓
POST /api/ghl/webhooks
       ↓
route.ts normalizer
  getField(raw, "appointmentStartDateTime", "appointmentStartTime", ...)
  parseAppointmentDate() → "YYYY-MM-DD"
  parseAppointmentTime() → "HH:MM" (from ISO timestamp only)
  raw._appointmentDate = dateValue
  raw._appointmentTime = timeValue
  raw._appointmentId  = appointmentId
       ↓
work-order-factory.ts → createWorkOrderFromGHLStage()
  1. rawPayload._appointmentDate  (direct read, no env-var needed)
  2. extractOppCustomField(customFields, "GHL_CF_OPP_SCHEDULED_DATE") (legacy)
  3. fetchAppointmentFromCalendar(_appointmentId)  (API fallback)
       ↓
createWorkOrderFull({ scheduled_date, scheduled_time_start, scheduled_time_end })
```

---

## UI Warning
`WorkOrderDetail.tsx` shows an amber warning banner when `scheduled_date` is null on any
non-terminal work order, prompting the admin to set the date manually or fix the GHL
workflow template.

---

## Unreplaced Merge Tag Guard
`parseAppointmentDate()` checks for `{{` in the raw value. If GHL sends an unreplaced
merge tag (e.g. `{{appointment.startTime}}`), it is treated as missing rather than
stored as a bogus date string.

---

## Files Involved
- `src/app/api/ghl/webhooks/route.ts` — normalization + `_appointment*` field injection
- `src/lib/ghl/work-order-factory.ts` — three-step resolution + Calendar API fallback
- `src/components/dashboard/WorkOrderDetail.tsx` — amber warning for null scheduled_date
