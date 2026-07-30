'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FinanceHeaderIcon } from './FinanceDesignerIcons'

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

interface Props {
  year: number; month: number
  onPrev: () => void; onNext: () => void
}

export default function FinanceHeader({ year, month, onPrev, onNext }: Props) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b" style={{ backgroundColor: '#fff', borderColor: '#ebebee' }}>
      <div className="flex items-center gap-3">
        <FinanceHeaderIcon />
        <div>
          <p className="text-sm font-bold" style={{ color: '#1b1517' }}>Финансы</p>
          <p className="text-[11px]" style={{ color: '#7d7174' }}>{RU_MONTHS[month]} {year}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onPrev} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: '#e11d1d' }}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold px-3" style={{ color: '#1b1517' }}>
          {RU_MONTHS[month]} {year}
        </span>
        <button onClick={onNext} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: '#e11d1d' }}>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
