import type {
  OwnerPerformanceData,
  MarketingPerformanceData,
  VAPerformanceData,
  ReportingFilters,
} from '@/types/reporting'
import {
  mockOwnerPerformance,
  mockVAPerformance,
  mockMarketingPerformance,
  USE_MOCK_DATA,
} from '@/config/reporting-mock-data'
import {
  fetchAllContacts,
  fetchAllOpportunities,
  fetchAllCalendarEvents,
} from './ghl-api'
import {
  aggregateOwnerPerformance,
  aggregateMarketingPerformance,
} from './reporting-aggregator'
import {
  getCached,
  setCached,
  getCacheAge,
} from './reporting-cache'

// ─── Previous period helper ───────────────────────────────────────────────────

function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from + 'T00:00:00Z')
  const toDate   = new Date(to   + 'T00:00:00Z')
  const days     = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

  const prevTo = new Date(fromDate)
  prevTo.setUTCDate(prevTo.getUTCDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days)

  return {
    from: prevFrom.toISOString().slice(0, 10),
    to:   prevTo.toISOString().slice(0, 10),
  }
}

// ─── Owner Performance ────────────────────────────────────────────────────────

export async function getOwnerPerformance(
  filters: ReportingFilters,
  tenantId: string,
): Promise<OwnerPerformanceData> {
  if (USE_MOCK_DATA) {
    await new Promise(r => setTimeout(r, 400))
    return { ...mockOwnerPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
  }

  const { from, to } = filters.dateRange
  const cacheKey = `owner:${tenantId}:${from}:${to}`

  const cached = getCached<OwnerPerformanceData>(cacheKey)
  if (cached) {
    return { ...cached, dataSource: 'cached', cacheAge: getCacheAge(cacheKey) }
  }

  try {
    console.log(`[Reporting] Fetching live GHL data: ${from} → ${to}`)

    const [contacts, opportunities, events] = await Promise.all([
      fetchAllContacts(from, to),
      fetchAllOpportunities(from, to),
      fetchAllCalendarEvents(from, to),
    ])

    const prevPeriod = getPreviousPeriod(from, to)
    const [prevContacts, prevOpportunities] = await Promise.all([
      fetchAllContacts(prevPeriod.from, prevPeriod.to),
      fetchAllOpportunities(prevPeriod.from, prevPeriod.to),
    ])

    const result = aggregateOwnerPerformance(
      contacts, opportunities, events, filters, prevContacts, prevOpportunities,
    )

    setCached(cacheKey, result, 300)

    console.log(
      `[Reporting] Owner Performance: ${result.summary.totalLeads} leads, ` +
      `${result.summary.bookedAppointments} appts, ` +
      `$${(result.summary.wonRevenue / 100).toFixed(0)} won`,
    )

    return result
  } catch (err) {
    console.error('[Reporting] Live GHL fetch failed:', err)
    return { ...mockOwnerPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
  }
}

// ─── Marketing Performance ────────────────────────────────────────────────────

export async function getMarketingPerformance(
  filters: ReportingFilters,
  tenantId: string,
): Promise<MarketingPerformanceData> {
  if (USE_MOCK_DATA) {
    await new Promise(r => setTimeout(r, 400))
    return { ...mockMarketingPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
  }

  const { from, to } = filters.dateRange
  const cacheKey = `marketing:${tenantId}:${from}:${to}`

  const cached = getCached<MarketingPerformanceData>(cacheKey)
  if (cached) {
    return { ...cached, dataSource: 'cached' }
  }

  try {
    const [contacts, opportunities, events] = await Promise.all([
      fetchAllContacts(from, to),
      fetchAllOpportunities(from, to),
      fetchAllCalendarEvents(from, to),
    ])

    const result = aggregateMarketingPerformance(contacts, opportunities, events, filters)

    setCached(cacheKey, result, 300)

    return result
  } catch (err) {
    console.error('[Reporting] Marketing live fetch failed:', err)
    return { ...mockMarketingPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
  }
}

// ─── VA Performance (stays mock — requires per-user GHL conversation API) ─────

export async function getVAPerformance(
  filters: ReportingFilters,
  _tenantId: string,
): Promise<VAPerformanceData> {
  await new Promise(r => setTimeout(r, 400))
  return { ...mockVAPerformance, filters, generatedAt: new Date().toISOString(), dataSource: 'mock' }
}
