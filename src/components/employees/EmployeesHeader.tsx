'use client'

import { Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTHS } from './employees-utils'

interface Props {
  year:    number
  month:   number
  onPrev:  () => void
  onNext:  () => void
}

export default function EmployeesHeader({ year, month, onPrev, onNext }: Props) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4"
      style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-9 h-9"
          style={{ borderRadius: 14, backgroundColor: 'rgba(225,29,29,0.10)' }}
        >
          <Users size={18} color="var(--brand)" />
        </div>
        <div>
          <div className="font-semibold text-base leading-tight" style={{ color: 'var(--ink)' }}>Сотрудники</div>
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>KPI и зарплата за период</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="flex items-center justify-center w-8 h-8 transition-colors"
          style={{ borderRadius: 12, backgroundColor: 'var(--brand)' }}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft size={16} color="var(--on-brand)" />
        </button>
        <div className="font-medium text-sm min-w-[120px] text-center" style={{ color: 'var(--ink)' }}>
          {MONTHS[month]} {year}
        </div>
        <button
          onClick={onNext}
          className="flex items-center justify-center w-8 h-8 transition-colors"
          style={{ borderRadius: 12, backgroundColor: 'var(--brand)' }}
          aria-label="Следующий месяц"
        >
          <ChevronRight size={16} color="var(--on-brand)" />
        </button>
      </div>
    </div>
  )
}
