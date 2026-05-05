# GHL Webhook Test Cases — `/api/ghl/webhooks`

> Run these manually with `scripts/test-ghl-webhook.sh` or replay with curl.
> All cases assume the dev server is running at `http://localhost:3000`.

---

## Required env vars for full coverage

```
GHL_WEBHOOK_SECRET=test-secret-dev
GHL_LOCATION_TO_TENANT={"ve9EPM428h8vShlRW1KT":"tenant-showtime"}
GHL_USER_TO_TECHNICIAN={"ghl_user_Jk5LmNpQrStUvW":"tech-001"}
GHL_CF_OPP_SCHEDULED_DATE=sT9UvWxYzAbCdEfG
GHL_CF_OPP_TIME_START=hI1JkLmNoPqRsTuV
GHL_CF_OPP_TIME_END=wX3YzAbCdEfGhIjK
GHL_CF_OPP_PRIORITY=lM5NoPqRsTuVwXyZ
```

> If `GHL_WEBHOOK_SECRET` is absent, the server accepts all payloads with a warning
> (dev mode bypass). Set it to test TC-GHL-002.

---

## TC-GHL-001 — Valid OpportunityStatusChange: work order created

**Purpose**: Happy path. A job-ready opportunity arrives for a contact that exists as a
Property in ServiceOps. A WorkOrder must be created exactly once.

**Preconditions**:
- Property `prop-001` (Rodriguez) is seeded with `ghl_contact_id = "ghl-cnt-rodriguez-001"`
- `GHL_LOCATION_TO_TENANT` maps `ve9EPM428h8vShlRW1KT` → `tenant-showtime`
- No existing WorkOrder has `ghl_opportunity_id = "opp-test-tc001"`

**Request**:
```
POST /api/ghl/webhooks
Content-Type: application/json
x-ghl-signature: <HMAC-SHA256 of body using GHL_WEBHOOK_SECRET>
```

```json
{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "opp-test-tc001",
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
    "id": "ghl-cnt-rodriguez-001",
    "name": "Jane Rodriguez",
    "email": "jane@example.com",
    "phone": "+13105551234"
  },
  "notes": "Customer requested morning slot. Gate code on file.",
  "customFields": [
    { "id": "sT9UvWxYzAbCdEfG", "fieldValue": "2025-04-15" },
    { "id": "hI1JkLmNoPqRsTuV", "fieldValue": "08:00" },
    { "id": "wX3YzAbCdEfGhIjK", "fieldValue": "09:00" },
    { "id": "lM5NoPqRsTuVwXyZ", "fieldValue": "normal" }
  ],
  "dateAdded": "2024-03-15T08:00:00.000Z",
  "dateUpdated": "2026-05-05T14:30:00.000Z"
}
```

**Expected response**: `200 OK`
```json
{ "received": true }
```

**Expected server logs**:
```
[ghl/webhooks] Received event | type=OpportunityStatusChange locationId=ve9EPM428h8vShlRW1KT id=opp-test-tc001
[ghl/opportunity id=opp-test-tc001] Created WorkOrder "wo-..." (...) status="assigned" category="other" tenant="tenant-showtime"
[ghl/webhooks] OpportunityStatusChange → created WorkOrder WO-...
```
> `category="other"` unless `GHL_CF_OPP_SERVICE_CAT` is also configured. Stage name "Scheduled"
> has no category keyword match — set the custom field env var to get `weekly_pool_maintenance`.

**Expected WorkOrder fields**:
| Field | Value |
|-------|-------|
| `ghl_opportunity_id` | `"opp-test-tc001"` |
| `ghl_contact_id` | `"ghl-cnt-rodriguez-001"` |
| `property_id` | `"prop-001"` |
| `status` | `"assigned"` |
| `scheduled_date` | `"2025-04-15"` |
| `scheduled_time_start` | `"08:00"` |
| `scheduled_time_end` | `"09:00"` |
| `priority` | `"normal"` |
| `assigned_technician_id` | `"tech-001"` (if `GHL_USER_TO_TECHNICIAN` is set) |

**Pass criteria**: HTTP 200. Exactly one WorkOrder with `ghl_opportunity_id = "opp-test-tc001"` in store.

---

## TC-GHL-002 — Invalid signature: 401 rejected

**Purpose**: A tampered or forged payload must be rejected before any processing or logging
occurs. Signature verification is the first gate after body read.

**Preconditions**:
- `GHL_WEBHOOK_SECRET` is set (e.g. `test-secret-dev`)

**Request**:
```
POST /api/ghl/webhooks
Content-Type: application/json
x-ghl-signature: 0000000000000000000000000000000000000000000000000000000000000000
```

