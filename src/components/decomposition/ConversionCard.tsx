'use client'

import { Pencil } from 'lucide-react'
import type { ConversionData } from '@/lib/decomposition/types'

interface Props {
  data: ConversionData
}

function progressColor(fact: number, target: number) {
  if (fact >= target)              return 'var(--ok)'
  if (fact >= target * 0.85)      return 'var(--warn)'
  return 'var(--brand)'
}

export default function ConversionCard({ data }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Реальная конверсия */}
      <div className="rounded-2xl p-5 shadow-sm border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line-soft)' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--ink)' }}>Реальная конверсия</p>
        <div className="space-y-4">
          {data.rows.map(row => {
            const color = progressColor(row.fact, row.target)
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                      план <span className="font-semibold" style={{ color: 'var(--ink)' }}>{row.target}%</span>
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${color} 9.412%, transparent)`, color }}>
                      {row.fact}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--paper-2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(row.fact, 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Ориентиры конверсии */}
      <div className="rounded-2xl p-5 shadow-sm border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line-soft)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Ориентиры конверсии</p>
          <button className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg" style={{ color: 'var(--brand)', backgroundColor: 'var(--paper-2)' }}>
            <Pencil className="w-3 h-3" /> Изменить
          </button>
        </div>
        <div className="space-y-3">
          {data.rows.map(row => {
            const color = row.ok ? 'var(--ok)' : 'var(--brand)'
            return (
              <div key={row.label} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor: row.ok ? 'var(--ok-tint)' : 'var(--bad-tint)' }}>
                <span className="text-[11px] font-medium flex-1" style={{ color: 'var(--ink)' }}>{row.label}</span>
                <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>факт</span>
                <span className="text-xs font-bold" style={{ color }}>{row.fact}%</span>
                <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>цель</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{row.target}%</span>
                <span className="text-[11px] font-bold w-10 text-right" style={{ color }}>
                  {row.delta >= 0 ? '+' : ''}{row.delta}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
