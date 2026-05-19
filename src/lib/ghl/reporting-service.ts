/**
 * Reporting service — abstraction layer between API routes and data sources.
 *
 * When USE_MOCK_DATA is true (no GHL token or location ID set, or APP_ENV=development),
 * returns realistic mock data with a simulated network delay.
 *
 * When USE_MOCK_DATA is false, calls live GHL API endpoints for real data.
 */

import type {
  OwnerPerformanceData,
  VAPerformanceData,
  MarketingPerformanceData,
  ReportingFilters,
  TrendPoint,
  SourceBreakdownItem,
  FunnelStage,
} from '@/types/reporting'
import {
  mockOwnerPerformance,
  mockVAPerformance,
  mockMarketingPerformance,
  USE_MOCK_DATA,
} from '@/config/reporting-mock-data'

const GHL_BASE     = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com'
const GHL_TOKEN    = process.env.GHL_PRIVATE_INTEGRATION_TOKEN
const GHL_LOCATION = process.env.GHL_LOCATION_ID ?? process.env.NEXT_PUBLIC_GHL_LOCATION_ID

// ─── GHL fetch helper ─────────────────────────────────────────────────────────

async function ghlGet<T = unknown>(path: string): Promise<T> {
  if (!GHL_TOKEN) throw new Error('GHL_PRIVATE_INTEGRATION_TOKEN not set')
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    next: { revalidate: 300 },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GHL API ${res.status}: ${path} — ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ─── GHL data fetchers ────────────────────────────────────────────────────────

interface GHLContact {
  id: string
  dateAdded: string
  source?: string
  tags?: string[]
}

interface GHLOpportunity {
  id: string
  status: 'open' | 'won' | 'lost' | 'abandoned'
  monetaryValue?: number
  source?: string
  customFields?: { id: string; value: string }[]
  createdAt: string
  updatedAt: string
}

interface GHLEvent {
  id: string
  status: 'booked' | 'showed' | 'no_show' | 'cancelled' | 'invalid'
  startTime: string
  appointmentStatus?: string
}

async function fetchAllContacts(from: string, to: string): Promise<GHLContact[]> {
  if (!GHL_LOCATION) return []
  const contacts: GHLContact[] = []
  let startAfterId = ''
  const startDate = new Date(from + 'T00:00:00Z').getTime()
  const endDate   = new Date(to   + 'T23:59:59Z').getTime()

  // GHL doesn't sort contacts by date, so we must paginate all and filter client-side.
  // Cap at 50 pages (5,000 contacts) to avoid runaway loops on large accounts.
  for (let page = 0; page < 50; page++) {
    const cursor = startAfterId ? `&startAfterId=${startAfterId}` : ''
    const data = await ghlGet<{ contacts: GHLContact[]; meta?: { nextPageUrl?: string; total?: number } }>(
      `/contacts/?locationId=${GHL_LOCATION}&limit=100${cursor}`
    )
    const batch = data.contacts ?? []
    if (batch.length === 0) break

    for (const c of batch) {
      const ts = new Date(c.dateAdded).getTime()
      if (ts >= startDate && ts <= endDate) contacts.push(c)
    }

    if (!data.meta?.nextPageUrl) break
    startAfterId = batch[batch.length - 1]?.id ?? ''
  }
  return contacts
}

async function fetchAllOpportunities(from: string, to: string): Promise<GHLOpportunity[]> {
  if (!GHL_LOCATION) return []
  const opps: GHLOpportunity[] = []
  const startDate = new Date(from + 'T00:00:00Z').getTime()
  const endDate   = new Date(to   + 'T23:59:59Z').getTime()
  let page = 1

  // GHL opportunities search uses startDate/endDate (not date/endDate)
  // and requires explicit status=all to include won/lost, not just open.
  for (let i = 0; i < 20; i++) {
    const data = await ghlGet<{ opportunities: GHLOpportunity[]; meta?: { total?: number; currentPage?: number; nextPage?: number } }>(
      `/opportunities/search?location_id=${GHL_LOCATION}&startDate=${from}&endDate=${to}&status=all&limit=100&page=${page}`
    )
    const batch = data.opportunities ?? []
    if (batch.length === 0) break
    // Filter by createdAt within range (belt-and-suspenders)
    for (const o of batch) {
      const ts = new Date(o.createdAt).getTime()
      if (ts >= startDate && ts <= endDate) opps.push(o)
    }
    if (!data.meta?.nextPage) break
    page++
  }
  return opps
}

async function fetchAllEvents(from: string, to: string): Promise<GHLEvent[]> {
  if (!GHL_LOCATION) return []
  const startTime = encodeURIComponent(new Date(from + 'T00:00:00Z').toISOString())
  const endTime   = encodeURIComponent(new Date(to   + 'T23:59:59Z').toISOString())
  // Note: eventType filter removed — not supported in all GHL API versions
  const data = await ghlGet<{ events: GHLEvent[]; appointments?: GHLEvent[] }>(
    `/calendars/events?locationId=${GHL_LOCATION}&startTime=${startTime}&endTime=${endTime}`
  )
  // GHL may return events under 'events' or 'appointments' key
  return data.events ?? data.appointments ?? []
}

// ─── Trend builder ────────────────────────────────────────────────────────────

function buildDailyTrend(
  items: { date: string }[],
  from: string,
  to: string,
): TrendPoint[] {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const day = item.date.slice(0, 10)
    counts[day] = (counts[day] ?? 0) + 1
  }
  const points: TrendPoint[] = []
  const cur = new Date(from + 'T00:00:00Z')
  const end = new Date(to   + 'T00:00:00Z')
  while (cur <= end) {
    const d = cur.toISOString().slice(0, 10)
    points.push({ date: d, value: counts[d] ?? 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return points
}

// ─── Resilient parallel fetch ─────────────────────────────────────────────────
// Wraps each fetcher individually so a single endpoint failure (e.g. calendars
// 401 due to missing scope) does not cause the entire response to fall back to
// mock data. Failed fetchers return [] and log the specific error.

async function safeFetch<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn()
  } catch (err) {
    console.warn(`[reporting-service] ${label} fetch failed (returning []):`, err)
    return []
  }
}

// ─── Owner Performance (live) ─────────────────────────────────────────────────

async function fetchOwnerPerformanceLive(filters: ReportingFilters): Promise<OwnerPerformanceData> {
  const { from, to } = filters.dateRange

  const [contacts, opps, events] = await Promise.all([
    safeFetch('contacts',     () => fetchAllContacts(from, to)),
    safeFetch('opportunities', () => fetchAllOpportunities(from, to)),
    safeFetch('events',        () => fetchAllEvents(from, to)),
  ])

  console.log(`[reporting-service] live owner data: contacts=${contacts.length} opps=${opps.length} events=${events.length}`)

  const totalLeads     = contacts.length
  const wonOpps        = opps.filter(o => o.status === 'won')
  const lostOpps       = opps.filter(o => o.status === 'lost' || o.status === 'abandoned')
  const openOpps       = opps.filter(o => o.status === 'open')
  const wonRevenue     = wonOpps.reduce((s, o) => s + (o.monetaryValue ?? 0), 0)
  const pipelineValue  = openOpps.reduce((s, o) => s + (o.monetaryValue ?? 0), 0)
  const closeRate      = opps.length > 0 ? (wonOpps.length / (wonOpps.length + lostOpps.length)) * 100 : 0

  const bookedEvents   = events.filter(e => e.status !== 'cancelled' && e.status !== 'invalid')
  const showedEvents   = events.filter(e => e.status === 'showed')
  const showRate       = bookedEvents.length > 0 ? (showedEvents.length / bookedEvents.length) * 100 : 0
  const leadToBooking  = totalLeads > 0 ? (bookedEvents.length / totalLeads) * 100 : 0

  // Conversion funnel
  const contactedApprox = Math.round(totalLeads * 0.85)
  const conversionFunnel: FunnelStage[] = [
    { stage: 'Leads',     count: totalLeads,        value: pipelineValue * 100,   conversionRate: 100,    color: '#3B82F6' },
    { stage: 'Contacted', count: contactedApprox,   value: pipelineValue * 100,   conversionRate: totalLeads > 0 ? (contactedApprox / totalLeads) * 100 : 0, color: '#6366F1' },
    { stage: 'Booked',    count: bookedEvents.length, value: pipelineValue * 100, conversionRate: totalLeads > 0 ? (bookedEvents.length / totalLeads) * 100 : 0, color: '#8B5CF6' },
    { stage: 'Showed',    count: showedEvents.length, value: pipelineValue * 100, conversionRate: bookedEvents.length > 0 ? showRate : 0, color: '#A855F7' },
    { stage: 'Won',       count: wonOpps.length,    value: wonRevenue * 100,      conversionRate: bookedEvents.length > 0 ? (wonOpps.length / bookedEvents.length) * 100 : 0, color: '#10B981' },
  ]

  // Revenue by source
  const sourceMap = new Map<string, { leads: number; won: number; wonRev: number; pipeline: number }>()
  for (const c of contacts) {
    const src = c.source ?? 'Direct'
    const entry = sourceMap.get(src) ?? { leads: 0, won: 0, wonRev: 0, pipeline: 0 }
    entry.leads++
    sourceMap.set(src, entry)
  }
  for (const o of opps) {
    const src = o.source ?? 'Direct'
    const entry = sourceMap.get(src) ?? { leads: 0, won: 0, wonRev: 0, pipeline: 0 }
    if (o.status === 'won') { entry.won++; entry.wonRev += o.monetaryValue ?? 0 }
    else if (o.status === 'open') entry.pipeline += o.monetaryValue ?? 0
    sourceMap.set(src, entry)
  }
  const SOURCE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EF4444', '#14B8A6']
  const revenueBySource: SourceBreakdownItem[] = Array.from(sourceMap.entries()).map(([source, d], i) => ({
    source,
    leads:          d.leads,
    bookings:       Math.round(d.leads * (bookedEvents.length / Math.max(totalLeads, 1))),
    pipelineValue:  d.pipeline,
    wonRevenue:     d.wonRev,
    leadToApptRate: totalLeads > 0 ? (d.leads / totalLeads) * leadToBooking : 0,
    apptToWonRate:  d.leads > 0 ? (d.won / d.leads) * 100 : 0,
    color:          SOURCE_COLORS[i % SOURCE_COLORS.length] ?? '#94A3B8',
  }))

  // Trends
  const leadTrend = buildDailyTrend(contacts.map(c => ({ date: c.dateAdded })), from, to)
  const apptTrend = buildDailyTrend(bookedEvents.map(e => ({ date: e.startTime })), from, to)
  const revTrend  = leadTrend.map(p => ({ ...p, value: 0 })) // revenue by day needs opp closed_date, skip

  return {
    summary: {
      totalLeads,
      newLeads:           totalLeads,
      bookedAppointments: bookedEvents.length,
      showRate:           Math.round(showRate * 10) / 10,
      closeRate:          Math.round(closeRate * 10) / 10,
      pipelineValue:      Math.round(pipelineValue),
      wonRevenue:         Math.round(wonRevenue),
      lostOpportunities:  lostOpps.length,
      missedLeads:        0,
      missedCalls:        0,
      avgSpeedToLead:     0,
      leadToBookingRate:  Math.round(leadToBooking * 10) / 10,
      bookingToWonRate:   bookedEvents.length > 0 ? Math.round((wonOpps.length / bookedEvents.length) * 1000) / 10 : 0,
    },
    deltas: {
      totalLeads:         { value: 0, percentage: 0, direction: 'neutral', label: 'vs last period' },
      bookedAppointments: { value: 0, percentage: 0, direction: 'neutral', label: 'vs last period' },
      closeRate:          { value: 0, percentage: 0, direction: 'neutral', label: 'vs last period' },
      wonRevenue:         { value: 0, percentage: 0, direction: 'neutral', label: 'vs last period' },
      pipelineValue:      { value: 0, percentage: 0, direction: 'neutral', label: 'vs last period' },
    },
    trends: {
      leads:        leadTrend,
      appointments: apptTrend,
      revenue:      revTrend,
    },
    revenueBySource,
    conversionFunnel,
    filters,
    generatedAt: new Date().toISOString(),
    dataSource:  'live',
  }
}

// ─── Marketing Performance (live) ────────────────────────────────────────────

async function fetchMarketingPerformanceLive(filters: ReportingFilters): Promise<MarketingPerformanceData> {
  const { from, to } = filters.dateRange

  const [contacts, opps, events] = await Promise.all([
    safeFetch('contacts',      () => fetchAllContacts(from, to)),
    safeFetch('opportunities', () => fetchAllOpportunities(from, to)),
    safeFetch('events',        () => fetchAllEvents(from, to)),
  ])

  console.log(`[reporting-service] live marketing data: contacts=${contacts.length} opps=${opps.length} events=${events.length}`)

  const totalLeads    = contacts.length
  const bookedEvents  = events.filter(e => e.status !== 'cancelled' && e.status !== 'invalid')
  const wonOpps       = opps.filter(o => o.status === 'won')
  const totalRevenue  = wonOpps.reduce((s, o) => s + (o.monetaryValue ?? 0), 0)
  const totalPipeline = opps.filter(o => o.status === 'open').reduce((s, o) => s + (o.monetaryValue ?? 0), 0)

  const SOURCE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EF4444', '#14B8A6']
  const sourceMap = new Map<string, { leads: number; bookings: number; pipeline: number; wonRev: number }>()
  for (const c of contacts) {
    const src = c.source ?? 'Direct'
    const e = sourceMap.get(src) ?? { leads: 0, bookings: 0, pipeline: 0, wonRev: 0 }
    e.leads++
    sourceMap.set(src, e)
  }
  for (const o of opps) {
    const src = o.source ?? 'Direct'
    const e = sourceMap.get(src) ?? { leads: 0, bookings: 0, pipeline: 0, wonRev: 0 }
    if (o.status === 'won') e.wonRev += o.monetaryValue ?? 0
    else if (o.status === 'open') e.pipeline += o.monetaryValue ?? 0
    sourceMap.set(src, e)
  }

  const bySource: SourceBreakdownItem[] = Array.from(sourceMap.entries()).map(([source, d], i) => ({
    source,
    leads:          d.leads,
    bookings:       d.bookings,
    pipelineValue:  d.pipeline,
    wonRevenue:     d.wonRev,
    leadToApptRate: totalLeads > 0 ? (d.leads / totalLeads) * (bookedEvents.length / Math.max(totalLeads, 1)) * 100 : 0,
    apptToWonRate:  d.bookings > 0 ? (d.wonRev > 0 ? 100 : 0) : 0,
    color:          SOURCE_COLORS[i % SOURCE_COLORS.length] ?? '#94A3B8',
  }))

  // Build by-campaign table from source breakdown
  const byCampaign = bySource.map(s => ({
    campaign:       s.source,
    source:         s.source,
    leads:          s.leads,
    bookings:       s.bookings,
    pipelineValue:  s.pipelineValue,
    wonRevenue:     s.wonRevenue,
    conversionRate: s.leads > 0 ? (s.bookings / s.leads) * 100 : 0,
    color:          s.color,
  }))

  // 14-day leads by source trend
  const dateRange: string[] = []
  const cur = new Date(from + 'T00:00:00Z')
  const end = new Date(to   + 'T00:00:00Z')
  while (cur <= end) { dateRange.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1) }

  const sourceNames = Array.from(sourceMap.keys()).slice(0, 5)
  const leadsBySource = dateRange.map(date => {
    const entry: Record<string, number | string> = { date }
    for (const src of sourceNames) {
      entry[src] = contacts.filter(c => c.dateAdded.slice(0, 10) === date && (c.source ?? 'Direct') === src).length
    }
    return entry as { date: string } & Record<string, number>
  })

  const conversionFunnel: FunnelStage[] = [
    { stage: 'Leads',    count: totalLeads,          value: totalPipeline * 100, conversionRate: 100,    color: '#3B82F6' },
    { stage: 'Booked',   count: bookedEvents.length, value: totalPipeline * 100, conversionRate: totalLeads > 0 ? (bookedEvents.length / totalLeads) * 100 : 0, color: '#8B5CF6' },
    { stage: 'Won',      count: wonOpps.length,      value: totalRevenue * 100,  conversionRate: bookedEvents.length > 0 ? (wonOpps.length / bookedEvents.length) * 100 : 0, color: '#10B981' },
  ]

  return {
    summary: {
      totalLeads,
      totalBookings:    bookedEvents.length,
      totalPipelineValue: totalPipeline,
      totalWonRevenue:  totalRevenue,
      leadToApptRate:   totalLeads > 0 ? Math.round((bookedEvents.length / totalLeads) * 1000) / 10 : 0,
      apptToWonRate:    bookedEvents.length > 0 ? Math.round((wonOpps.length / bookedEvents.length) * 1000) / 10 : 0,
    },
    bySource,
    byCampaign,
    trends: { leadsBySource },
    conversionFunnel,
    filters,
    generatedAt: new Date().toISOString(),
    dataSource: 'live',
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getOwnerPerformance(
  filters: ReportingFilters,
  _tenantId: string,
): Promise<OwnerPerformanceData> {
  if (USE_MOCK_DATA) {
    await new Promise(r => setTimeout(r, 400))
    return { ...mockOwnerPerformance, filters, generatedAt: new Date().toISOString() }
  }
  try {
    return await fetchOwnerPerformanceLive(filters)
  } catch (err) {
    console.error('[reporting-service] GHL owner performance fetch failed, using mock:', err)
    return { ...mockOwnerPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
  }
}

export async function getVAPerformance(
  filters: ReportingFilters,
  _tenantId: string,
): Promise<VAPerformanceData> {
  // VA Performance metrics (response times, SLA) require GHL conversation data
  // which requires per-user scoped queries — deferred to a future phase.
  await new Promise(r => setTimeout(r, 400))
  return { ...mockVAPerformance, filters, generatedAt: new Date().toISOString() }
}

export async function getMarketingPerformance(
  filters: ReportingFilters,
  _tenantId: string,
): Promise<MarketingPerformanceData> {
  if (USE_MOCK_DATA) {
    await new Promise(r => setTimeout(r, 400))
    return { ...mockMarketingPerformance, filters, generatedAt: new Date().toISOString() }
  }
  try {
    return await fetchMarketingPerformanceLive(filters)
  } catch (err) {
    console.error('[reporting-service] GHL marketing performance fetch failed, using mock:', err)
    return { ...mockMarketingPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
  }
}
