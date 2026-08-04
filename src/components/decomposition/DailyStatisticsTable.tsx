'use client'

import type { DailyStatRow } from '@/lib/decomposition/types'

const RU_DAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

function fmt(n: number, isMoney = false): string {
  if (n === 0) return ''
  if (isMoney) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    return (n / 1_000).toFixed(0) + 'K'
  }
  return String(n)
}

type ColKey = keyof Omit<DailyStatRow, 'day' | 'date' | 'isWeekend' | 'isFuture' | 'isToday'>

interface ColDef {
  key: ColKey
  short: string
  isMoney?: boolean
  group: 'lmai' | 'fv' | 'nv' | 'avg' | 'del'
}

const COLS: ColDef[] = [
  { key: 'appeals', short: 'Обр.',    group: 'lmai' },
  { key: 'leads',   short: 'Лиды',   group: 'lmai' },
  { key: 'nv',      short: 'НВ',     group: 'lmai' },
  { key: 'fv',      short: 'ФВ',     group: 'fv'   },
  { key: 'salesFV', short: 'Прод.ФВ',group: 'fv'   },
  { key: 'revFV',   short: 'Выр.ФВ', group: 'fv',  isMoney: true },
  { key: 'bezNV',   short: 'Без НВ', group: 'nv'   },
  { key: 'salesNV', short: 'Прод.НВ',group: 'nv'   },
  { key: 'revNV',   short: 'Выр.НВ', group: 'nv',  isMoney: true },
  { key: 'avgFV',   short: 'Ч.ФВ',   group: 'avg', isMoney: true },
  { key: 'avgNV',   short: 'Ч.НВ',   group: 'avg', isMoney: true },
  { key: 'delivery',short: 'Дост.',  group: 'del', isMoney: true },
]

const GROUP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  lmai: { label: 'LMAI / Обращения', bg: 'var(--paper-2)', text: 'var(--brand-ink)', border: 'var(--brand-soft-2)' },
  fv:   { label: 'Факт встречи',     bg: 'var(--ok-tint)', text: 'var(--ok-strong)', border: 'var(--ok-border)' },
  nv:   { label: 'Без НВ',          bg: 'var(--warn-tint)', text: 'var(--warn-strong)', border: 'var(--warn-border)' },
  avg:  { label: 'Средний чек',      bg: 'var(--paper-2)', text: 'var(--brand-ink)', border: 'var(--brand-mid-2)' },
  del:  { label: 'Доставка',         bg: 'var(--bad-tint-2)', text: 'var(--brand-ink)', border: 'var(--bad-base-soft)' },
}

interface Props {
  rows: DailyStatRow[]
}

export default function DailyStatisticsTable({ rows }: Props) {
  return (
    <div className="rounded-2xl shadow-sm border overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line-soft)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--line-soft)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Ежедневная статистика</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Данные за каждый день месяца</p>
      </div>

      <div className="overflow-auto" style={{ maxHeight: 480 }}>
        <table className="border-collapse" style={{ minWidth: 900 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink-3)', borderRight: '2px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', minWidth: 80 }}
              >
                Дата
              </th>
              {(['lmai','fv','nv','avg','del'] as const).map(grp => {
                const count = COLS.filter(c => c.group === grp).length
                const g = GROUP[grp]
                return (
                  <th key={grp} colSpan={count} className="text-center text-[10px] font-bold uppercase tracking-wider py-1.5 px-2"
                    style={{ backgroundColor: g.bg, color: g.text, borderLeft: `2px solid ${g.border}`, borderBottom: `1px solid ${g.border}` }}>
                    {g.label}
                  </th>
                )
              })}
            </tr>
            <tr>
              {COLS.map((col, ci) => {
                const g = GROUP[col.group]
                const isFirst = ci === 0 || COLS[ci - 1]?.group !== col.group
                return (
                  <th key={col.key} className="text-center text-[10px] font-semibold py-2 px-2 whitespace-nowrap"
                    style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink-25)', borderTop: `2px solid ${g.border}`, borderLeft: isFirst ? `2px solid ${g.border}` : '1px solid var(--line-soft)', minWidth: col.isMoney ? 70 : 52 }}>
                    {col.short}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, ri) => {
              const rowBg = row.isToday ? 'var(--paper-2)' : row.isWeekend ? 'var(--neutral-fill-2)' : 'var(--surface)'
              return (
                <tr key={ri} style={{ backgroundColor: rowBg, opacity: row.isFuture ? 0.4 : 1, borderBottom: '1px solid var(--neutral-fill)' }}>
                  <td className="sticky left-0 z-10 px-4 py-2 whitespace-nowrap" style={{ backgroundColor: rowBg, borderRight: '2px solid var(--line-soft)', minWidth: 80 }}>
                    <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{String(row.day).padStart(2,'0')}</span>
                    <span className="ml-1.5 text-[10px]" style={{ color: row.isWeekend ? 'var(--brand)' : 'var(--ink-3)' }}>{RU_DAYS[row.date.getDay()]}</span>
                    {row.isToday && <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{ backgroundColor: 'var(--brand)', color: 'var(--on-brand)' }}>сег</span>}
                  </td>
                  {COLS.map((col, ci) => {
                    const g = GROUP[col.group]
                    const isFirst = ci === 0 || COLS[ci - 1]?.group !== col.group
                    const val     = row[col.key] as number
                    const display = fmt(val, col.isMoney)
                    return (
                      <td key={col.key} className="text-center py-2 px-2 text-xs"
                        style={{ borderLeft: isFirst ? `2px solid ${g.border}` : '1px solid var(--neutral-fill)', color: display ? 'var(--ink)' : 'var(--line)', fontWeight: display ? 500 : 400 }}>
                        {display || '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>

          <tfoot>
            <tr style={{ backgroundColor: 'var(--paper-2)', borderTop: '2px solid var(--line-soft)' }}>
              <td className="sticky left-0 z-10 px-4 py-3 text-xs font-bold" style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink)', borderRight: '2px solid var(--line-soft)' }}>
                Итого
              </td>
              {COLS.map((col, ci) => {
                const g = GROUP[col.group]
                const isFirst = ci === 0 || COLS[ci - 1]?.group !== col.group
                const isAvg   = col.group === 'avg'
                const total   = isAvg ? 0 : rows.reduce((s, r) => s + (r[col.key] as number), 0)
                return (
                  <td key={col.key} className="text-center py-3 px-2 text-xs font-bold"
                    style={{ color: 'var(--ink)', borderLeft: isFirst ? `2px solid ${g.border}` : '1px solid var(--line-soft)' }}>
                    {isAvg ? '—' : fmt(total, col.isMoney) || '—'}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
