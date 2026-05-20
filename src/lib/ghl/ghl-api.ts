const GHL_BASE     = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com'
const GHL_TOKEN    = process.env.GHL_PRIVATE_INTEGRATION_TOKEN
const GHL_LOCATION = process.env.GHL_LOCATION_ID ?? process.env.NEXT_PUBLIC_GHL_LOCATION_ID
const GHL_VERSION  = '2021-07-28'

// ─── Base authenticated fetch ──────────────────────────────────────────────────

async function ghlFetch<T>(
  path: string,
  options: RequestInit = {},
  cacheSeconds: number = 300,
): Promise<T> {
  if (!GHL_TOKEN) throw new Error('GHL_PRIVATE_INTEGRATION_TOKEN not set')

  const res = await fetch(`${GHL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      'Content-Type': 'application/json',
      Version: GHL_VERSION,
      ...options.headers,
    },
    next: { revalidate: cacheSeconds },
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`GHL API ${res.status} on ${path}: ${errorText.slice(0, 200)}`)
  }

  return res.json() as Promise<T>
}

// ─── GHL Types ────────────────────────────────────────────────────────────────

export interface GHLContactRaw {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  source?: string
  tags?: string[]
  customFields?: { id: string; value: string }[]
  dateAdded?: string
  createdAt?: string
}

export interface GHLOpportunityRaw {
  id: string
  name?: string
  contactId?: string
  status?: string
  monetaryValue?: number
  pipelineId?: string
  pipelineStageId?: string
  pipelineStageName?: string
  source?: string
  assignedTo?: string
  createdAt?: string
  updatedAt?: string
}

export interface GHLCalendarEventRaw {
  id?: string
  title?: string
  startTime?: string
  endTime?: string
  status?: string
  contactId?: string
  calendarId?: string
  assignedUserId?: string
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function toGHLTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime()
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function fetchAllContacts(
  from: string,
  to: string,
): Promise<GHLContactRaw[]> {
  if (!GHL_LOCATION) return []
  const contacts: GHLContactRaw[] = []
  let startAfterId = ''

  for (let i = 0; i < 20; i++) {
    try {
      const cursor = startAfterId ? `&startAfterId=${startAfterId}` : ''
      const data = await ghlFetch<{
        contacts?: GHLContactRaw[]
        meta?: { nextPageUrl?: string; total?: number }
      }>(
        `/contacts/?locationId=${GHL_LOCATION}&startDate=${from}&endDate=${to}&limit=100${cursor}`,
        {},
        300,
      )
      const batch = data.contacts ?? []
      contacts.push(...batch)
      if (batch.length === 0 || !data.meta?.nextPageUrl) break
      startAfterId = batch[batch.length - 1]?.id ?? ''
    } catch (err) {
      console.error('[GHL] fetchAllContacts error:', err)
      break
    }
  }

  console.log(`[GHL] Fetched ${contacts.length} contacts`)
  return contacts
}

// ─── Opportunities ────────────────────────────────────────────────────────────

export async function fetchAllOpportunities(
  from: string,
  to: string,
): Promise<GHLOpportunityRaw[]> {
  if (!GHL_LOCATION) return []
  const opportunities: GHLOpportunityRaw[] = []
  const startMs = new Date(from + 'T00:00:00Z').getTime()
  const endMs   = new Date(to   + 'T23:59:59Z').getTime()
  let page = 1

  for (let i = 0; i < 20; i++) {
    try {
      const data = await ghlFetch<{
        opportunities?: GHLOpportunityRaw[]
        meta?: { total?: number; nextPage?: number }
      }>(
        `/opportunities/search?location_id=${GHL_LOCATION}&startDate=${from}&endDate=${to}&status=all&limit=100&page=${page}`,
        {},
        300,
      )
      const batch = data.opportunities ?? []
      if (batch.length === 0) break
      for (const o of batch) {
        const ts = new Date(o.createdAt ?? '').getTime()
        if (ts >= startMs && ts <= endMs) opportunities.push(o)
      }
      if (!data.meta?.nextPage) break
      page++
    } catch (err) {
      console.error('[GHL] fetchAllOpportunities error:', err)
      break
    }
  }

  console.log(`[GHL] Fetched ${opportunities.length} opportunities`)
  return opportunities
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export async function fetchAllCalendarEvents(
  from: string,
  to: string,
): Promise<GHLCalendarEventRaw[]> {
  if (!GHL_LOCATION) return []
  try {
    const startTime = encodeURIComponent(new Date(from + 'T00:00:00Z').toISOString())
    const endTime   = encodeURIComponent(new Date(to   + 'T23:59:59Z').toISOString())
    const data = await ghlFetch<{
      events?: GHLCalendarEventRaw[]
      appointments?: GHLCalendarEventRaw[]
    }>(
      `/calendars/events?locationId=${GHL_LOCATION}&startTime=${startTime}&endTime=${endTime}`,
      {},
      300,
    )
    const events = data.events ?? data.appointments ?? []
    console.log(`[GHL] Fetched ${events.length} calendar events`)
    return events
  } catch (err) {
    console.error('[GHL] fetchAllCalendarEvents error:', err)
    return []
  }
}
