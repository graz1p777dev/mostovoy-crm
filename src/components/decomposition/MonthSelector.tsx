'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

interface Props {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
}

export default function MonthSelector({ year, month, onPrev, onNext }: Props) {
  const label = `${RU_MONTHS[month]} ${year}`
  return (
    <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={{ backgroundColor: 'var(--paper-2)' }}>
      <button
        onClick={onPrev}
        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white"
        style={{ color: 'var(--brand)' }}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold min-w-36 text-center px-2" style={{ color: 'var(--ink)' }}>
        {label}
      </span>
      <button
        onClick={onNext}
        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white"
        style={{ color: 'var(--brand)' }}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
