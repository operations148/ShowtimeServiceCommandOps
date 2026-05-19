# Inbound Webhooks from GHL

## Integration Mode: GHL Workflow Webhook

GHL sends data to ServiceOps via **Automations → Workflows → Custom Webhook action**.
This is the correct method for accounts using a Private Integration Access Token.

Use **Custom Webhook** (preferred) — it supports custom headers and a configurable JSON body.
If Custom Webhook is not available in your GHL account, use **Webhook** or **Outbound Webhook**
and pass the secret as a `?token=` query param instead of a header.

> **Not used:** Settings → Integrations → Webhooks (Marketplace App Webhooks).
> That mode requires a published GHL Marketplace App and is reserved for future multi-tenant SaaS use.

---

## ⚠️ Critical: Two Different Secrets — Do Not Confuse Them

| Variable | What it is | Direction | Where it lives |
|----------|-----------|-----------|----------------|
| `GHL_WEBHOOK_SECRET` | Random secret **we created** | GHL → ServiceOps (inbound) | Vercel env + GHL workflow header |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | Real GHL Private Integration token | ServiceOps → GHL (outbound API) | Vercel env **only** |

**`GHL_PRIVATE_INTEGRATION_TOKEN` must NEVER be placed in a GHL workflow header, URL, or any public config.**
It is only used server-side when ServiceOps calls the GHL API outbound.

`GHL_WEBHOOK_SECRET` is the only secret that goes into the GHL workflow action header.

---

## Endpoint

```
POST https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks
```

---

## Authentication

The webhook handler supports two auth modes (pick one):

### Option A — Bearer Token (recommended, used by GHL Custom Webhook)
In the GHL Custom Webhook action, set Authorization to **Bearer Token** and select your
saved key. GHL will send the header:
```
Authorization: Bearer <key_value>
```

**Critical: the saved key's value in GHL must exactly match `GHL_WEBHOOK_SECRET` in Vercel.**
- Create the key in GHL with the value you want to use as the secret
- Set `GHL_WEBHOOK_SECRET` in Vercel to that same value
- Redeploy the app after changing Vercel env vars — changes don't take effect until redeployment

### Option B — Query Parameter (fallback if Custom Webhook unavailable)
Append the secret to the webhook URL:
```
https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks?token=<GHL_WEBHOOK_SECRET>
```

### Health check
To confirm the secret is loaded in the deployed app:
```
GET https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks/health
→ { "ok": true, "webhookSecretConfigured": true, "secretLength": N }
```

---

## Payload Format

The GHL Workflow outbound webhook body must be configured as JSON.
Use the following template in the GHL workflow action body — GHL merge fields are in `{{ }}`:

```json
{
  "type": "OpportunityStatusChange",
  "locationId": "{{location.id}}",
  "id": "{{opportunity.id}}",
  "name": "{{contact.full_name}}",
  "status": "open",
  "pipelineId": "{{opportunity.pipeline_id}}",
  "pipelineStage": {
    "id": "{{opportunity.pipeline_stage_id}}",
    "name": "{{opportunity.pipeline_stage_name}}"
  },
  "contact": {
    "id": "{{contact.id}}",
    "name": "{{contact.full_name}}",
    "email": "{{contact.email}}",
    "phone": "{{contact.phone}}"
  },
  "monetaryValue": "{{opportunity.monetary_value}}",
  "source": "{{opportunity.lead_source}}"
}
```

> **Note:** GHL merge field names vary by account version. Verify the exact field names
> inside the workflow builder under the "Custom Values / Merge Fields" picker.

---

## Supported Event Types

| `type` value | Trigger | Action in ServiceOps |
|---|---|---|
| `OpportunityStatusChange` | Pipeline stage changed | Creates or updates work order |
| `ContactCreate` | New contact added | Creates property record |
| `ContactUpdate` | Contact info changed | Updates property record |
| `AppointmentBooked` | Appointment booked in calendar | Creates work order from appointment |

---

## Work Order Creation Logic

Stages that **create** a new work order (defined in `src/lib/constants/ghl-pipeline.ts`):
- `Diagnosis Booked` → creates `pool_inspection_diagnostic` WO
- `Estimate Approved` → creates `pool_repair` WO

Stages that **update** an existing WO status:
- `Diagnosis Completed` → `completed`
- `In Progress` → `in_progress`
- `Completed/Won` → `completed`

Stages that **flag an estimate handoff**:
- `Estimate Sent` → sets `estimate_handoff_status = estimate_sent`

---

## Error Handling

- Always returns `200 OK` after signature verification, even if processing fails — prevents GHL retry storms
- Processing is fire-and-forget (`void dispatch(...).catch(...)`)
- All errors logged to Vercel function logs
- Check Vercel → Project → Logs → filter `/api/ghl/webhooks` to debug

---

## Future: GHL Marketplace Webhook Mode

When this app is published as a GHL Marketplace App, the inbound webhook will switch to
HMAC-SHA256 signature verification via `x-ghl-signature` header. The handler already supports
this mode — it activates automatically when the `x-ghl-signature` header is present.
