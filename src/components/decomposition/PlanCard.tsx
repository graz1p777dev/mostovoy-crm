'use client'

import { Pencil, Calendar, Clock, CheckCircle2, TrendingUp, Users } from 'lucide-react'
import type { PlanData } from '@/lib/decomposition/types'

function fmtDate(y: number, m: number, d: number) {
  return `${String(d).padStart(2,'0')}.${String(m+1).padStart(2,'0')}.${y}`
}

interface Props {
  data: PlanData
  view: 'company' | 'employee'
}

export default function PlanCard({ data, view }: Props) {
  if (!data) return null
  const { name, period } = data
  const { year, month, daysInMonth, workDays, daysPassed, progressPct, status } = period

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line-soft)' }}>
      {/* Шапка */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, var(--brand) 0%, var(--orange-base) 100%)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            {view === 'company' ? <TrendingUp className="w-5 h-5 text-white" /> : <Users className="w-5 h-5 text-white" />}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {status === 'active' && (
                <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.2)', color: 'var(--ok-soft-ink)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Идёт
                </span>
              )}
              {status === 'done' && (
                <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  <CheckCircle2 className="w-3 h-3" /> Завершён
                </span>
              )}
              {status === 'future' && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  Будущий
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
        >
          <Pencil className="w-3.5 h-3.5" /> Редактировать
        </button>
      </div>

      {/* Тело */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--ink-3)' }}><Calendar className="w-3 h-3" /> Начало</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{fmtDate(year, month, 1)}</p>
          </div>
          <div>
            <p className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--ink-3)' }}><Calendar className="w-3 h-3" /> Конец</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{fmtDate(year, month, daysInMonth)}</p>
          </div>
          <div>
            <p className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--ink-3)' }}><Clock className="w-3 h-3" /> Рабочих дней</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{workDays}</p>
          </div>
          <div>
            <p className="text-[11px] mb-1" style={{ color: 'var(--ink-3)' }}>Прошло дней</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{daysPassed} / {daysInMonth}</p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Прогресс периода</p>
            <p className="text-[11px] font-bold" style={{ color: 'var(--brand)' }}>{progressPct}%</p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--paper-2)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--brand), var(--ok-base-3))' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
