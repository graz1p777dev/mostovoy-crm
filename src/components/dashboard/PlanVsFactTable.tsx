"use client"

import { Table2 } from 'lucide-react'
import type { PlanVsFactRow } from '@/types'
import { formatMoney, formatNumber } from '@/lib/formatters'
import { getKpiColor } from '@/lib/constants'
import EmptyState from '@/components/common/EmptyState'

interface PlanVsFactTableProps {
  rows: PlanVsFactRow[]
}

function PlanFactCell({ plan, fact }: { plan: number; fact: number }) {
  return (
    <td
      className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"
      style={{ fontSize: 12, color: 'var(--ink-deep)' }}
    >
      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{formatNumber(fact)}</span>
      <span style={{ color: 'var(--ink-3)', margin: '0 3px' }}>/</span>
      <span style={{ color: 'var(--ink-3)' }}>{formatNumber(plan)}</span>
    </td>
  )
}

function KpiBadge({ pct }: { pct: number }) {
  const color = getKpiColor(pct)
  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-semibold tabular-nums"
      style={{
        fontSize: 11,
        color,
        backgroundColor: `color-mix(in srgb, ${color} 9.412%, transparent)`,
        padding: '2px 7px',
        minWidth: 44,
      }}
    >
      {pct.toFixed(1)}%
    </span>
  )
}

export default function PlanVsFactTable({ rows }: PlanVsFactTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Table2}
        title="За этот месяц данных нет"
        hint="План и факт появятся, когда пройдут первые продажи."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl glass">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--paper)' }}>
            {['Сотрудник', 'ФВ факт/план', 'Продажи факт/план', 'Выручка', 'KPI%'].map(col => (
              <th
                key={col}
                className={`px-3 py-2 text-left whitespace-nowrap ${col !== 'Сотрудник' ? 'text-right' : ''}`}
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.employee_id}
              style={{
                borderBottom: i < rows.length - 1 ? '1px solid var(--paper-2)' : 'none',
              }}
              className="transition-colors"
              onMouseEnter={e => {
                (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'rgba(28,20,22,0.05)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ''
              }}
            >
              <td className="px-3 py-2.5" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                {row.employee_name}
              </td>
              <PlanFactCell plan={row.plan_fv} fact={row.fact_fv} />
              <PlanFactCell plan={row.plan_sales} fact={row.fact_sales} />
              <td
                className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium"
                style={{ fontSize: 12, color: 'var(--ink)' }}
              >
                {row.revenue > 0 ? formatMoney(row.revenue) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right">
                <KpiBadge pct={row.kpi_pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
