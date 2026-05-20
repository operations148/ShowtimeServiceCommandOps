/**
 * MOCK / DEMO DATA — Showtime Pool Service
 *
 * This file provides realistic demo data for the reporting dashboard.
 * It is used when:
 *   - GHL_PRIVATE_INTEGRATION_TOKEN is not set
 *   - APP_ENV === 'development'
 *   - USE_MOCK_DATA is explicitly true
 *
 * All numbers reflect a realistic small-to-mid pool service company
 * operating in Southern California with ~2 VAs and 2 technicians.
 * Revenue values are stored in USD cents (e.g. 1260000 = $12,600).
 */

import {
  OwnerPerformanceData,
  VAPerformanceData,
  MarketingPerformanceData,
  TrendPoint,
  DateRange,
} from '@/types/reporting'
import { subDays, format } from 'date-fns'

// ─── Helper: generate trend points ───────────────────────────────────────────

function generateTrend(
  days: number,
  baseValue: number,
  variance: number
): TrendPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: format(subDays(new Date(), days - 1 - i), 'yyyy-MM-dd'),
    value: Math.max(0, Math.round(
      baseValue + (Math.random() - 0.5) * variance
    )),
  }))
}

// ─── Default date range ───────────────────────────────────────────────────────

export const defaultDateRange: DateRange = {
  preset: 'this_month',
  from: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
  to: format(new Date(), 'yyyy-MM-dd'),
}

// ─── Owner Performance Mock ───────────────────────────────────────────────────

export const mockOwnerPerformance: OwnerPerformanceData = {
  summary: {
    totalLeads: 47,
    newLeads: 12,
    bookedAppointments: 31,
    showRate: 87.1,
    closeRate: 64.5,
    pipelineValue: 2840000,    // $28,400
    wonRevenue: 1260000,       // $12,600
    lostOpportunities: 8,
    missedLeads: 3,
    missedCalls: 2,
    avgSpeedToLead: 4.2,       // 4.2 minutes
    leadToBookingRate: 65.9,
    bookingToWonRate: 64.5,
  },
  deltas: {
    totalLeads: {
      value: 8, percentage: 20.5,
      direction: 'up', label: 'vs last month',
    },
    bookedAppointments: {
      value: 5, percentage: 19.2,
      direction: 'up', label: 'vs last month',
    },
    closeRate: {
      value: 3.2, percentage: 5.2,
      direction: 'up', label: 'vs last month',
    },
    wonRevenue: {
      value: 210000, percentage: 20.0,
      direction: 'up', label: 'vs last month',
    },
    pipelineValue: {
      value: -180000, percentage: -6.0,
      direction: 'down', label: 'vs last month',
    },
  },
  trends: {
    leads:        generateTrend(30, 1.5, 2),
    appointments: generateTrend(30, 1.0, 1.5),
    revenue:      generateTrend(30, 42000, 20000),
  },
  revenueBySource: [
    {
      source: 'Google Ads', leads: 18, bookings: 13,
      pipelineValue: 1020000, wonRevenue: 520000,
      leadToApptRate: 72.2, apptToWonRate: 69.2,
      color: '#06B6D4',
    },
    {
      source: 'Referral', leads: 12, bookings: 9,
      pipelineValue: 840000, wonRevenue: 480000,
      leadToApptRate: 75.0, apptToWonRate: 77.8,
      color: '#10B981',
    },
    {
      source: 'Facebook Ads', leads: 9, bookings: 5,
      pipelineValue: 540000, wonRevenue: 180000,
      leadToApptRate: 55.6, apptToWonRate: 50.0,
      color: '#8B5CF6',
    },
    {
      source: 'Organic / SEO', leads: 6, bookings: 3,
      pipelineValue: 320000, wonRevenue: 60000,
      leadToApptRate: 50.0, apptToWonRate: 33.3,
      color: '#F59E0B',
    },
    {
      source: 'Walk-in / Other', leads: 2, bookings: 1,
      pipelineValue: 120000, wonRevenue: 20000,
      leadToApptRate: 50.0, apptToWonRate: 33.3,
      color: '#64748B',
    },
  ],
  conversionFunnel: [
    { stage: 'Leads',     count: 47, value: 0,       conversionRate: 100,  color: '#06B6D4' },
    { stage: 'Contacted', count: 41, value: 0,       conversionRate: 87.2, color: '#3B82F6' },
    { stage: 'Booked',    count: 31, value: 2840000, conversionRate: 65.9, color: '#8B5CF6' },
    { stage: 'Showed',    count: 27, value: 2480000, conversionRate: 87.1, color: '#F59E0B' },
    { stage: 'Won',       count: 20, value: 1260000, conversionRate: 74.1, color: '#10B981' },
  ],
  filters: {
    dateRange: defaultDateRange,
  },
  generatedAt: new Date().toISOString(),
  dataSource: 'mock',
}

