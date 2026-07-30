'use client'

import { Pencil } from 'lucide-react'
import type { ConversionData } from '@/lib/decomposition/types'

interface Props {
  data: ConversionData
}

function progressColor(fact: number, target: number) {
  if (fact >= target)              return '#15803d'
  if (fact >= target * 0.85)      return '#b45309'
  return '#e11d1d'
}

export default function ConversionCard({ data }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Реальная конверсия */}
      <div className="rounded-2xl p-5 shadow-sm border" style={{ backgroundColor: '#fff', borderColor: '#ebebee' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: '#1b1517' }}>Реальная конверсия</p>
        <div className="space-y-4">
          {data.rows.map(row => {
            const color = progressColor(row.fact, row.target)
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: '#1b1517' }}>{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: '#7d7174' }}>
                      план <span className="font-semibold" style={{ color: '#1b1517' }}>{row.target}%</span>
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ backgroundColor: color + '18', color }}>
                      {row.fact}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#fdfbfb' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(row.fact, 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Ориентиры конверсии */}
      <div className="rounded-2xl p-5 shadow-sm border" style={{ backgroundColor: '#fff', borderColor: '#ebebee' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold" style={{ color: '#1b1517' }}>Ориентиры конверсии</p>
          <button className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg" style={{ color: '#e11d1d', backgroundColor: '#fdfbfb' }}>
            <Pencil className="w-3 h-3" /> Изменить
          </button>
        </div>
        <div className="space-y-3">
          {data.rows.map(row => {
            const color = row.ok ? '#15803d' : '#e11d1d'
            return (
              <div key={row.label} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor: row.ok ? '#f0fdf4' : '#fef2f2' }}>
                <span className="text-[11px] font-medium flex-1" style={{ color: '#1b1517' }}>{row.label}</span>
                <span className="text-[11px]" style={{ color: '#7d7174' }}>факт</span>
                <span className="text-xs font-bold" style={{ color }}>{row.fact}%</span>
                <span className="text-[11px]" style={{ color: '#7d7174' }}>цель</span>
                <span className="text-xs font-semibold" style={{ color: '#1b1517' }}>{row.target}%</span>
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
