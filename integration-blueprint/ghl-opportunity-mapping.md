# GHL Opportunity → ServiceOps WorkOrder Mapping

## Source-of-Truth Rules (from ghl-source-of-truth-rules.md)

- GHL **owns** opportunity records and pipeline stages. ServiceOps mirrors status only when needed.
- ServiceOps stores `ghl_opportunity_id` as the permanent foreign key on `WorkOrder`.
- ServiceOps may **write back** to GHL in two cases:
  1. Job completed → update GHL opportunity status to `won`
  2. Estimate needed → create a GHL task or move opportunity to an "Estimate" stage
- ServiceOps never creates GHL opportunities. GHL is always the origin.

---

## Triggering Webhook Events

| GHL Event Type               | ServiceOps Action                                                            |
|------------------------------|------------------------------------------------------------------------------|
| `OpportunityCreate`          | Create `WorkOrder` if the opportunity stage maps to a job-ready stage        |
| `OpportunityStatusChange`    | Upsert `WorkOrder` — create or update status based on mapping table          |
| `OpportunityStageUpdate`     | Update `WorkOrder.service_category` and `status` if stage mapping applies    |
| `OpportunityAssignedToUpdate`| Update `WorkOrder.assigned_technician_id` via GHL user → tech lookup         |
| `OpportunityMonetaryValueUpdate` | Log only — not mapped to WorkOrder in Phase 1                            |
| `OpportunityDelete`          | Set `WorkOrder.status = cancelled` if it exists                              |
| `AppointmentBooked`          | Create `WorkOrder` from appointment data (see Appointment section below)     |

> **Note**: Not every opportunity should become a WorkOrder. Only opportunities in
> "job-ready" pipeline stages trigger WorkOrder creation. See Stage Gate below.

---

## GHL Webhook Payload — `OpportunityStatusChange` / `OpportunityStageUpdate`

Exact JSON shape for opportunity events (GHL API v2):

```json
{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "VDm7RPYC2GLUvdpKmBfC",
  "name": "Weekly Pool Service — Rodriguez",
  "monetaryValue": 125.00,
  "pipelineId": "pipe_k8Nm2PqRsT4v",
  "pipelineStageId": "stage_Xw3YzA1bCdEfGh",
  "pipelineStage": {
    "id": "stage_Xw3YzA1bCdEfGh",
    "name": "Scheduled"
  },
  "status": "open",
  "assignedTo": "ghl_user_Jk5LmNpQrStUvW",
  "contact": {
    "id": "ocQHyuzHvysMo5N5VsXc",
    "name": "Jane Rodriguez",
    "email": "jane@example.com",
    "phone": "+13105551234"
  },
  "source": "",
  "notes": "Customer requested morning slot. Gate code on file.",
  "customFields": [
    { "id": "Cf7DgHiJkLmNoPqR", "fieldValue": "weekly_pool_maintenance" },
    { "id": "sT9UvWxYzAbCdEfG", "fieldValue": "2025-04-15" },
    { "id": "hI1JkLmNoPqRsTuV", "fieldValue": "08:00" },
    { "id": "wX3YzAbCdEfGhIjK", "fieldValue": "09:00" },
    { "id": "lM5NoPqRsTuVwXyZ", "fieldValue": "normal" }
  ],
  "dateAdded": "2024-03-15T08:00:00.000Z",
  "dateUpdated": "2024-04-10T14:30:00.000Z"
}
```

**Key payload notes:**
- `id` — GHL's internal opportunity UUID. Store as `ghl_opportunity_id`.
- `contact.id` — GHL contact UUID. Used to look up the ServiceOps `Property` by `ghl_contact_id`.
- `pipelineStage.name` — human-readable stage name. Used for stage gate check and service category fallback.
- `status` — GHL's top-level status: `open`, `won`, `lost`, `abandoned`. Too coarse for ServiceOps — combine with `pipelineStage.name` for accurate mapping (see tables below).
- `assignedTo` — GHL user ID. Must be resolved to a ServiceOps `technician_id` via env-configured lookup.
- `notes` — maps to `WorkOrder.description`.
- `customFields` — array of `{id, fieldValue}`. Note: opportunity custom fields use `fieldValue`, not `value` (unlike contact `customField`).
- `monetaryValue` — not mapped to WorkOrder in Phase 1. Log for reference.

---

## GHL Webhook Payload — `AppointmentBooked`

