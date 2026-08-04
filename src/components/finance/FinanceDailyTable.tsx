'use client'

import { useState, useMemo, useCallback } from 'react'
import type { FinanceDailyRow, FinanceKpi } from '@/lib/models/finance'
import { FINANCE_PLAN, getStatus, STATUS_COLOR, fmtMoney, fmtPct, fmtNum } from './finance-plans'

type ViewMode = 'fact' | 'vs_plan' | 'delta'
type SortDir  = 'asc' | 'desc' | null
type ColKey   = keyof FinanceDailyRow

interface ColDef {
  key:     ColKey
  label:   string
  group:   'revenue' | 'expenses' | 'profit' | 'cash'
  planKey: keyof typeof FINANCE_PLAN | null
  dir?:    'higher' | 'lower'
  fmt:     (n: number) => string
}

const COLS: ColDef[] = [
  // Выручка
  { key: 'revenue',      label: 'Выручка',     group: 'revenue',   planKey: 'revenue',   dir: 'higher', fmt: fmtMoney },
  { key: 'transactions', label: 'Сделки',      group: 'revenue',   planKey: 'transactions', dir: 'higher', fmt: fmtNum },
  { key: 'avgCheck',     label: 'Ср. чек',     group: 'revenue',   planKey: 'avgCheck',  dir: 'higher', fmt: fmtMoney },
  // Расходы
  { key: 'expenses',     label: 'Расходы',     group: 'expenses',  planKey: 'expenses',  dir: 'lower',  fmt: fmtMoney },
  { key: 'expPayroll',   label: 'ФОТ',         group: 'expenses',  planKey: 'expPayroll',dir: 'lower',  fmt: fmtMoney },
  { key: 'expMarketing', label: 'Маркетинг',   group: 'expenses',  planKey: 'expMarketing', dir: 'lower', fmt: fmtMoney },
  { key: 'expRent',      label: 'Аренда',      group: 'expenses',  planKey: 'expRent',   dir: 'lower',  fmt: fmtMoney },
  { key: 'expSupplies',  label: 'Расходники',  group: 'expenses',  planKey: 'expSupplies',dir:'lower',  fmt: fmtMoney },
  { key: 'expOther',     label: 'Прочие',      group: 'expenses',  planKey: 'expOther',  dir: 'lower',  fmt: fmtMoney },
  // Прибыль
  { key: 'grossProfit',  label: 'Вал. прибыль',group: 'profit',    planKey: null,        dir: 'higher', fmt: fmtMoney },
  { key: 'netProfit',    label: 'Чист. прибыль',group: 'profit',   planKey: 'profit',    dir: 'higher', fmt: fmtMoney },
  { key: 'margin',       label: 'Маржа %',     group: 'profit',    planKey: 'margin',    dir: 'higher', fmt: fmtPct },
  // Cash Flow
  { key: 'cashIn',       label: 'Cash In',     group: 'cash',      planKey: null,        dir: 'higher', fmt: fmtMoney },
  { key: 'cashOut',      label: 'Cash Out',    group: 'cash',      planKey: null,        dir: 'lower',  fmt: fmtMoney },
  { key: 'cashBalance',  label: 'Баланс',      group: 'cash',      planKey: null,        dir: 'higher', fmt: fmtMoney },
]

const GROUP_META: Record<string, { label: string; color: string; count: number }> = {
  revenue:  { label: 'Выручка',    color: 'var(--ok-soft)', count: 3 },
  expenses: { label: 'Расходы',    color: 'var(--bad-soft)', count: 6 },
  profit:   { label: 'Прибыль',    color: 'var(--warn-soft)', count: 3 },
  cash:     { label: 'Cash Flow',  color: 'var(--brand-soft)', count: 3 },
}

function getDailyPlan(col: ColDef, workDays: number, isWeekend: boolean): number | null {
  if (!col.planKey || isWeekend) return null
  const mp = FINANCE_PLAN[col.planKey]
  if (col.key === 'margin') return mp
  return Math.round(mp / workDays)
}

