'use client'

import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react'

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

interface Props {
  year:  number
  month: number
  onPrev: () => void
  onNext: () => void
}

export default function MarketingHeader({ year, month, onPrev, onNext }: Props) {
  return (
    <div
      className="sticky top-0 z-20 px-5 py-3 flex items-center justify-between border-b"
      style={{ backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderColor: '#ebebee' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 flex items-center justify-center"
          style={{ borderRadius: 12, backgroundColor: 'rgba(225,29,29,0.10)' }}
        >
          <Megaphone className="w-4 h-4" style={{ color: '#e11d1d' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: '#1b1517' }}>Маркетинг</p>
          <p className="text-[11px]" style={{ color: '#7d7174' }}>{RU_MONTHS[month]} {year}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: '#ebebee', color: '#1b1517' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold px-3" style={{ color: '#1b1517', minWidth: 120, textAlign: 'center' }}>
          {RU_MONTHS[month]} {year}
        </span>
        <button
          onClick={onNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: '#ebebee', color: '#1b1517' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