```json
{
  "type": "AppointmentBooked",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "appointmentInfo": {
    "id": "appt_9RsTuVwXyZaBcDeF",
    "calendarId": "cal_gHiJkLmNoPqRsT",
    "title": "Weekly Pool Maintenance",
    "notes": "Routine weekly service.",
    "status": "confirmed",
    "startTime": "2024-04-15T08:00:00.000Z",
    "endTime": "2024-04-15T09:00:00.000Z",
    "address": "1234 Sunset Blvd, Los Angeles CA 90028",
    "assignedUserId": "ghl_user_Jk5LmNpQrStUvW"
  },
  "contact": {
    "id": "ocQHyuzHvysMo5N5VsXc",
    "name": "Jane Rodriguez",
    "email": "jane@example.com",
    "phone": "+13105551234"
  }
}
```

---

## Field Mapping: GHL Opportunity → ServiceOps `WorkOrder`

| GHL Payload Field                         | ServiceOps `WorkOrder` Field      | Transform / Notes                                                           |
|-------------------------------------------|-----------------------------------|-----------------------------------------------------------------------------|
| `id`                                      | `ghl_opportunity_id`              | Store verbatim.                                                             |
| `contact.id`                              | `ghl_contact_id`                  | Store verbatim.                                                             |
| `contact.id` → Property lookup            | `property_id`                     | Look up `Property.ghl_contact_id = contact.id`. Fail if not found.         |
| `locationId` → tenant lookup              | `tenant_id`                       | Same `GHL_LOCATION_TO_TENANT` map as contact mapping.                       |
| `name`                                    | `title`                           | Trim whitespace. Max 200 chars.                                             |
| `notes`                                   | `description`                     | Trim whitespace. Max 5000 chars. May be null.                               |
| `status` + `pipelineStage.name`           | `status`                          | See **Status Mapping Table** below.                                         |
| `pipelineStage.name`                      | `service_category`                | See **Service Category Mapping Table** below. Fall back to custom field.    |
| `customFields[GHL_CF_OPP_SERVICE_CAT]`    | `service_category`                | Override if custom field is present and valid. See Custom Fields below.     |
| `customFields[GHL_CF_OPP_SCHEDULED_DATE]` | `scheduled_date`                  | Format: `YYYY-MM-DD`. Validate before storing.                              |
| `customFields[GHL_CF_OPP_TIME_START]`     | `scheduled_time_start`            | Format: `HH:MM` (24-hour). Validate before storing.                        |
| `customFields[GHL_CF_OPP_TIME_END]`       | `scheduled_time_end`              | Format: `HH:MM` (24-hour). Validate before storing.                        |
| `customFields[GHL_CF_OPP_PRIORITY]`       | `priority`                        | Values: `low`, `normal`, `high`, `urgent`. Default `normal` if absent.      |
| `assignedTo`                              | `assigned_technician_id`          | Look up in `GHL_USER_TO_TECHNICIAN` map. Leave `undefined` if not found.   |
| *(not in GHL)*                            | `estimate_handoff_status`         | Always default to `not_needed` on creation.                                 |

**Fields deliberately NOT mapped:**
- `monetaryValue` — not stored in Phase 1.
- `pipelineId` — not stored; `ghl_opportunity_id` is sufficient.
- `source` — not stored.
- `contact.name`, `contact.email`, `contact.phone` — GHL owns this; not duplicated.

---

## Field Mapping: `AppointmentBooked` → ServiceOps `WorkOrder`

| GHL Payload Field                       | ServiceOps `WorkOrder` Field | Transform / Notes                                          |
|-----------------------------------------|------------------------------|------------------------------------------------------------|
| `contact.id` → Property lookup          | `property_id`                | Same lookup as opportunity mapping.                        |
| `contact.id`                            | `ghl_contact_id`             | Store verbatim.                                            |
| `appointmentInfo.id`                    | `ghl_opportunity_id`         | Use appointment ID as substitute; prefix `appt_` to avoid collision. |
| `appointmentInfo.title`                 | `title`                      | Trim. Fall back to calendar name if blank.                 |
| `appointmentInfo.notes`                 | `description`                | Trim. May be null.                                         |
| `appointmentInfo.startTime`             | `scheduled_date`             | Extract date portion: `YYYY-MM-DD` (convert from UTC to local timezone). |
| `appointmentInfo.startTime`             | `scheduled_time_start`       | Extract time portion: `HH:MM` in location's local timezone.|
| `appointmentInfo.endTime`               | `scheduled_time_end`         | Extract time portion: `HH:MM`.                             |
| `appointmentInfo.assignedUserId`        | `assigned_technician_id`     | Same `GHL_USER_TO_TECHNICIAN` lookup as opportunity.       |
| `appointmentInfo.calendarId`            | `service_category`           | Look up in `GHL_CALENDAR_TO_SERVICE_CAT` map (see below). |
| *(derived from title/calendar)*         | `status`                     | Default `assigned` if technician is set; `new` otherwise.  |
| *(not in appointment)*                  | `priority`                   | Default `normal`.                                          |

