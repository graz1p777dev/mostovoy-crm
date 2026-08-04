'use client'

import { Clock, GripVertical, Phone } from 'lucide-react'
import { formatMoney, getInitials } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Deal, DealEmployee } from '@/types'
import { DEAL_SOURCE, formatStageAge } from './deal-config'

interface Props {
  deal: Deal
  employees: Map<string, DealEmployee>
  stageColor: string
  selected: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}

function Avatar({ emp }: { emp: DealEmployee }) {
  if (emp.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={emp.avatar_url}
        alt={emp.name}
        title={emp.name}
        className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
      />
    )
  }
  return (
    <div
      title={emp.name}
      className="flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-white brand-gradient"
      style={{ fontSize: 10, fontWeight: 600 }}
    >
      {getInitials(emp.name)}
    </div>
  )
}

export default function DealCard({
  deal,
  employees,
  stageColor,
  selected,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: Props) {
  const source = DEAL_SOURCE[deal.source]
  const SourceIcon = source.icon
  const responsible = deal.responsible_employee_id
    ? employees.get(deal.responsible_employee_id)
    : undefined
  const customer = deal.customer_name || deal.customer_username || deal.customer_phone
  const orderType = deal.order_type === 'installment' ? 'Рассрочка' : deal.order_type === 'trade_in' ? 'Trade-in' : null

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', deal.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer select-none rounded-xl border border-gray-100 bg-white p-3 shadow-sm',
        'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-200',
        dragging && 'opacity-40 rotate-[1.5deg]',
        selected && 'border-[#e51c23] bg-[#fff5f5] ring-2 ring-[#e51c23]/20'
      )}
      style={{ borderLeft: `3px solid ${selected ? '#e51c23' : stageColor}` }}
    >
      <div
        className="absolute right-1.5 top-2.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <GripVertical size={14} />
      </div>

      <p className="pr-4 text-[13px] font-semibold leading-snug text-gray-800 line-clamp-2">
        {deal.title}
      </p>

      {customer && customer !== deal.title && (
        <p className="mt-1 text-[12px] leading-snug text-gray-400 line-clamp-1">{customer}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ color: source.color, background: source.bg }}
        >
          <SourceIcon size={11} />
          {source.label}
        </span>

        {orderType && (
          <span className="inline-flex items-center rounded-md bg-[#fff0f1] px-1.5 py-0.5 text-[10px] font-semibold text-[#e51c23]">
            {orderType}
          </span>
        )}

        {deal.amount !== null && (
          <span className="inline-flex items-center rounded-md bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-ink)]">
            {formatMoney(deal.amount, deal.currency)}
          </span>
        )}

        {deal.customer_phone && (
          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            <Phone size={10} />
            {deal.customer_phone}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 text-[10px] text-gray-400"
          title="Время в текущем этапе"
        >
          <Clock size={12} />
          {formatStageAge(deal.stage_changed_at)}
        </span>
        {responsible ? (
          <Avatar emp={responsible} />
        ) : (
          <span className="text-[10px] text-gray-300">без ответственного</span>
        )}
      </div>
    </div>
  )
}
