# ServiceOps Command Center

A GHL-integrated work order and field operations platform — built for Showtime Pool Service,
designed to scale as a white-label add-on for local service businesses on GoHighLevel.

**Live:** `https://serviceops-ghl-workorders.vercel.app`

---

## What This Is

ServiceOps handles the **operations layer** after a lead is booked or won inside GHL.

| GHL handles | ServiceOps handles |
|-------------|-------------------|
| CRM, contacts, pipelines | Work orders, job lifecycle |
| Conversations, SMS/email | Property profiles, equipment |
| Calendar, appointments | Technician mobile job view |
| Marketing automation | Checklists, photos, notes |
| Lead pipeline stages | Completion reports |

---

## GHL Integration

This app integrates with GHL via **Private Integration Access Token**.

### Outbound (ServiceOps → GHL)
API calls use:
```
Authorization: Bearer <GHL_PRIVATE_INTEGRATION_TOKEN>
Version: 2021-07-28
```

### Inbound (GHL → ServiceOps)
GHL sends stage-change events via **Automations → Workflows → Custom Webhook action**.
- Webhook URL: `https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks`
- Auth header in workflow action: `Authorization: Bearer <GHL_WEBHOOK_SECRET>`
- Fallback if Custom Webhook unavailable: use Webhook/Outbound Webhook + `?token=<GHL_WEBHOOK_SECRET>` in URL

> **Not used:** Settings → Integrations → Webhooks (requires a published Marketplace App).

### ⚠️ Two different secrets — do not confuse them

| Variable | Direction | Never put it in |
|----------|-----------|----------------|
| `GHL_WEBHOOK_SECRET` — random secret we created | GHL → ServiceOps | — |
| `GHL_PRIVATE_INTEGRATION_TOKEN` — real GHL token | ServiceOps → GHL API | GHL workflow headers or public config |

See `integration-blueprint/ghl-workflow-triggers.md` for the full setup guide.

---

## Modes

| Mode | Config | Use |
|------|--------|-----|
| Mock / Demo | `APP_ENV=development` | Local dev, no GHL credentials needed |
| Live | `GHL_PRIVATE_INTEGRATION_TOKEN` set | Production — calls real GHL API |
| Workflow Webhook | `GHL_WEBHOOK_SECRET` + GHL workflow configured | GHL triggers work order creation |

---

## Local Dev

```bash
npm install
cp .env.example .env.local
# Fill in credentials from Vercel
npm run dev
```

Keep `APP_ENV=development` in `.env.local` — forces mock reporting data locally.

---

## Key Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run typecheck  # TypeScript check
npm run lint       # Lint
```

---

## Project Structure

```
src/
├── app/            # Next.js App Router pages + API routes
├── components/     # React components
├── lib/
│   ├── ghl/        # GHL client, webhook handlers, work order factory
│   ├── db/         # Supabase query layer
│   ├── reports/    # PDF generation (pdfkit)
│   └── email/      # Resend email client
├── types/          # TypeScript types (ghl.ts, reporting.ts, ...)
└── config/         # Constants, navigation, mock data

integration-blueprint/   # GHL integration docs
docs/                    # Architecture + product docs
database-blueprint/      # Schema design
```

---

## Docs

- `SETUP_NOTES.md` — setup, env vars, GHL workflow configuration
- `integration-blueprint/ghl-workflow-triggers.md` — GHL workflow setup guide
- `integration-blueprint/inbound-webhooks-from-ghl.md` — webhook endpoint + auth
- `CLAUDE.md` — Claude Code project instructions
- `memory/MEMORY.md` — project state, decisions, phase status
