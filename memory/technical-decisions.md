# Technical Decisions — All Confirmed (2026-06-11)

## Confirmed (All Locked)
- **Framework**: Next.js 15 App Router (not Pages Router) — permanent decision
- **Language**: TypeScript strict mode — no `any`
- **Styling**: Tailwind CSS only — no inline styles
- **UI Components**: shadcn/ui-compatible (Radix primitives)
- **Database**: Supabase PostgreSQL ✅ — 18 migrations applied, live in production
- **Auth**: NextAuth.js v4 + CredentialsProvider + bcrypt + Supabase `users` table ✅
- **File Storage**: Supabase Storage ✅ — photos (`STORAGE_BUCKET`), avatars (`AVATAR_BUCKET=avatars`)
- **Deployment**: Vercel ✅ — live at https://serviceops-ghl-workorders.vercel.app
- **GHL Auth**: Private Integration Token ✅ (`GHL_PRIVATE_INTEGRATION_TOKEN`, prefix `pit-0bf9...`)
- **Email**: Resend ✅ (`RESEND_API_KEY` set)
- **PDF**: pdfkit (server-side, Node.js native) ✅
- **Charts**: recharts ✅
- **Payments**: Stripe ✅ (packages installed — API routes not yet wired)
- **PWA**: next-pwa ✅ (installed, banner active)
- **Recurring visits**: Internal cron scheduler ✅ (not GHL calendar sync)
- **Estimate handoff**: Creates GHL task via API ✅ (not a pipeline stage change)
- **UUID for all IDs**: ✅
- **tenant_id on all database records**: ✅

## No Longer Pending
All decisions from the "Pending Confirmation" list are resolved. See MEMORY.md for authoritative current state.
