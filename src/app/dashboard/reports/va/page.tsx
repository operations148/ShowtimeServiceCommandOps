'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, CheckCircle, Clock, ListChecks, TrendingUp } from 'lucide-react'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import {
  ReportingTabs, DateRangeFilter, MetricCard,
  TrendChart, EmptyState, LoadingSkeleton, ErrorState,
} from '@/components/reporting'
import { defaultDateRange } from '@/config/reporting-mock-data'
import type {
  ReportingFilters, ReportingApiResponse, TechPerformanceData,
} from '@/types/reporting'
import { TechPerformanceTable } from '@/components/reporting/TechPerformanceTable'

export default function TechPerformancePage() {
  const router = useRouter()

  const [filters, setFilters] = useState<ReportingFilters>({
    dateRange: defaultDateRange,
  })
  const [data, setData] = useState<TechPerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        preset: filters.dateRange.preset,
        from: filters.dateRange.from,
        to: filters.dateRange.to,
      })
      const res = await fetch(`/api/reports/tech-performance?${params}`)
      const json: ReportingApiResponse<TechPerformanceData> = await res.json()
      if (!json.success || !json.data) throw new Error(json.error ?? 'Failed to load data')
      setData(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tech performance data')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void fetchData() }, [fetchData])

  function handleDateChange(dateRange: ReportingFilters['dateRange']) {
    setFilters(prev => ({ ...prev, dateRange }))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Reports', href: '/dashboard/reports' }, { label: 'Tech Performance' }]} className="mb-2" />
          <h2 className="font-display text-[26px] font-bold text-slate-900 leading-tight">Tech Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Technician job completion and workload</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
          {data && (
            <span className="font-mono text-[11px] text-[#94A3B8]">
              {filters.dateRange.from} – {filters.dateRange.to}
            </span>
          )}
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
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Jobs Assigned"
              value={data.summary.totalAssigned}
              accent="blue"
              icon={<ListChecks className="w-4 h-4" />}
            />
            <MetricCard
              label="Jobs Completed"
              value={data.summary.totalCompleted}
              accent="emerald"
              icon={<CheckCircle className="w-4 h-4" />}
            />
            <MetricCard
              label="In Progress"
              value={data.summary.totalInProgress}
              accent="amber"
              icon={<Clock className="w-4 h-4" />}
            />
            <MetricCard
              label="Completion Rate"
              value={data.summary.avgCompletionRate}
              format="percent"
              accent="purple"
              icon={<TrendingUp className="w-4 h-4" />}
            />
          </div>

          {/* Trend charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] block mb-4">
                Jobs Completed Per Day
              </span>
              <TrendChart
                data={data.trends.completedJobs}
                color="#10B981"
                height={160}
                showGrid
                showAxis
              />
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] block mb-4">
                New Jobs Created Per Day
              </span>
              <TrendChart
                data={data.trends.newJobs}
                color="#3B82F6"
                height={160}
                showGrid
                showAxis
              />
            </div>
          </div>

          {/* Tech breakdown table */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8]">
                Technician Breakdown
              </span>
            </div>
            {data.team.length === 0 ? (
              <EmptyState
                title="No technician data yet"
                message="Add technicians and assign work orders to see performance here."
                icon="data"
                action={{
                  label: 'Add Technician',
                  onClick: () => router.push('/dashboard/technicians'),
                }}
              />
            ) : (
              <TechPerformanceTable rows={data.team} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