function exportCSV(rows: FinanceDailyRow[], filename: string) {
  const BOM  = '﻿'
  const head = ['День', ...COLS.map(c => c.label)].join(';')
  const body = rows.map(r =>
    [String(r.day).padStart(2,'0'),
     ...COLS.map(c => { const v = r[c.key]; return typeof v === 'number' ? String(Math.round(v)) : '' })
    ].join(';')
  )
  const blob = new Blob([BOM + [head, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); URL.revokeObjectURL(a.href)
}

function exportExcel(rows: FinanceDailyRow[], filename: string) {
  const BOM  = '﻿'
  const head = ['День', ...COLS.map(c => c.label)].join('\t')
  const body = rows.map(r =>
    [String(r.day).padStart(2,'0'),
     ...COLS.map(c => { const v = r[c.key]; return typeof v === 'number' ? String(Math.round(v)) : '' })
    ].join('\t')
  )
  const blob = new Blob([BOM + [head, ...body].join('\n')], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); URL.revokeObjectURL(a.href)
}

function Cell({ col, fact, plan, viewMode }: { col: ColDef; fact: number; plan: number | null; viewMode: ViewMode }) {
  const hasPlan = plan !== null && !!col.dir && plan > 0
  const status  = hasPlan ? getStatus(fact, plan!, col.dir!) : 'neutral'
  const c       = STATUS_COLOR[status]

  if (viewMode === 'vs_plan' && hasPlan) {
    const pct = Math.round((fact / plan!) * 100)
    return (
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <div className="text-[11px] font-semibold" style={{ color: c.text }}>{col.fmt(fact)}</div>
        <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>/{col.fmt(plan!)} {pct}%</div>
      </td>
    )
  }
  if (viewMode === 'delta' && hasPlan) {
    const delta = fact - plan!
    const good  = col.dir === 'lower' ? delta <= 0 : delta >= 0
    return (
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <div className="text-[11px] font-semibold" style={{ color: good ? 'var(--ok)' : 'var(--brand)' }}>
          {good ? '+' : ''}{col.fmt(Math.abs(delta))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{col.fmt(fact)}</div>
      </td>
    )
  }
  return (
    <td className="px-2 py-1.5 text-right text-[11px] font-semibold whitespace-nowrap"
      style={{ color: hasPlan ? c.text : col.key === 'netProfit' || col.key === 'grossProfit'
        ? fact >= 0 ? 'var(--ok)' : 'var(--brand)'
        : 'var(--ink)' }}
    >
      {col.fmt(fact)}
    </td>
  )
}

const DAY_ABBR = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

interface Props { rows: FinanceDailyRow[]; kpi: FinanceKpi }

export default function FinanceDailyTable({ rows, kpi }: Props) {
  const [viewMode,     setViewMode]     = useState<ViewMode>('fact')
  const [sortCol,      setSortCol]      = useState<ColKey | null>(null)
  const [sortDir,      setSortDir]      = useState<SortDir>(null)
  const [hideWeekends, setHideWeekends] = useState(false)
  const [hideFuture,   setHideFuture]   = useState(false)
  const [search,       setSearch]       = useState('')

  const workDays = useMemo(() => rows.filter(r => !r.isWeekend && !r.isFuture).length || 1, [rows])
  const now      = new Date()
  const fileBase = `finance-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

  const handleSort = useCallback((key: ColKey) => {
    if (sortCol === key) {
      if (sortDir === 'asc')  { setSortDir('desc'); return }
      if (sortDir === 'desc') { setSortCol(null); setSortDir(null); return }
    }
    setSortCol(key); setSortDir('asc')
  }, [sortCol, sortDir])

  const filtered = useMemo(() => {
    let r = [...rows]
    if (hideWeekends) r = r.filter(x => !x.isWeekend)
    if (hideFuture)   r = r.filter(x => !x.isFuture)
    if (search.trim()) r = r.filter(x => String(x.day).startsWith(search.trim()))
    if (sortCol && sortDir) {
      r.sort((a, b) => {
        const va = a[sortCol] as number, vb = b[sortCol] as number
        return sortDir === 'asc' ? va - vb : vb - va
      })
    }
    return r
  }, [rows, hideWeekends, hideFuture, search, sortCol, sortDir])

  // Итого
  const totals = {
    revenue: kpi.totalRevenue, transactions: kpi.totalTransactions, avgCheck: kpi.avgCheck,
    expenses: kpi.totalExpenses, expPayroll: kpi.expBreakdown.payroll,
    expMarketing: kpi.expBreakdown.marketing, expRent: kpi.expBreakdown.rent,
    expSupplies: kpi.expBreakdown.supplies, expOther: kpi.expBreakdown.other,
    grossProfit: rows.reduce((s,r) => s+r.grossProfit, 0),
    netProfit: kpi.totalProfit, margin: kpi.avgMargin,
    cashIn: kpi.totalCashIn, cashOut: kpi.totalCashOut,
    cashBalance: rows[rows.length - 1]?.cashBalance ?? 0,
  }

  return (
    <div className="rounded-2xl shadow-sm border overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line-soft)' }}>
      {/* Тулбар */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--line-soft)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Ежедневная аналитика</p>
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Все финансовые показатели по дням</p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="День..." className="text-[11px] rounded-lg px-2 py-1.5 border outline-none w-20"
            style={{ borderColor: 'var(--line-soft)', color: 'var(--ink)' }} />
          {[{ label: 'Без вых.', val: hideWeekends, set: setHideWeekends },
            { label: 'Прошедшие', val: hideFuture, set: setHideFuture }].map(f => (
            <label key={f.label} className="flex items-center gap-1 text-[11px] cursor-pointer select-none px-2 py-1.5 rounded-lg border"
              style={{ borderColor: 'var(--line-soft)', color: 'var(--ink)' }}>
              <input type="checkbox" checked={f.val} onChange={e => f.set(e.target.checked)} className="w-3 h-3" />
              {f.label}
            </label>
          ))}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--line-soft)' }}>
            {(['fact','vs_plan','delta'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className="text-[10px] font-semibold px-2.5 py-1.5"
                style={{ backgroundColor: viewMode === m ? 'var(--brand)' : 'var(--surface)', color: viewMode === m ? 'var(--surface)' : 'var(--ink)' }}>
                {m === 'fact' ? 'Факт' : m === 'vs_plan' ? 'vs План' : 'Δ Откл.'}
              </button>
            ))}
          </div>
          <button onClick={() => exportCSV(filtered, fileBase + '.csv')}
            className="text-[11px] font-semibold px-2 py-1.5 rounded-lg border hover:opacity-80"
            style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink)', borderColor: 'var(--line-soft)' }}>↓ CSV</button>
          <button onClick={() => exportExcel(filtered, fileBase + '.xls')}
            className="text-[11px] font-semibold px-2 py-1.5 rounded-lg border hover:opacity-80"
            style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink)', borderColor: 'var(--line-soft)' }}>↓ Excel</button>
        </div>
      </div>

      <div style={{ maxHeight: 540, overflowX: 'auto', overflowY: 'auto' }}>
        <table className="border-collapse" style={{ minWidth: 1400, fontSize: 11 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <th rowSpan={2} style={{
                position: 'sticky', left: 0, zIndex: 30, backgroundColor: 'var(--surface-2)', color: 'var(--ink-2)',
                padding: '6px 10px', textAlign: 'left', fontSize: 10,
                borderRight: '1px solid rgba(255,255,255,0.15)', minWidth: 72,
              }}>ДАТА</th>
              {Object.entries(GROUP_META).map(([grp, meta]) => (
                <th key={grp} colSpan={meta.count} style={{
                  backgroundColor: meta.color, color: 'var(--ink)',
                  padding: '5px 8px', textAlign: 'center',
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  borderRight: '1px solid rgba(0,0,0,0.07)',
                }}>{meta.label}</th>
              ))}
            </tr>
            <tr style={{ position: 'sticky', top: 29, zIndex: 19 }}>
              {COLS.map((col, i) => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{
                  backgroundColor: GROUP_META[col.group]?.color ?? 'var(--paper-2)',
                  color: 'var(--ink)', padding: '5px 8px', textAlign: 'right',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  whiteSpace: 'nowrap', userSelect: 'none',
                  borderRight: i < COLS.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                }}>
                  {col.label}{' '}
                  <span style={{ color: sortCol === col.key ? 'var(--brand-ink)' : 'var(--ink-25)' }}>
                    {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => {
              const dayOfWeek = DAY_ABBR[new Date(row.date).getDay()]
              const rowBg = row.isToday ? 'var(--warn-tint)' : row.isWeekend ? 'var(--paper)' : idx % 2 === 0 ? 'var(--surface)' : 'var(--paper-2)'
              return (
                <tr key={row.day} style={{ backgroundColor: rowBg, opacity: row.isFuture ? 0.35 : 1 }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 10,
                    backgroundColor: row.isToday ? 'var(--warn-tint)' : rowBg,
                    padding: '5px 10px', whiteSpace: 'nowrap',
                    borderRight: '1px solid var(--line-soft)', minWidth: 72,
                    color: row.isToday ? 'var(--warn)' : row.isWeekend ? 'var(--ink-25)' : 'var(--ink)',
                    fontWeight: row.isToday ? 700 : 400,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: row.isToday || row.isWeekend ? 700 : 500 }}>
                      {String(row.day).padStart(2,'0')}
                    </span>
                    <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--ink-25)' }}>{dayOfWeek}</span>
                    {row.isToday && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--warn)' }}>◉</span>}
                  </td>
                  {COLS.map(col => (
                    <Cell key={col.key} col={col} fact={row[col.key] as number}
                      plan={getDailyPlan(col, workDays, row.isWeekend)} viewMode={viewMode} />
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: 'var(--paper)', position: 'sticky', bottom: 0, zIndex: 20, borderTop: '2px solid var(--line)' }}>
              <td style={{
                position: 'sticky', left: 0, zIndex: 30,
                backgroundColor: 'var(--surface-2)', color: 'var(--ink-2)',
                padding: '6px 10px', fontWeight: 700, fontSize: 11,
                borderRight: '1px solid var(--line-mid)', minWidth: 72,
              }}>ИТОГО</td>
              {COLS.map((col, i) => {
                const v = totals[col.key as keyof typeof totals]
                return (
                  <td key={i} className="px-2 py-2 text-right text-[11px] font-bold whitespace-nowrap"
                    style={{ color: 'var(--ink)' }}>
                    {typeof v === 'number' ? col.fmt(v) : '—'}
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
