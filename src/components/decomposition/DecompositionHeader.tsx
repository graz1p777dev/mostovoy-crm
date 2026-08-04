'use client'

import MonthSelector from './MonthSelector'

interface Props {
  year: number
  month: number
  view: 'company' | 'employee'
  onPrev: () => void
  onNext: () => void
  onViewChange: (v: 'company' | 'employee') => void
}

export default function DecompositionHeader({ year, month, view, onPrev, onNext, onViewChange }: Props) {
  const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
  return (
    <div
      className="sticky top-0 z-20 px-6 py-3.5 flex items-center justify-between gap-4 border-b"
      style={{ backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderColor: 'var(--line-soft)' }}
    >
      <div>
        <h1 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Декомпозиция</h1>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{RU_MONTHS[month]} {year}</p>
      </div>
      <div className="flex items-center gap-3">
        <MonthSelector year={year} month={month} onPrev={onPrev} onNext={onNext} />
        <select
          value={view}
          onChange={e => onViewChange(e.target.value as 'company' | 'employee')}
          className="h-9 px-3 rounded-xl text-sm font-medium focus:outline-none border"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line-soft)', color: 'var(--ink)' }}
        >
          <option value="company">Общая декомпозиция</option>
          <option value="employee">Декомпозиция сотрудника</option>
        </select>
      </div>
    </div>
  )
}
