# Product Decisions — Updated 2026-06-11

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Frontend | Next.js 15 + TypeScript strict + Tailwind | App Router, Vercel-native, no Pages Router ever | Scaffold |
| UI Components | shadcn/ui | Accessible, Tailwind-native, customizable | Scaffold |
| Backend | Next.js API routes in `src/app/api/` | Colocation with frontend, Vercel serverless | Scaffold |
| Database | Supabase PostgreSQL ✅ LIVE | Multi-tenant RLS, built-in storage, Vercel-compatible | 2026-05-06 |
| Auth | NextAuth v4 + CredentialsProvider + bcrypt + Supabase users table ✅ | Avoids Supabase Auth complexity, full session control, bcrypt for password hashing | 2026-05-06 |
| File Storage | Supabase Storage ✅ | Already in stack, no additional service | 2026-05-14 |
| GHL Auth | Private Integration Token ✅ | MVP simplicity over OAuth marketplace complexity | 2026-05-xx |
| Email | Resend ✅ | Simple API, React email templates, reliable delivery | 2026-05-13 |
| PDF | pdfkit (server-side) ✅ | Node.js native, no headless browser needed | 2026-05-13 |
| Charts | recharts ✅ | React-native, Tailwind-compatible | 2026-05-xx |
| Payments | Stripe (packages installed, not yet wired) | Industry standard, supports SaaS subscriptions | 2026-06-xx |
| PWA | next-pwa ✅ | Tech mobile view benefits from installability | 2026-05-xx |
| Deployment | Vercel ✅ LIVE | Next.js native, instant deploys | 2026-05-05 |
| Recurring visits | Internal cron (not GHL calendar sync) ✅ | Simpler, avoids GHL calendar API complexity for MVP | 2026-05-14 |
| Estimate handoff | Creates GHL task via API ✅ | Less disruptive than pipeline stage change, preserves GHL workflow | 2026-05-xx |
| Technician app | Mobile-responsive web ✅ | No native app for MVP — faster to ship | Scaffold |
| Multi-tenancy | Application-layer tenant isolation (`getTenantId`) + RLS defense-in-depth | Supabase RLS as backup, not primary gate | 2026-05-06 |