---

## Status Mapping Table

GHL's `status` field is too coarse. Use `pipelineStage.name` as the primary signal and `status` as a modifier.

| GHL `status` | GHL `pipelineStage.name`  | ServiceOps `WorkOrderStatus` |
|--------------|---------------------------|------------------------------|
| `open`       | New Request               | `new`                        |
| `open`       | Scheduled                 | `assigned`                   |
| `open`       | In Progress               | `in_progress`                |
| `open`       | Estimate Pending          | `estimate_needed`            |
| `open`       | Follow-up Required        | `needs_follow_up`            |
| `won`        | *(any)*                   | `completed`                  |
| `lost`       | *(any)*                   | `cancelled`                  |
| `abandoned`  | *(any)*                   | `cancelled`                  |
| `open`       | *(unknown stage)*         | `new` (default — log warning)|

**Important**: GHL pipeline stage names are **client-configured** and may differ from the values above. The mapping must be confirmed with Showtime Pools before going live and stored in a configuration table, not hardcoded.

---

## Service Category Mapping Table

Service category is derived from the pipeline **stage name** or a custom field on the opportunity. Custom field takes precedence if present.

| GHL Pipeline Stage Name     | ServiceOps `ServiceCategory`      |
|-----------------------------|-----------------------------------|
| Weekly Maintenance          | `weekly_pool_maintenance`         |
| Weekly Pool Service         | `weekly_pool_maintenance`         |
| Pool Repair                 | `pool_repair`                     |
| Repair                      | `pool_repair`                     |
| Filter Cleaning             | `filter_cleaning`                 |
| Filter Service              | `filter_cleaning`                 |
| Heater Service              | `heater_service`                  |
| Heater Repair               | `heater_service`                  |
| Equipment Install           | `equipment_installation`          |
| Equipment Installation      | `equipment_installation`          |
| Inspection                  | `pool_inspection_diagnostic`      |
| Diagnostic                  | `pool_inspection_diagnostic`      |
| Emergency                   | `emergency_service`               |
| Emergency Service           | `emergency_service`               |
| Pool Remodel                | `pool_remodel`                    |
| Remodel                     | `pool_remodel`                    |
| New Construction            | `new_construction`                |
| *(no match)*                | `other`                           |

Stage name matching is **case-insensitive** and **substring-tolerant** (e.g., "Weekly Pool Maintenance Visit" matches "Weekly Maintenance").

---

## Custom Field Configuration

Opportunity custom field IDs are account-specific, like contact fields. Configure per environment:

```
# .env — GHL opportunity custom field IDs
GHL_CF_OPP_SERVICE_CAT=Cf7DgHiJkLmNoPqR
GHL_CF_OPP_SCHEDULED_DATE=sT9UvWxYzAbCdEfG
GHL_CF_OPP_TIME_START=hI1JkLmNoPqRsTuV
GHL_CF_OPP_TIME_END=wX3YzAbCdEfGhIjK
GHL_CF_OPP_PRIORITY=lM5NoPqRsTuVwXyZ
```

**Extraction note**: Opportunity custom fields use `fieldValue`, not `value`:
```ts
// Contact customField:      { id: "...", value: "..." }
// Opportunity customFields: { id: "...", fieldValue: "..." }
```

---

## GHL User → Technician Lookup

GHL's `assignedTo` is a GHL internal user ID. Map to ServiceOps `technician_id` via env config:

```
GHL_USER_TO_TECHNICIAN={"ghl_user_Jk5LmNpQrStUvW":"tech-001","ghl_user_Xy9ZaBcDeFgHiJ":"tech-002"}
```

