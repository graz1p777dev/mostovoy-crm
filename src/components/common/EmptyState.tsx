import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Пустое состояние. В системе оно встречается чаще любого другого блока —
 * пока не накопились данные, это и есть лицо продукта. Поэтому оно
 * оформлено, а не «сломано»: рамка-плашка с красной планкой снизу
 * (тот же фирменный «пролёт», что и в шапках), затем указание, что тут
 * будет, и подсказка, что для этого сделать.
 *
 * Тон текста: не извиняемся и не пишем «ошибка». Пустой экран — приглашение
 * к действию, поэтому title называет, чего нет, а hint говорит, что дальше.
 */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  size = 'md',
  className = '',
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}) {
  const compact = size === 'sm'

  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-xl ${className}`}
      style={{
        padding: compact ? '18px 20px' : '30px 24px',
        background: '#fdfbfb',
        border: '1px dashed #ddd3d3',
      }}
    >
      {Icon && (
        <span
          className="relative flex items-center justify-center overflow-hidden"
          style={{
            width: compact ? 30 : 38,
            height: compact ? 30 : 38,
            borderRadius: 9,
            background: '#ffffff',
            border: '1px solid #ece5e5',
            marginBottom: compact ? 9 : 12,
          }}
          aria-hidden
        >
          <Icon style={{ width: compact ? 14 : 17, height: compact ? 14 : 17, color: '#a19698' }} />
          {/* Красная планка — тот же приём, что у .span-rule в шапках */}
          <span
            style={{
              position: 'absolute',
              left: 7,
              right: 7,
              bottom: 0,
              height: 2,
              borderRadius: '2px 2px 0 0',
              background: 'linear-gradient(90deg, #e11d1d, #ff5c68)',
            }}
          />
        </span>
      )}

      <p style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 500, color: '#574d4f' }}>
        {title}
      </p>

      {hint && (
        <p style={{ fontSize: 12, color: '#7d7174', marginTop: 3, maxWidth: 280, lineHeight: 1.45 }}>
          {hint}
        </p>
      )}

      {action && <div style={{ marginTop: compact ? 10 : 14 }}>{action}</div>}
    </div>
  )
}
