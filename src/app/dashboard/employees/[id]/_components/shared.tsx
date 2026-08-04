// Мелкие презентационные примитивы досье. Держим в одном файле — по отдельности
// это 10–20 строк каждый, дробить на файлы смысла нет.

import type { ReactNode } from 'react'
import { formatMoney } from '@/lib/formatters'

// Все цвета досье идут через один объект — это единственная точка, где модуль
// касается палитры. Значения — токены дизайн-системы МОСТОВОГО из globals.css,
// а не хардкод: тема (в том числе тёмная) переключается без правок здесь.
export const BRAND = {
  text:      'var(--ink)',
  accent:    'var(--brand)',
  muted:     'var(--ink-3)',
  divider:   'var(--line)',
  surface:   'var(--surface-3)',
  bg:        'var(--surface-2)',
  card:      'var(--surface)',
} as const

/** Карточка-блок досье с заголовком. */
export function Panel({ title, icon, children, action }: {
  title: string
  icon?: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: BRAND.card, border: `1px solid ${BRAND.divider}` }}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon && <span style={{ color: BRAND.accent }}>{icon}</span>}
        <h2 className="font-semibold text-sm" style={{ color: BRAND.text }}>{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  )
}

/** Строка «иконка — подпись — значение» для блока контактов/реквизитов. */
export function InfoRow({ icon, label, value, hint }: {
  icon?: ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <div className="mt-0.5 shrink-0" style={{ color: BRAND.muted }}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs" style={{ color: BRAND.muted }}>{label}</div>
        <div className="text-sm break-words" style={{ color: BRAND.text }}>{value}</div>
        {hint && <div className="text-xs mt-0.5" style={{ color: BRAND.muted }}>{hint}</div>}
      </div>
    </div>
  )
}

/** Компактная плитка с числом — «Отработано», «Опозданий» и т.п. */
export function StatTile({ label, value, accent, sub }: {
  label: string
  value: string
  accent?: string
  sub?: string
}) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: BRAND.bg }}>
      <div className="text-xs mb-0.5" style={{ color: BRAND.muted }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: accent ?? BRAND.text }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: BRAND.muted }}>{sub}</div>}
    </div>
  )
}

/** План/факт с полосой прогресса. */
export function ProgressRow({ label, fact, plan, isMoney }: {
  label: string
  fact: number
  plan: number
  isMoney?: boolean
}) {
  const pct = plan > 0 ? Math.round((fact / plan) * 100) : 0
  const fmt = (v: number) => isMoney ? formatMoney(v) : String(v)
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span style={{ color: BRAND.muted }}>{label}</span>
        <span style={{ color: BRAND.text }}>
          <span className="font-medium tabular-nums">{fmt(fact)}</span>
          {plan > 0 && <span style={{ color: BRAND.muted }} className="tabular-nums"> / {fmt(plan)}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: BRAND.divider }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: BRAND.accent }} />
      </div>
    </div>
  )
}

/** Заглушка для пустых состояний — «нет данных за период». */
export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl px-4 py-8 text-center text-sm"
      style={{ border: '1px dashed var(--line-strong)', color: BRAND.muted }}
    >
      {children}
    </div>
  )
}

export function kpiColor(pct: number): string {
  if (pct >= 100) return 'var(--series-positive-text)'
  if (pct >= 80)  return 'var(--warn-strong)'
  return 'var(--brand-ink)'
}

export function kpiBg(pct: number): string {
  if (pct >= 100) return 'var(--ok-soft-alt)'
  if (pct >= 80)  return 'var(--warn-soft-alt)'
  return 'var(--brand-soft)'
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const p = s.slice(0, 10).split('-')
  if (p.length !== 3) return '—'
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
    .toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function fmtMonth(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

// Реэкспорт канонического форматтера (src/lib/formatters.ts) — второй источник
// правды по валюте здесь не нужен, чинится в одном месте разом.
export { formatMoney as fmtMoney }

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
