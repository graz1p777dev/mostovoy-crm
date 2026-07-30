import { getKpiColor } from '@/lib/constants'

interface KpiCardProps {
  label: string
  value: string
  plan: string
  pct: number
  delta?: string
  deltaPositive?: boolean
  icon?: React.ReactNode
}

export default function KpiCard({
  label,
  value,
  plan,
  pct,
  delta,
  deltaPositive,
  icon,
}: KpiCardProps) {
  const barColor = getKpiColor(pct)
  const clampedPct = Math.min(pct, 100)

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 glass card-hover"
      style={{
        boxShadow: '0 8px 24px -12px rgba(28,20,22,0.10)',
      }}
    >
      {/* Заголовок */}
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
          {label}
        </span>
        {icon && (
          <span style={{ color: '#7d7174' }}>{icon}</span>
        )}
      </div>

      {/* Значение */}
      <div className="flex items-end justify-between gap-2">
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: 22, color: '#1b1517', lineHeight: 1 }}
        >
          {value}
        </span>
        {delta !== undefined && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: deltaPositive ? '#15803d' : '#c01818',
            }}
          >
            {deltaPositive ? '↑' : '↓'} {delta}
          </span>
        )}
      </div>

      {/* Прогресс-бар */}
      <div>
        <div
          className="overflow-hidden"
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: 'rgba(28,20,22,0.08)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${clampedPct}%`,
              backgroundColor: barColor,
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span style={{ fontSize: 11, color: '#7d7174' }}>
            План: {plan}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: 11, color: barColor }}
          >
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
