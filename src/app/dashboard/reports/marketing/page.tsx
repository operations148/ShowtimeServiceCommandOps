'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users, Calendar, DollarSign, TrendingUp, Target, BarChart2, RefreshCw,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import {
  ReportingTabs, DateRangeFilter, MetricCard,
  SourceBreakdown, ConversionFunnel,
  LoadingSkeleton, ErrorState, EmptyState,
} from '@/components/reporting'
import { defaultDateRange } from '@/config/reporting-mock-data'
import type {
  ReportingFilters, ReportingApiResponse,
  MarketingPerformanceData, CampaignRow,
} from '@/types/reporting'

// ─── Source colors from the data ─────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  'Google Ads':     '#06B6D4',
  'Referral':       '#10B981',
  'Facebook Ads':   '#8B5CF6',
  'Organic / SEO':  '#F59E0B',
  'Walk-in / Other': '#64748B',
}

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? '#94A3B8'
}

// ─── Campaign table ───────────────────────────────────────────────────────────

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const sorted = [...rows].sort((a, b) => b.wonRevenue - a.wonRevenue)

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No campaign data"
        message="No campaigns found for the selected date range."
        icon="filter"
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            {['Campaign', 'Source', 'Leads', 'Bookings', 'Pipeline', 'Won Revenue', 'Conv %'].map(h => (
              <th
                key={h}
                className="text-left font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] px-4 py-2.5 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F4F7FB] transition-colors"
            >
              <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.campaign}</td>
              <td className="px-4 py-3">
                <span
                  className="font-mono text-[11px] px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: getSourceColor(row.source) }}
                >
                  {row.source}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-sm text-[#475569]">{row.leads}</td>
              <td className="px-4 py-3 font-mono text-sm text-[#475569]">{row.bookings}</td>
              <td className="px-4 py-3 font-mono text-sm text-[#475569]">
                ${(row.pipelineValue / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </td>
              <td className="px-4 py-3 font-mono text-sm font-semibold text-[#059669]">
                ${(row.wonRevenue / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </td>
              <td className="px-4 py-3">
                <span
                  className={[
                    'font-mono text-[11px] px-2 py-0.5 rounded-full border',
                    row.conversionRate > 70
                      ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
                      : row.conversionRate >= 50
                        ? 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]'
                        : 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
                  ].join(' ')}
                >
                  {row.conversionRate.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Multi-source trend chart ─────────────────────────────────────────────────

interface MultiSourceChartProps {
  data: { date: string; [source: string]: number | string }[]
  sources: string[]
}

function MultiSourceChart({ data, sources }: MultiSourceChartProps) {
  function fmtDate(v: string) {
    try { return format(parseISO(v), 'MMM d') } catch { return v }
  }

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {sources.map(s => {
              const id = `grad-${s.replace(/[^a-z0-9]/gi, '')}`
              const color = getSourceColor(s)
              return (
                <linearGradient key={s} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              )
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis
            dataKey="date"
            tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#94A3B8' }}
            tickFormatter={fmtDate}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              fontSize: 11,
              fontFamily: 'monospace',
            }}
            labelFormatter={(v: unknown) => fmtDate(String(v))}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'monospace', paddingTop: 8 }}
          />
          {sources.map(s => {
            const color = getSourceColor(s)
            const id = `grad-${s.replace(/[^a-z0-9]/gi, '')}`
            return (
              <Area
                key={s}
                type="monotone"
                dataKey={s}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${id})`}
                dot={false}
                activeDot={{ r: 3, fill: color }}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingReportsPage() {
  const [filters, setFilters] = useState<ReportingFilters>({
    dateRange: defaultDateRange,
  })
  const [data, setData]               = useState<MarketingPerformanceData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [refreshing, setRefreshing]   = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        preset: filters.dateRange.preset,
        from: filters.dateRange.from,
        to: filters.dateRange.to,
        ...(filters.source   && { source:   filters.source }),
        ...(filters.campaign && { campaign: filters.campaign }),
      })
      const res = await fetch(`/api/reports/marketing-performance?${params}`)
      const json: ReportingApiResponse<MarketingPerformanceData> = await res.json()
      if (!json.success || !json.data) throw new Error(json.error ?? 'Failed to load data')
      setData(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reporting data')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void fetchData() }, [fetchData])

  function handleDateChange(dateRange: ReportingFilters['dateRange']) {
    setFilters(prev => ({ ...prev, dateRange }))
  }

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetch('/api/reports/refresh', { method: 'POST' })
    } catch {
      // Non-fatal — still re-fetch
    }
    await fetchData()
    setRefreshing(false)
  }

  const trendSources = data?.trends.leadsBySource.length
    ? Object.keys(data.trends.leadsBySource[0]).filter(k => k !== 'date')
    : []

  function DataSourceBadge() {
    if (!data) return null
    if (data.dataSource === 'live') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
          LIVE · GHL
        </span>
      )
    }
    if (data.dataSource === 'cached') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
          CACHED · {(data as { cacheAge?: number }).cacheAge ?? 0}s
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#FFFBEB] border border-[#FCD34D] text-[#92400E]">
        ⚠ DEMO DATA
      </span>
    )
  }

  function DataSourceStatus() {
    if (!data) return null
    if (data.dataSource === 'live')   return <span className="text-[11px] font-mono text-[#059669]">Live · just now</span>
    if (data.dataSource === 'cached') return <span className="text-[11px] font-mono text-[#94A3B8]">Cached · {(data as { cacheAge?: number }).cacheAge ?? 0}s ago</span>
    return <span className="text-[11px] font-mono text-[#F59E0B]">Demo data · connect GHL to see live</span>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Reports', href: '/dashboard/reports' }, { label: 'Marketing Performance' }]} className="mb-2" />
          <h2 className="font-display text-[26px] font-bold text-slate-900 leading-tight">Marketing Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Source attribution and campaign ROI</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <DataSourceStatus />
          <DataSourceBadge />
          {data && (
            <span className="font-mono text-[11px] text-[#94A3B8]">
              {filters.dateRange.from} – {filters.dateRange.to}
            </span>
          )}
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing || loading}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5',
              'text-[12px] font-medium rounded-lg',
              'border border-[#E2E8F0] bg-white',
              'text-[#64748B] hover:text-[#0F172A]',
              'hover:border-[#CBD5E1] transition-all',
              (refreshing || loading) ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <ReportingTabs />

      {/* Filters */}
      <DateRangeFilter value={filters.dateRange} onChange={handleDateChange} loading={loading} />

      {/* Error */}
      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Loading */}
      {loading && !error && <LoadingSkeleton variant="full" />}

      {/* Content */}
      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Row 1 — Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              label="Total Leads"
              value={data.summary.totalLeads}
              accent="blue"
              icon={<Users className="w-4 h-4" />}
            />
            <MetricCard
              label="Total Bookings"
              value={data.summary.totalBookings}
              accent="cyan"
              icon={<Calendar className="w-4 h-4" />}
            />
            <MetricCard
              label="Pipeline Value"
              value={data.summary.totalPipelineValue}
              format="currency"
              accent="blue"
              icon={<Target className="w-4 h-4" />}
            />
            <MetricCard
              label="Won Revenue"
              value={data.summary.totalWonRevenue}
              format="currency"
              accent="purple"
              icon={<DollarSign className="w-4 h-4" />}
            />
            <MetricCard
              label="Lead → Appt Rate"
              value={data.summary.leadToApptRate}
              format="percent"
              accent="emerald"
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <MetricCard
              label="Appt → Won Rate"
              value={data.summary.apptToWonRate}
              format="percent"
              accent="emerald"
              icon={<BarChart2 className="w-4 h-4" />}
            />
          </div>

          {/* Row 2 — Source + Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] block mb-4">
                Leads by Source
              </span>
              <SourceBreakdown data={data.bySource} metric="leads" />
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] block mb-4">
                Conversion Funnel
              </span>
              <ConversionFunnel stages={data.conversionFunnel} />
            </div>
          </div>

          {/* Row 3 — Campaign table */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8]">
                Campaign Performance
              </span>
            </div>
            <CampaignTable rows={data.byCampaign} />
          </div>

          {/* Row 4 — Lead trend by source */}
          {trendSources.length > 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] block mb-4">
                Lead Trend by Source (Last 14 Days)
              </span>
              <MultiSourceChart data={data.trends.leadsBySource} sources={trendSources} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
