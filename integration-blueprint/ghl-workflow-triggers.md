# GHL Workflow Triggers — Setup Guide

This guide covers how to configure GHL Automations → Workflows to send work order
creation events to ServiceOps. This is the correct integration path for accounts
using a Private Integration Access Token (not a Marketplace App).

---

## ⚠️ Critical: Two Different Secrets — Do Not Confuse Them

| Variable | What it is | Direction | Where it lives |
|----------|-----------|-----------|----------------|
| `GHL_WEBHOOK_SECRET` | Random secret **we created** | GHL → ServiceOps (inbound) | Vercel env + GHL workflow header |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | Real GHL Private Integration token | ServiceOps → GHL (outbound API) | Vercel env **only** |

**`GHL_PRIVATE_INTEGRATION_TOKEN` must NEVER be placed in a GHL workflow header, URL, or any public-facing config.**
It is only used server-side when ServiceOps calls the GHL API.

`GHL_WEBHOOK_SECRET` is the only secret that goes into the GHL workflow action header.

---

## Prerequisites

- `GHL_WEBHOOK_SECRET` set in Vercel (already done)
- App deployed at `https://serviceops-ghl-workorders.vercel.app` (already done)

---

## Workflow 1: Create Work Order on Diagnosis Booked

### Trigger
**Pipeline Stage Changed** (or "Opportunity Status Changed")

### Filter
- Pipeline: [your service pipeline name]
- Stage: `Diagnosis Booked`

### Action — Custom Webhook (preferred)
Use **Custom Webhook** when available in the workflow action list — it supports custom
headers and a fully configurable JSON body.

- Method: `POST`
- URL: `https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks`
- Headers:
  ```
  Authorization: Bearer <GHL_WEBHOOK_SECRET value>
  Content-Type: application/json
  ```
- Body (JSON):
  ```json
  {
    "type": "OpportunityStatusChange",
    "locationId": "{{location.id}}",
    "id": "{{opportunity.id}}",
    "name": "{{contact.full_name}}",
    "status": "open",
    "pipelineStage": {
      "id": "{{opportunity.pipeline_stage_id}}",
      "name": "Diagnosis Booked"
    },
    "contact": {
      "id": "{{contact.id}}",
      "name": "{{contact.full_name}}",
      "email": "{{contact.email}}",
      "phone": "{{contact.phone}}"
    },
    "monetaryValue": "{{opportunity.monetary_value}}",
    "appointmentStartTime": "{{appointment.start_date_time}}"
  }
  ```

> `appointmentStartTime` auto-populates the **Scheduled Date** on the work order.
> Use the GHL merge field picker to confirm the exact field name in your account.
> If the appointment hasn't been booked yet or the field is unavailable, the scheduled date
> defaults to "Not scheduled" and can be set manually on the work order detail page.

> **Fallback:** If "Custom Webhook" is not available in your GHL account, use
> **Webhook** or **Outbound Webhook** instead, and append the token as a query param:
> `https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks?token=<GHL_WEBHOOK_SECRET>`

---

## Workflow 2: Create Work Order on Estimate Approved

Same as Workflow 1 except:
- Stage filter: `Estimate Approved`
- Body: change `"name": "Diagnosis Booked"` → `"name": "Estimate Approved"`

---

## Workflow 3: Mark Work Order In Progress

Same structure, stage: `In Progress`, body stage name: `"name": "In Progress"`

---

## Workflow 4: Complete Work Order

Same structure, stage: `Diagnosis Completed` or `Completed/Won`, body stage name matches exactly.

---

## Testing a Workflow

1. Save and publish the workflow in GHL
2. Find a test contact → open their opportunity → move it to `Diagnosis Booked`
3. Wait 10–15 seconds
4. Open ServiceOps → Work Orders — a new WO should appear
5. To inspect the raw request: Vercel → Project → Logs → filter `/api/ghl/webhooks`

---

## Idempotency

Moving the same opportunity to the same stage twice will NOT create a duplicate WO.
The handler checks `(ghl_opportunity_id, ghl_trigger_stage)` uniqueness before inserting.

---

## Integration Modes Reference

| Mode | How | When |
|------|-----|------|
| **GHL Workflow Webhook** ← current | Automations → Workflows → Custom Webhook action | Private Integration Token accounts |
| GHL Marketplace Webhook | Settings → Integrations → Webhooks | Future: published Marketplace App only |
| Mock Mode | `APP_ENV=development` or no token | Local dev / demo |

---

## Env Vars Involved

| Var | Direction | Purpose |
|-----|-----------|---------|
| `GHL_WEBHOOK_SECRET` | GHL → ServiceOps | Bearer token for inbound workflow POSTs — place in GHL workflow header |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | ServiceOps → GHL | Outbound GHL API calls — never place in GHL config |
| `GHL_LOCATION_ID` | — | Showtime Pool Service location ID |
| `GHL_LOCATION_TO_TENANT` | — | Maps GHL locationId → Supabase tenantId |
| `GHL_JOB_READY_STAGES` | — | Stage names that trigger WO creation (comma-separated) |
