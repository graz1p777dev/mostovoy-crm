'use client'

import { useMemo, useState } from 'react'
import { Search, ShoppingCart } from 'lucide-react'
import { formatMoney } from '@/lib/formatters'
import type { Deal, DealEmployee, DealStage, DealViewer } from '@/types'
import DealModal from '@/components/deals/DealModal'

interface Props {
  initialOrders: Deal[]
  stages: DealStage[]
  employees: DealEmployee[]
  me: DealViewer
}

const ORDER_TYPE_LABEL: Record<Deal['order_type'], string> = {
  standard: 'Обычный заказ',
  installment: 'Рассрочка',
  trade_in: 'Trade-in',
}

function orderTypeLabel(order: Deal): string {
  if (order.note?.includes('Тип: Trade-in')) return ORDER_TYPE_LABEL.trade_in
  if (order.note?.includes('Тип: Рассрочка')) return ORDER_TYPE_LABEL.installment
  return ORDER_TYPE_LABEL.standard
}

export default function OrdersList({ initialOrders, stages, employees, me }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [selected, setSelected] = useState<Deal | null>(null)
  const [search, setSearch] = useState('')
  const stageMap = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages])
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return orders
    return orders.filter((order) =>
      `${order.title} ${order.customer_name ?? ''} ${order.customer_phone ?? ''} ${order.customer_username ?? ''}`
        .toLowerCase()
        .includes(query)
    )
  }, [orders, search])

  return (
    <div className="min-h-[calc(100vh-52px)] px-6 py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Продажи</p>
          <h1 className="block-title">Заказы</h1>
          <span className="span-rule" aria-hidden />
          <p className="mt-1.5 text-[13px] text-gray-400">
            Заказы, которые оформил бот или менеджер · {orders.length}
          </p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Товар, клиент, телефон…"
            className="h-10 w-64 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-red-300"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-gray-100 bg-white text-center shadow-sm">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
            <ShoppingCart size={22} />
          </span>
          <h2 className="text-base font-bold text-gray-900">Заказов пока нет</h2>
          <p className="mt-1 max-w-sm text-sm text-gray-400">
            Когда клиент подтвердит покупку, заказ появится здесь автоматически.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((order) => {
            const stage = stageMap.get(order.stage_id)
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelected(order)}
                className="group rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">
                      {orderTypeLabel(order)}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-gray-950">{order.title}</h2>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: `${stage?.color ?? '#e11d1d'}18`, color: stage?.color ?? '#e11d1d' }}
                  >
                    {stage?.name ?? 'Без этапа'}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-500">
                  <p>{order.customer_name || order.customer_username || 'Клиент из Telegram'}</p>
                  {order.customer_phone && <p>{order.customer_phone}</p>}
                </div>
                <div className="mt-5 flex items-end justify-between border-t border-gray-100 pt-4">
                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString('ru-RU')}
                  </span>
                  <strong className="text-base text-gray-950">
                    {order.amount === null ? 'Сумма уточняется' : formatMoney(Number(order.amount), order.currency)}
                  </strong>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <DealModal
          deal={selected}
          isNew={false}
          defaultStageId={selected.stage_id}
          stages={stages}
          employees={employees}
          me={me}
          onClose={() => setSelected(null)}
          onSaved={() => window.location.reload()}
        />
      )}
    </div>
  )
}