// ─── VA Performance Mock ──────────────────────────────────────────────────────

export const mockVAPerformance: VAPerformanceData = {
  team: [
    {
      userId: 'va-001',
      name: 'Jordan (Tech)',
      avatarInitials: 'JT',
      leadsAssigned: 24,
      leadsContacted: 22,
      firstResponseTime: 3.8,
      conversationsHandled: 38,
      followUpsCompleted: 29,
      tasksCompleted: 41,
      appointmentsBooked: 16,
      bookingRate: 66.7,
      noShowRecoveryAttempts: 4,
      staleLeads: 2,
      slaCompliance: 91.7,
    },
    {
      userId: 'va-002',
      name: 'Steve Adams',
      avatarInitials: 'SA',
      leadsAssigned: 23,
      leadsContacted: 19,
      firstResponseTime: 6.2,
      conversationsHandled: 31,
      followUpsCompleted: 21,
      tasksCompleted: 28,
      appointmentsBooked: 15,
      bookingRate: 65.2,
      noShowRecoveryAttempts: 3,
      staleLeads: 4,
      slaCompliance: 78.3,
    },
  ],
  summary: {
    totalLeadsAssigned: 47,
    avgFirstResponseTime: 5.0,
    avgBookingRate: 65.9,
    totalAppointmentsBooked: 31,
    avgSlaCompliance: 85.0,
  },
  trends: {
    responseTime: generateTrend(30, 5, 3),
    bookingRate:  generateTrend(30, 65, 10),
  },
  filters: { dateRange: defaultDateRange },
  generatedAt: new Date().toISOString(),
  dataSource: 'mock',
}

// ─── Marketing Performance Mock ───────────────────────────────────────────────

export const mockMarketingPerformance: MarketingPerformanceData = {
  summary: {
    totalLeads: 47,
    totalBookings: 31,
    totalPipelineValue: 2840000,
    totalWonRevenue: 1260000,
    leadToApptRate: 65.9,
    apptToWonRate: 74.1,
  },
  bySource: mockOwnerPerformance.revenueBySource,
  byCampaign: [
    {
      campaign: 'Pool Season 2026', source: 'Google Ads',
      leads: 11, bookings: 8, pipelineValue: 640000,
      wonRevenue: 320000, conversionRate: 72.7,
    },
    {
      campaign: 'Spring Referral Push', source: 'Referral',
      leads: 9, bookings: 7, pipelineValue: 560000,
      wonRevenue: 360000, conversionRate: 77.8,
    },
    {
      campaign: 'FB Homeowners LA', source: 'Facebook Ads',
      leads: 7, bookings: 4, pipelineValue: 420000,
      wonRevenue: 140000, conversionRate: 57.1,
    },
    {
      campaign: 'Organic Search', source: 'Organic / SEO',
      leads: 6, bookings: 3, pipelineValue: 320000,
      wonRevenue: 60000, conversionRate: 50.0,
    },
    {
      campaign: 'Google Retargeting', source: 'Google Ads',
      leads: 7, bookings: 5, pipelineValue: 380000,
      wonRevenue: 200000, conversionRate: 71.4,
    },
    {
      campaign: 'Walk-in / Direct', source: 'Walk-in / Other',
      leads: 7, bookings: 4, pipelineValue: 520000,
      wonRevenue: 180000, conversionRate: 57.1,
    },
  ],
  trends: {
    leadsBySource: Array.from({ length: 14 }, (_, i) => ({
      date: format(subDays(new Date(), 13 - i), 'yyyy-MM-dd'),
      'Google Ads':     Math.round(Math.random() * 3),
      'Referral':       Math.round(Math.random() * 2),
      'Facebook Ads':   Math.round(Math.random() * 2),
      'Organic / SEO':  Math.round(Math.random() * 1),
    })),
  },
  conversionFunnel: mockOwnerPerformance.conversionFunnel,
  filters: { dateRange: defaultDateRange },
  generatedAt: new Date().toISOString(),
  dataSource: 'mock',
}

// ─── Mock/Live toggle ─────────────────────────────────────────────────────────

export const USE_MOCK_DATA = (() => {
  const env           = process.env.APP_ENV
  const token         = process.env.GHL_PRIVATE_INTEGRATION_TOKEN
  const reportingMode = process.env.NEXT_PUBLIC_REPORTING_MODE

  if (reportingMode === 'live') return false
  if (reportingMode === 'mock') return true
  if (!token || token.trim() === '') return true
  if (env === 'development') return true
  return false
})()
