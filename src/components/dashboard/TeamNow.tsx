import type { TeamMemberStatus } from '@/types'
import { ATTENDANCE_STATUS_MAP, ROLE_LABELS } from '@/lib/constants'
import { getInitials, formatNumber } from '@/lib/formatters'
import { Users } from 'lucide-react'
import EmptyState from '@/components/common/EmptyState'

interface TeamNowProps {
  members: TeamMemberStatus[]
}

function AttendanceDot({ status }: { status: TeamMemberStatus['attendance_status'] }) {
  const info = status ? ATTENDANCE_STATUS_MAP[status] : null
  const dotClass = info?.dot ?? 'bg-gray-300'
  const title = info?.label ?? 'Нет данных'

  return (
    <div
      className={`rounded-full flex-shrink-0 ${dotClass}`}
      style={{ width: 8, height: 8 }}
      title={title}
    />
  )
}

export default function TeamNow({ members }: TeamNowProps) {
  if (members.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Users}
        title="Команда пока не заведена"
        hint="Добавьте сотрудников в разделе «Сотрудники»."
      />
    )
  }

  return (
    <div className="rounded-xl overflow-hidden glass">
      {members.map((member, i) => (
        <div
          key={member.id}
          className="flex items-center gap-3 px-4 py-2.5"
          style={{
            borderBottom: i < members.length - 1 ? '1px solid rgba(28,20,22,0.06)' : 'none',
          }}
        >
          {/* Аватар */}
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0 text-white font-semibold brand-gradient"
            style={{
              width: 30, height: 30,
              fontSize: 10,
            }}
          >
            {getInitials(member.name)}
          </div>

          {/* Имя и роль */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <AttendanceDot status={member.attendance_status} />
              <span
                className="font-medium truncate"
                style={{ fontSize: 13, color: '#1b1517' }}
              >
                {member.name}
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#7d7174' }}>
              {ROLE_LABELS[member.role as import('@/types').UserRole] ?? member.role}
            </p>
          </div>

          {/* Показатели дня */}
          <div className="flex-shrink-0 text-right">
            <p
              className="tabular-nums font-semibold"
              style={{ fontSize: 12, color: '#1b1517' }}
            >
              {formatNumber(member.fv_today)} ФВ
            </p>
            <p style={{ fontSize: 11, color: '#15803d' }}>
              {formatNumber(member.sales_today)} продаж
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
