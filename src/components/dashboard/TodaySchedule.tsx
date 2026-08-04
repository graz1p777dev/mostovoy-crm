import { CalendarClock } from 'lucide-react'
import type { ScheduleItem } from '@/lib/dashboard-queries'
import { STATUS_AFTER_FV_MAP, ACTUAL_STATUS_MAP, CONSULTATION_STATUS_MAP } from '@/lib/constants'
import { formatTime } from '@/lib/formatters'
import EmptyState from '@/components/common/EmptyState'

interface TodayScheduleProps {
  items: ScheduleItem[]
  currentTime: string
}

function getStatusBadge(item: ScheduleItem) {
  const s = item.status_after_fv ?? item.actual_status ?? item.status
  if (!s) return null

  let info: { label: string; color: string; bg: string } | undefined

  if (item.status_after_fv && item.status_after_fv in STATUS_AFTER_FV_MAP) {
    info = STATUS_AFTER_FV_MAP[item.status_after_fv as keyof typeof STATUS_AFTER_FV_MAP]
  } else if (item.actual_status && item.actual_status in ACTUAL_STATUS_MAP) {
    info = ACTUAL_STATUS_MAP[item.actual_status as keyof typeof ACTUAL_STATUS_MAP]
  } else if (item.status && item.status in CONSULTATION_STATUS_MAP) {
    info = CONSULTATION_STATUS_MAP[item.status as keyof typeof CONSULTATION_STATUS_MAP]
  }

  if (!info) return null

  return (
    <span
      className="rounded-md px-1.5 py-0.5 font-medium"
      style={{ fontSize: 10, color: info.color, backgroundColor: info.bg }}
    >
      {info.label}
    </span>
  )
}

export default function TodaySchedule({ items, currentTime }: TodayScheduleProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={CalendarClock}
        title="На сегодня записей нет"
        hint="Встречи появятся здесь по мере записи клиентов."
      />
    )
  }

  // Находим индекс первого будущего события для разделителя «Сейчас»
  const nowIdx = items.findIndex(item => item.time >= currentTime && !item.isPast)

  return (
    <div className="rounded-xl overflow-hidden glass">
      {items.map((item, i) => (
        <div key={item.id}>
          {/* Разделитель «Сейчас» */}
          {i === nowIdx && (
            <div
              className="flex items-center gap-2 px-4 py-1"
              style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}
            >
              <div
                className="rounded-full"
                style={{ width: 6, height: 6, backgroundColor: 'var(--ok-base)' }}
              />
              <span style={{ fontSize: 10, color: 'var(--ok)', fontWeight: 600, letterSpacing: '0.04em' }}>
                СЕЙЧАС
              </span>
              <div className="flex-1" style={{ height: 1, backgroundColor: 'var(--ok-border-2)' }} />
            </div>
          )}

          <div
            className="flex items-center gap-3 px-4 py-2.5"
            style={{
              borderBottom: i < items.length - 1 ? '1px solid rgba(28,20,22,0.06)' : 'none',
              opacity: item.isPast ? 0.45 : 1,
            }}
          >
            {/* Время */}
            <span
              className="flex-shrink-0 tabular-nums font-medium"
              style={{ fontSize: 13, color: 'var(--ink)', width: 38 }}
            >
              {formatTime(item.time)}
            </span>

            {/* Линия */}
            <div
              className="flex-shrink-0 self-stretch flex flex-col items-center"
              style={{ width: 2 }}
            >
              <div
                className="flex-1 rounded-full"
                style={{
                  width: 2,
                  backgroundColor: item.isPast ? 'var(--line)' : 'var(--accent-from)',
                  minHeight: 20,
                }}
              />
            </div>

            {/* Данные */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="font-medium truncate"
                  style={{ fontSize: 13, color: 'var(--ink)' }}
                >
                  {item.client_name}
                </span>
                {item.is_nv && (
                  <span
                    className="rounded px-1 font-medium"
                    style={{ fontSize: 9, color: 'var(--brand-ink)', backgroundColor: 'var(--paper-2)' }}
                  >
                    НВ
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {getStatusBadge(item)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
