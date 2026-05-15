'use client'

import type { TechPerformanceRow } from '@/types/reporting'

interface Props {
  rows: TechPerformanceRow[]
  loading?: boolean
}

function RatePill({ value }: { value: number }) {
  const cls =
    value >= 80
      ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
      : value >= 50
        ? 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]'
        : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
  return (
    <span className={`inline-block font-mono text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {value.toFixed(0)}%
    </span>
  )
}

const COLS = ['Technician', 'Assigned', 'Completed', 'In Progress', 'Est. Needed', 'Completion %', 'Avg Days']

export function TechPerformanceTable({ rows, loading = false }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px]">
        <thead>
          <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            {COLS.map(col => (
              <th
                key={col}
                className="text-left font-mono text-[10px] tracking-[0.10em] uppercase text-[#94A3B8] px-4 py-2.5 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <tr key={i} className="border-b border-[#F1F5F9] last:border-0">
                  {COLS.map(col => (
                    <td key={col} className="px-4 py-3">
                      <div className="h-3 bg-[#E2E8F0] rounded animate-pulse" style={{ width: col === 'Technician' ? 120 : 40 }} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map(row => (
                <tr
                  key={row.userId}
                  className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F4F7FB] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center font-mono text-xs text-[#2563EB] flex-shrink-0">
                        {row.avatarInitials}
                      </div>
                      <span className="text-sm font-medium text-[#0F172A] whitespace-nowrap">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-[#475569]">{row.totalAssigned}</td>
                  <td className="px-4 py-3 font-mono text-sm text-[#059669] font-medium">{row.completed}</td>
                  <td className="px-4 py-3 font-mono text-sm text-[#475569]">{row.inProgress}</td>
                  <td className="px-4 py-3 font-mono text-sm text-[#475569]">{row.estimateNeeded}</td>
                  <td className="px-4 py-3"><RatePill value={row.completionRate} /></td>
                  <td className="px-4 py-3 font-mono text-sm text-[#475569]">
                    {row.avgDaysToComplete > 0 ? `${row.avgDaysToComplete}d` : '—'}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

export default TechPerformanceTable
