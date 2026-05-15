// ─── Date Range ───────────────────────────────────────────────────────────────

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom'

export interface DateRange {
  preset: DateRangePreset
  from: string   // ISO date string
  to: string     // ISO date string
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ReportingFilters {
  dateRange: DateRange
  userId?: string
  source?: string
  pipeline?: string
  campaign?: string
  serviceCategory?: string
  locationId?: string
}

// ─── Delta / Comparison ───────────────────────────────────────────────────────

export interface MetricDelta {
  value: number
  percentage: number
  direction: 'up' | 'down' | 'neutral'
  label: string   // e.g. "vs last period"
}

// ─── Trend data point ─────────────────────────────────────────────────────────

export interface TrendPoint {
  date: string    // ISO date
  value: number
  label?: string
}

// ─── Owner Performance ────────────────────────────────────────────────────────

export interface OwnerPerformanceData {
  summary: {
    totalLeads: number
    newLeads: number
    bookedAppointments: number
    showRate: number           // 0-100 percentage
    closeRate: number          // 0-100 percentage
    pipelineValue: number      // USD cents
    wonRevenue: number         // USD cents
    lostOpportunities: number
    missedLeads: number
    missedCalls: number
    avgSpeedToLead: number     // minutes
    leadToBookingRate: number  // 0-100 percentage
    bookingToWonRate: number   // 0-100 percentage
  }
  deltas: {
    totalLeads: MetricDelta
    bookedAppointments: MetricDelta
    closeRate: MetricDelta
    wonRevenue: MetricDelta
    pipelineValue: MetricDelta
  }
  trends: {
    leads: TrendPoint[]
    appointments: TrendPoint[]
    revenue: TrendPoint[]
  }
  revenueBySource: SourceBreakdownItem[]
  conversionFunnel: FunnelStage[]
  filters: ReportingFilters
  generatedAt: string
  dataSource: 'live' | 'mock' | 'cached'
  cacheAge?: number            // seconds
}

// ─── VA Performance ───────────────────────────────────────────────────────────

export interface VAPerformanceRow {
  userId: string
  name: string
  avatarInitials: string
  leadsAssigned: number
  leadsContacted: number
  firstResponseTime: number   // minutes average
  conversationsHandled: number
  followUpsCompleted: number
  tasksCompleted: number
  appointmentsBooked: number
  bookingRate: number         // 0-100 percentage
  noShowRecoveryAttempts: number
  staleLeads: number
  slaCompliance: number       // 0-100 percentage
}

export interface VAPerformanceData {
  team: VAPerformanceRow[]
  summary: {
    totalLeadsAssigned: number
    avgFirstResponseTime: number
    avgBookingRate: number
    totalAppointmentsBooked: number
    avgSlaCompliance: number
  }
  trends: {
    responseTime: TrendPoint[]
    bookingRate: TrendPoint[]
  }
  filters: ReportingFilters
  generatedAt: string
  dataSource: 'live' | 'mock' | 'cached'
}

// ─── Tech Performance (live from platform DB) ─────────────────────────────────

export interface TechPerformanceRow {
  userId: string
  name: string
  avatarInitials: string
  totalAssigned: number
  completed: number
  inProgress: number
  estimateNeeded: number
  completionRate: number      // 0-100 percentage
  avgDaysToComplete: number
}

export interface TechPerformanceData {
  team: TechPerformanceRow[]
  summary: {
    totalAssigned: number
    totalCompleted: number
    avgCompletionRate: number
    totalInProgress: number
  }
  trends: {
    completedJobs: TrendPoint[]
    newJobs: TrendPoint[]
  }
  filters: ReportingFilters
  generatedAt: string
  dataSource: 'live' | 'mock' | 'cached'
}

// ─── Marketing Performance ────────────────────────────────────────────────────

export interface SourceBreakdownItem {
  source: string
  leads: number
  bookings: number
  pipelineValue: number       // USD cents
  wonRevenue: number          // USD cents
  leadToApptRate: number      // 0-100 percentage
  apptToWonRate: number       // 0-100 percentage
  color: string               // hex for chart
}

export interface FunnelStage {
  stage: string
  count: number
  value: number               // USD cents
  conversionRate: number      // from previous stage
  color: string               // hex for chart
}

export interface CampaignRow {
  campaign: string
  source: string
  leads: number
  bookings: number
  pipelineValue: number
  wonRevenue: number
  conversionRate: number
}

export interface MarketingPerformanceData {
  summary: {
    totalLeads: number
    totalBookings: number
    totalPipelineValue: number
    totalWonRevenue: number
    leadToApptRate: number
    apptToWonRate: number
  }
  bySource: SourceBreakdownItem[]
  byCampaign: CampaignRow[]
  trends: {
    leadsBySource: { date: string; [source: string]: number | string }[]
  }
  conversionFunnel: FunnelStage[]
  filters: ReportingFilters
  generatedAt: string
  dataSource: 'live' | 'mock' | 'cached'
}

// ─── API Response wrapper ─────────────────────────────────────────────────────

export interface ReportingApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

// ─── Tab definition ───────────────────────────────────────────────────────────

export interface ReportingTab {
  id: 'owner' | 'va' | 'marketing'
  label: string
  description: string
  href: string
}