```json
{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "opp-test-tc002",
  "pipelineStage": { "id": "stage_x", "name": "Scheduled" },
  "status": "open",
  "contact": { "id": "ghl-cnt-rodriguez-001" }
}
```

**Expected response**: `401 Unauthorized`
```json
{ "error": "Invalid signature" }
```

**Expected server logs**:
```
[ghl/webhooks] Rejected: invalid signature
```
> No raw payload log — the route returns early before reaching the log line.

**Expected side effects**: None. No WorkOrder created for `opp-test-tc002`.

**Pass criteria**: HTTP 401. No WorkOrder with `ghl_opportunity_id = "opp-test-tc002"` in store.

---

## TC-GHL-003 — Duplicate payload: idempotent, no second work order

**Purpose**: GHL retries webhook delivery on timeout or non-200 responses. Sending the
same opportunity payload twice must not create duplicate WorkOrders.

**Preconditions**:
- TC-GHL-001 has already been run successfully (WorkOrder for `opp-test-tc001` exists)

**Request**: Identical to TC-GHL-001 (same body, recomputed valid signature).

**Expected response**: `200 OK`
```json
{ "received": true }
```

**Expected server logs**:
```
[ghl/webhooks] Received event | type=OpportunityStatusChange locationId=ve9EPM428h8vShlRW1KT id=opp-test-tc001
[ghl/opportunity id=opp-test-tc001] WorkOrder "wo-..." already exists for this opportunity. Skipping create.
[ghl/webhooks] OpportunityStatusChange → idempotent, existing WorkOrder WO-...
```

**Expected side effects**: Store unchanged. Count of WorkOrders with `ghl_opportunity_id = "opp-test-tc001"` is still exactly 1.

**Pass criteria**: HTTP 200. WorkOrder count for `opp-test-tc001` is 1 before and after.

---

## TC-GHL-004 — Missing contact ID: skipped gracefully

**Purpose**: A malformed or incomplete opportunity arrives without a `contact.id`. The
property lookup cannot proceed. The event must be discarded cleanly — no crash, no WorkOrder,
still returns 200 so GHL does not retry.

**Request**:
```
POST /api/ghl/webhooks
Content-Type: application/json
x-ghl-signature: <valid HMAC, or unset GHL_WEBHOOK_SECRET>
```

```json
{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "opp-test-tc004",
  "name": "Orphaned Opportunity — no contact",
  "pipelineStage": { "id": "stage_x", "name": "Scheduled" },
  "status": "open",
  "contact": {}
}
```

**Expected response**: `200 OK`
```json
{ "received": true }
```

**Expected server logs**:
```
[ghl/webhooks] Received event | type=OpportunityStatusChange locationId=ve9EPM428h8vShlRW1KT id=opp-test-tc004
[ghl/opportunity id=opp-test-tc004] Missing contact.id — cannot resolve property. Discarding.
[ghl/webhooks] OpportunityStatusChange → skipped: Missing contact.id
```

**Expected side effects**: No WorkOrder created for `opp-test-tc004`.

**Pass criteria**: HTTP 200. No WorkOrder with `ghl_opportunity_id = "opp-test-tc004"` in store.

---

## TC-GHL-005 — Unknown event type: logged and discarded without crashing

**Purpose**: GHL adds new webhook event types as the platform evolves. An unrecognised type
must be accepted (so GHL stops trying), logged once, and silently discarded. The TypeScript
exhaustiveness guard in `dispatch()` must reach the default warning branch.

**Request**:
```
POST /api/ghl/webhooks
Content-Type: application/json
x-ghl-signature: <valid HMAC, or unset GHL_WEBHOOK_SECRET>
```

```json
{
  "type": "InvoiceSent",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "inv-test-tc005"
}
```

**Expected response**: `200 OK`
```json
{ "received": true }
```

**Expected server logs**:
```
[ghl/webhooks] Received event | type=InvoiceSent locationId=ve9EPM428h8vShlRW1KT id=inv-test-tc005
[ghl/webhooks] Unknown event type: InvoiceSent
```

**Expected side effects**: None. Server continues accepting requests normally after this call.

**Pass criteria**: HTTP 200. No exception thrown. Next webhook request handled correctly.

---

## Summary

| ID         | Scenario                         | Expected HTTP | WorkOrder created? |
|------------|----------------------------------|---------------|--------------------|
| TC-GHL-001 | Valid payload, job-ready stage   | 200           | Yes                |
| TC-GHL-002 | Invalid signature                | 401           | No                 |
| TC-GHL-003 | Duplicate (replay of TC-GHL-001) | 200           | No — idempotent    |
| TC-GHL-004 | Missing contact.id               | 200           | No — skipped       |
| TC-GHL-005 | Unknown event type               | 200           | No                 |
