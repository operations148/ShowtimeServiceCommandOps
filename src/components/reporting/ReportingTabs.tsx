'use client'

import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  {
    id: 'owner',
    label: 'Owner Performance',
    description: 'Revenue, leads, and conversion metrics',
    href: '/dashboard/reports/owner',
  },
  {
    id: 'va',
    label: 'Tech Performance',
    description: 'Technician job completion and workload',
    href: '/dashboard/reports/va',
  },
  {
    id: 'marketing',
    label: 'Marketing Performance',
    description: 'Source attribution and campaign ROI',
    href: '/dashboard/reports/marketing',
  },
] as const

export function ReportingTabs() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-1 flex gap-1 shadow-sm">
      {TABS.map(tab => {
        const active = pathname.includes(tab.id)
        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            className={[
              'flex-1 py-2.5 px-4 rounded-lg text-[14px] font-medium transition-all duration-150 cursor-pointer text-center',
              active
                ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] shadow-sm'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F4F7FB] border border-transparent',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default ReportingTabs
