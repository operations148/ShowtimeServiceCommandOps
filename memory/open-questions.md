# Open Questions — Updated 2026-06-11

## Still Unresolved
1. Which GHL plan does Showtime Pool Service use? (affects API rate limits and feature access tier)
2. GHL custom field IDs for `gate_code`, `access_notes`, `service_notes`, `scheduled_date`, `service_category`, `priority` — must retrieve from client's GHL account before ContactCreate/ContactUpdate webhooks can be fully wired
3. GHL calendar ID → service category mapping for AppointmentBooked events (needed for `GHL_CALENDAR_TO_SERVICE_CAT` env map)
4. Does the client want customer email/SMS notifications via GHL when a job is completed? (would trigger GHL automation from ServiceOps)
5. How many technician accounts need to be seeded in the Supabase `users` table?
6. Is there an existing property/customer address list to import? (bulk migration question)
7. Stripe billing model: per-technician seat, flat monthly, or usage-based?
8. `waitUntil()` wrapper — confirm Vercel runtime (Edge vs Node.js) to implement correctly for fire-and-forget GHL calls

## Resolved (For Reference)
- ~~GHL auth method?~~ → Private Integration Token ✅ (2026-05-xx)
- ~~Photo storage?~~ → Supabase Storage ✅ (2026-05-xx)
- ~~Recurring visits: internal or GHL calendar?~~ → Internal cron ✅ (2026-05-14)
- ~~Estimate handoff: new opportunity or update existing?~~ → Create GHL task ✅ (2026-05-xx)
- ~~Technician app: mobile web or native?~~ → Mobile web MVP ✅ (2026-05-xx)
- ~~Database provider?~~ → Supabase PostgreSQL ✅ (2026-05-06)
- ~~Auth provider?~~ → NextAuth v4 + bcrypt ✅ (2026-05-06)
- ~~Deployment?~~ → Vercel ✅ (2026-05-05)
- ~~GHL pipeline stage names for Showtime?~~ → 10 stages confirmed ✅ (2026-05-15)
