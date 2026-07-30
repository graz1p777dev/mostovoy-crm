'use client'

import type { KpiItem } from '@/lib/decomposition/types'
import { MetricIconBadge } from '@/components/common/MetricIconBadge'

function fmtMoney(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' K'
  return n.toLocaleString('ru')
}

interface Props {
  items: KpiItem[]
}

export default function QuickKpiCard({ items }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map(kpi => (
        <div
          key={kpi.label}
          className="rounded-2xl px-4 py-4 shadow-sm border flex flex-col justify-between"
          style={{ backgroundColor: '#fff', borderColor: '#ebebee', minHeight: 100 }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] leading-tight font-medium" style={{ color: '#7d7174' }}>{kpi.label}</p>
            <MetricIconBadge name={`${kpi.label} ${kpi.icon}`} />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none" style={{ color: kpi.color }}>
              {fmtMoney(kpi.value)}
            </p>
            <p className="text-[11px] mt-1" style={{ color: '#7d7174' }}>KGS · {kpi.sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
