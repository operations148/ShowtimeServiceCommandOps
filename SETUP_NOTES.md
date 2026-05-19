# Setup Notes — ServiceOps Command Center

## Current Status

The app is **live in production** at `https://serviceops-ghl-workorders.vercel.app`.
This is not a scaffold — all modules are built and deployed.

---

## GHL Integration Model

This app uses a **Private Integration Access Token**, not a GHL Marketplace App.

### Two separate integration directions

| Direction | Mechanism | Env Var |
|-----------|-----------|---------|
| ServiceOps → GHL (outbound API calls) | `Authorization: Bearer <token>` + `Version: 2021-07-28` | `GHL_PRIVATE_INTEGRATION_TOKEN` |
| GHL → ServiceOps (inbound webhooks) | GHL Automations → Workflows → **Custom Webhook** action | `GHL_WEBHOOK_SECRET` (bearer token auth) |

**Do not use** Settings → Integrations → Webhooks — that is for GHL Marketplace Apps only.

### ⚠️ These two secrets are completely different things

| Variable | What it is | Goes into |
|----------|-----------|-----------|
| `GHL_WEBHOOK_SECRET` | Random secret we created | GHL workflow Custom Webhook header (`Authorization: Bearer ...`) |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | Real GHL Private Integration token | Vercel env only — never in GHL config |

`GHL_PRIVATE_INTEGRATION_TOKEN` must never be placed in a GHL workflow header or any public-facing config.

---

## Integration Modes

| Mode | When to use | Key env var |
|------|------------|-------------|
| `APP_ENV=development` | Local dev — forces mock data regardless of token | `APP_ENV` |
| `NEXT_PUBLIC_REPORTING_MODE=mock` | Shows "DEMO DATA" badge in reporting | `NEXT_PUBLIC_REPORTING_MODE` |
| `NEXT_PUBLIC_REPORTING_MODE=live` | Live GHL data in reports (current production) | — |
| GHL Workflow Webhook active | GHL sends stage-change events → WOs created | `GHL_WEBHOOK_SECRET` |

---

## GHL Workflow Webhook Setup (one-time)

See `integration-blueprint/ghl-workflow-triggers.md` for full step-by-step.

**Short version:**
1. GHL → Automations → Workflows → New Workflow
2. Trigger: Pipeline Stage Changed → filter to `Diagnosis Booked`
3. Action: **Custom Webhook** → POST to `https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks`
4. Header: `Authorization: Bearer <GHL_WEBHOOK_SECRET>` ← use `GHL_WEBHOOK_SECRET`, not the integration token
5. Body: JSON payload with opportunity/contact merge fields (see trigger doc)
6. Repeat for `Estimate Approved`, `In Progress`, `Diagnosis Completed`
7. If Custom Webhook is unavailable, use Webhook/Outbound Webhook with `?token=<GHL_WEBHOOK_SECRET>` in the URL

---

## Vercel Production Env Vars (all set)

| Var | Status |
|-----|--------|
| `GHL_PRIVATE_INTEGRATION_TOKEN` | ✅ Set |
| `GHL_LOCATION_ID` | ✅ Set |
| `GHL_WEBHOOK_SECRET` | ✅ Set |
| `GHL_LOCATION_TO_TENANT` | ✅ Set |
| `GHL_USER_TO_TECHNICIAN` | ✅ Set |
| `GHL_DEFAULT_OFFICE_USER_ID` | ✅ Set |
| `GHL_JOB_READY_STAGES` | ✅ Set |
| `NEXT_PUBLIC_GHL_LOCATION_ID` | ✅ Set |
| `NEXT_PUBLIC_REPORTING_MODE` | ✅ `live` |
| `RESEND_API_KEY` | ✅ Set |
| `CRON_SECRET` | ✅ Set |
| `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` | ✅ Set |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | ✅ Set |
| `STORAGE_BUCKET` / `AVATAR_BUCKET` | ✅ Set |

---

## Local Dev Setup

```bash
cd serviceops-ghl-workorders
cp .env.example .env.local
# Fill in values from Vercel (except keep APP_ENV=development locally)
npm install
npm run dev
```

`APP_ENV=development` in `.env.local` forces mock reporting data so local dev
never pollutes live GHL data.

---

## Key Docs

- `integration-blueprint/ghl-workflow-triggers.md` — GHL workflow setup steps
- `integration-blueprint/inbound-webhooks-from-ghl.md` — webhook endpoint + auth details
- `integration-blueprint/ghl-integration-overview.md` — full integration map
- `CLAUDE.md` — Claude Code instructions
- `memory/MEMORY.md` — project state + decisions