If `assignedTo` is absent or not found in the map: set `assigned_technician_id = undefined` and `status = new`. Log the unmapped user ID so the admin can configure the mapping.

---

## GHL Calendar → Service Category Lookup (AppointmentBooked only)

Different GHL calendars correspond to different service types. Configure the mapping:

```
GHL_CALENDAR_TO_SERVICE_CAT={"cal_gHiJkLmNoPqRsT":"weekly_pool_maintenance","cal_aBcDeFgHiJkLmN":"pool_repair"}
```

If the `calendarId` is not in the map, fall back to deriving service category from `appointmentInfo.title` using the stage name matching logic above.

---

## Upsert Logic (Opportunity Events)

```
1. Resolve tenant_id from locationId → reject if unknown
2. Look up Property by ghl_contact_id (contact.id) AND tenant_id
   → If Property not found: log warning, return 200, do not create WorkOrder
     (Contact webhook may not have arrived yet — queue for retry after 30s)
3. Look up WorkOrder by ghl_opportunity_id AND tenant_id
4. If WorkOrder NOT found → check stage gate (see below) → create if passes
5. If WorkOrder found → update: status, assigned_technician_id, service_category,
   scheduled_date, scheduled_time_start, scheduled_time_end, priority
   Do NOT overwrite: description (preserve tech notes added in ServiceOps)
6. Set updated_at = now()
```

### Stage Gate: When to Create a WorkOrder

Not every GHL opportunity creates a WorkOrder. Only create when the pipeline stage indicates the job is ready to be scheduled or is already in progress. Reject silently (log only) for lead/quote stages.

```
CREATE WorkOrder if pipelineStage.name matches any of:
  - Scheduled, In Progress, Confirmed, Job Ready, Assigned
  OR if GHL status = "won" (job completed in GHL before webhook arrived)

DO NOT create for:
  - New Lead, Quote Sent, Awaiting Approval, Lost, Spam
```

This gate must also be configurable — store the "create" stage list in env or settings.

---

## Outbound Sync (ServiceOps → GHL)

These are **not webhook handlers** but **outbound API calls** triggered by ServiceOps events:

| ServiceOps Event                    | GHL API Call                                                     |
|-------------------------------------|------------------------------------------------------------------|
| `WorkOrder.status → completed`      | `PUT /opportunities/{id}` → set `status: won`                   |
| `visit.estimate_flagged = true`     | `POST /opportunities/{id}/tasks` → create task "Estimate Needed" |
| *(Phase 2)* Review request trigger  | `POST /workflows/{workflowId}/subscribe` with contact ID        |

Outbound calls must use the `ghl_opportunity_id` stored on the WorkOrder. If `ghl_opportunity_id` is null (WorkOrder was created manually in ServiceOps, not from GHL), skip the outbound sync silently.

---

## Error Handling

| Condition                                      | Action                                                                      |
|------------------------------------------------|-----------------------------------------------------------------------------|
| `contact.id` not found as a ServiceOps Property | Log + queue retry after 30s (contact webhook may be in flight)             |
| `locationId` not in tenant map                 | Log error, return 200, discard                                              |
| `pipelineStage.name` not in stage map          | Default `service_category = other`, log warning for admin to update map     |
| `assignedTo` not in user→tech map              | Set `assigned_technician_id = undefined`, log unmapped user ID              |
| WorkOrder already `completed` or `cancelled`   | Do not overwrite status from GHL update — log and skip status field only    |
| `scheduled_date` in invalid format             | Discard that field, leave existing value, log warning                       |
| Duplicate `ghl_opportunity_id`                 | Treat as update — never create a second WorkOrder for the same opportunity  |
| Property write fails                           | Log error with full payload, return 200 to GHL, queue for retry            |

---

## Phase 1 Limitations

- `monetaryValue` (estimate dollar amount) is logged but not stored in ServiceOps Phase 1.
- No real-time sync of technician schedule from GHL calendar — only webhook-triggered.
- Appointment rescheduling (`AppointmentUpdate`) updates only `scheduled_date` and `scheduled_time_*` on the WorkOrder. It does not re-open a completed WorkOrder.
- The stage gate logic and all stage/category name mappings **must be reviewed and confirmed with the client** (Showtime Pools) before implementation. The stage names in the tables above are illustrative.
- Timezone handling for appointment times: use the GHL location's configured timezone (available via `GET /locations/{locationId}`). Store this at tenant setup time.
