'use client'

import { useState, useMemo, useCallback } from 'react'
import type { MarketingDailyRow, MarketingKpi } from '@/lib/models/marketing'
import { MONTHLY_PLAN, getStatus, STATUS_COLORS } from './marketing-plans'

// ─── Типы ────────────────────────────────────────────────────────────────────

type ViewMode = 'fact' | 'vs_plan' | 'delta'
type SortDir  = 'asc' | 'desc' | null
type ColKey   = keyof MarketingDailyRow

interface ColDef {
  key:     ColKey
  label:   string
  planKey: keyof typeof MONTHLY_PLAN | null
  group:   'ad' | 'funnel' | 'conv' | 'fin'
  fmt:     (v: number) => string
  dir?:    'higher' | 'lower'
}

// ─── Утилиты форматирования ────────────────────────────────────────────────

const fmtK    = (n: number) => n >= 1000 ? (n / 1000).toFixed(0) + 'K' : String(Math.round(n))
const fmtPct  = (n: number) => n.toFixed(1) + '%'
const fmtNum  = (n: number) => n.toString()
const fmtMon  = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M' : fmtK(n)

// ─── Конфиг колонок ────────────────────────────────────────────────────────

const COLS: ColDef[] = [
  // Реклама
  { key: 'activeCampaigns', label: 'Кампании',    planKey: null,           group: 'ad',     fmt: fmtNum, dir: 'higher' },
  { key: 'impressions',     label: 'Показы',      planKey: 'impressions',  group: 'ad',     fmt: fmtK,   dir: 'higher' },
  { key: 'reach',           label: 'Охват',       planKey: 'reach',        group: 'ad',     fmt: fmtK,   dir: 'higher' },
  { key: 'clicks',          label: 'Клики',       planKey: 'clicks',       group: 'ad',     fmt: fmtNum, dir: 'higher' },
  { key: 'ctr',             label: 'CTR',         planKey: 'ctr',          group: 'ad',     fmt: fmtPct, dir: 'higher' },
  { key: 'cpc',             label: 'CPC',         planKey: 'cpc',          group: 'ad',     fmt: fmtK,   dir: 'lower'  },
  { key: 'spend',           label: 'Расход',      planKey: 'spend',        group: 'ad',     fmt: fmtK,   dir: 'lower'  },
  // Воронка
  { key: 'appeals',         label: 'Обращения',   planKey: 'appeals',      group: 'funnel', fmt: fmtNum, dir: 'higher' },
  { key: 'appealsLM',       label: 'Обр. ЛМ',    planKey: null,           group: 'funnel', fmt: fmtNum, dir: 'higher' },
  { key: 'cpl',             label: 'CPL',         planKey: 'cpl',          group: 'funnel', fmt: fmtK,   dir: 'lower'  },
  { key: 'leads',           label: 'Лиды',        planKey: 'leads',        group: 'funnel', fmt: fmtNum, dir: 'higher' },
  { key: 'appointments',    label: 'Назн.',        planKey: null,           group: 'funnel', fmt: fmtNum, dir: 'higher' },
  { key: 'consultations',   label: 'Консульт.',   planKey: 'consultations',group: 'funnel', fmt: fmtNum, dir: 'higher' },
  { key: 'sales',           label: 'Продажи',     planKey: 'sales',        group: 'funnel', fmt: fmtNum, dir: 'higher' },
  // Конверсии
  { key: 'convAppealLead',  label: 'Обр→Лид',    planKey: 'convAppealLead',  group: 'conv', fmt: fmtPct, dir: 'higher' },
  { key: 'convLeadConsult', label: 'Лид→Конс',   planKey: 'convLeadConsult', group: 'conv', fmt: fmtPct, dir: 'higher' },
  { key: 'convConsultSale', label: 'Конс→Прод',  planKey: 'convConsultSale', group: 'conv', fmt: fmtPct, dir: 'higher' },
  // Финансы
  { key: 'revenue',         label: 'Выручка',     planKey: 'revenue',      group: 'fin',    fmt: fmtMon, dir: 'higher' },
  { key: 'avgCheck',        label: 'Ср. чек',    planKey: 'avgCheck',     group: 'fin',    fmt: fmtMon, dir: 'higher' },
  { key: 'romi',            label: 'ROMI',        planKey: 'romi',         group: 'fin',    fmt: fmtPct, dir: 'higher' },
  { key: 'drr',             label: 'ДРР',         planKey: 'drr',          group: 'fin',    fmt: fmtPct, dir: 'lower'  },
]

const GROUP_META: Record<string, { label: string; color: string; count: number }> = {
  ad:     { label: 'Реклама',   color: '#fdecec', count: 7 },
  funnel: { label: 'Воронка',   color: '#dcfce7', count: 7 },
  conv:   { label: 'Конверсии', color: '#fef3c7', count: 3 },
  fin:    { label: 'Финансы',   color: '#faf8f7', count: 4 },
}

// ─── Дневной план ─────────────────────────────────────────────────────────

function getDailyPlan(col: ColDef, workDays: number, isWeekend: boolean): number | null {
  if (!col.planKey || isWeekend) return null
  const mp = MONTHLY_PLAN[col.planKey]
  if (col.group === 'conv' || col.key === 'ctr' || col.key === 'drr' || col.key === 'romi') return mp
  return Math.round(mp / workDays)
}

// ─── CSV-экспорт ──────────────────────────────────────────────────────────

function exportCSV(rows: MarketingDailyRow[], filename: string) {
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

function exportExcel(rows: MarketingDailyRow[], filename: string) {
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

// ─── Ячейка с аналитикой ──────────────────────────────────────────────────

function Cell({ col, fact, plan, viewMode }: { col: ColDef; fact: number; plan: number | null; viewMode: ViewMode }) {
  const hasPlan = plan !== null && !!col.dir && plan > 0
  const status  = hasPlan ? getStatus(fact, plan!, col.dir!) : 'neutral'
  const colors  = STATUS_COLORS[status]

  if (viewMode === 'vs_plan' && hasPlan) {
    const pct = Math.round((fact / plan!) * 100)
    return (
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <div className="text-[11px] font-semibold" style={{ color: colors.text }}>{col.fmt(fact)}</div>
        <div style={{ fontSize: 9, color: '#7d7174' }}>/{col.fmt(plan!)} {pct}%</div>
      </td>
    )
  }
  if (viewMode === 'delta' && hasPlan) {
    const delta = fact - plan!
    const good  = col.dir === 'lower' ? delta <= 0 : delta >= 0
    return (
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <div className="text-[11px] font-semibold" style={{ color: good ? '#15803d' : '#e11d1d' }}>
          {good ? '+' : ''}{col.fmt(Math.abs(delta))}
        </div>
        <div style={{ fontSize: 9, color: '#7d7174' }}>{col.fmt(fact)}</div>
      </td>
    )
  }
  return (
    <td className="px-2 py-1.5 text-right text-[11px] font-semibold whitespace-nowrap"
      style={{ color: hasPlan ? colors.text : '#1b1517' }}
    >
      {col.fmt(fact)}
    </td>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────

const DAY_ABBR = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

interface Props { rows: MarketingDailyRow[]; kpi: MarketingKpi }

export default function MarketingDailyTable({ rows, kpi }: Props) {
  const [viewMode,     setViewMode]     = useState<ViewMode>('fact')
  const [sortCol,      setSortCol]      = useState<ColKey | null>(null)
  const [sortDir,      setSortDir]      = useState<SortDir>(null)
  const [hideWeekends, setHideWeekends] = useState(false)
  const [hideFuture,   setHideFuture]   = useState(false)
  const [search,       setSearch]       = useState('')

  const workDays = useMemo(() => rows.filter(r => !r.isWeekend && !r.isFuture).length || 1, [rows])
  const now = new Date()
  const fileBase = `marketing-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

  const handleSort = useCallback((key: ColKey) => {
    setSortCol(prev => {
      if (prev === key) return key
      setSortDir('asc')
      return key
    })
    setSortDir(prev => {
      if (sortCol !== key) return 'asc'
      if (prev === 'asc')  return 'desc'
      if (prev === 'desc') { setSortCol(null); return null }
      return 'asc'
    })
  }, [sortCol])

  const filtered = useMemo(() => {
    let r = [...rows]
    if (hideWeekends) r = r.filter(x => !x.isWeekend)
    if (hideFuture)   r = r.filter(x => !x.isFuture)
    if (search.trim()) r = r.filter(x => String(x.day).startsWith(search.trim()))
    if (sortCol && sortDir) {
      r.sort((a, b) => {
        const va = a[sortCol] as number
        const vb = b[sortCol] as number
        return sortDir === 'asc' ? va - vb : vb - va
      })
    }
    return r
  }, [rows, hideWeekends, hideFuture, search, sortCol, sortDir])

  return (
    <div className="rounded-2xl shadow-sm border overflow-hidden" style={{ backgroundColor: '#fff', borderColor: '#ebebee' }}>

      {/* Тулбар */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: '#ebebee' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#1b1517' }}>Ежедневная аналитика</p>
          <p className="text-[11px]" style={{ color: '#7d7174' }}>Все показатели по дням месяца</p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">

          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="День..." className="text-[11px] rounded-lg px-2 py-1.5 border outline-none w-20"
            style={{ borderColor: '#ebebee', color: '#1b1517' }}
          />

          {[
            { label: 'Без вых.', val: hideWeekends, set: setHideWeekends },
            { label: 'Прошедшие', val: hideFuture,  set: setHideFuture  },
          ].map(f => (
            <label key={f.label} className="flex items-center gap-1 text-[11px] cursor-pointer select-none px-2 py-1.5 rounded-lg border"
              style={{ borderColor: '#ebebee', color: '#1b1517' }}
            >
              <input type="checkbox" checked={f.val} onChange={e => f.set(e.target.checked)} className="w-3 h-3" />
              {f.label}
            </label>
          ))}

          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: '#ebebee' }}>
            {(['fact','vs_plan','delta'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className="text-[10px] font-semibold px-2.5 py-1.5"
                style={{ backgroundColor: viewMode === m ? '#e11d1d' : '#fff', color: viewMode === m ? '#fff' : '#1b1517' }}
              >
                {m === 'fact' ? 'Факт' : m === 'vs_plan' ? 'vs План' : 'Δ Откл.'}
              </button>
            ))}
          </div>

          <button onClick={() => exportCSV(filtered, fileBase + '.csv')}
            className="text-[11px] font-semibold px-2 py-1.5 rounded-lg border hover:opacity-80"
            style={{ backgroundColor: '#fdfbfb', color: '#1b1517', borderColor: '#ebebee' }}
          >↓ CSV</button>
          <button onClick={() => exportExcel(filtered, fileBase + '.xls')}
            className="text-[11px] font-semibold px-2 py-1.5 rounded-lg border hover:opacity-80"
            style={{ backgroundColor: '#fdfbfb', color: '#1b1517', borderColor: '#ebebee' }}
          >↓ Excel</button>
        </div>
      </div>

      {/* Таблица со скроллом */}
      <div style={{ maxHeight: 540, overflowX: 'auto', overflowY: 'auto' }}>
        <table className="border-collapse" style={{ minWidth: 1820, fontSize: 11 }}>
          <thead>
            {/* Группы */}
            <tr style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <th rowSpan={2} style={{
                position: 'sticky', left: 0, zIndex: 30,
                backgroundColor: '#f6f2f2', color: '#574d4f',
                padding: '6px 10px', textAlign: 'left', fontSize: 10,
                borderRight: '1px solid rgba(255,255,255,0.15)', minWidth: 72,
              }}>ДАТА</th>
              {Object.entries(GROUP_META).map(([grp, meta]) => (
                <th key={grp} colSpan={meta.count} style={{
                  backgroundColor: meta.color, color: '#1b1517',
                  padding: '5px 8px', textAlign: 'center',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                  borderRight: '1px solid rgba(0,0,0,0.07)', textTransform: 'uppercase',
                }}>{meta.label}</th>
              ))}
            </tr>
            {/* Колонки */}
            <tr style={{ position: 'sticky', top: 29, zIndex: 19 }}>
              {COLS.map((col, i) => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{
                  backgroundColor: GROUP_META[col.group]?.color ?? '#fdfbfb',
                  color: '#1b1517', padding: '5px 8px',
                  textAlign: 'right', fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                  borderRight: i < COLS.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                }}>
                  {col.label}{' '}
                  <span style={{ color: sortCol === col.key ? '#c01818' : '#6b6063' }}>
                    {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, idx) => {
              const dayOfWeek = DAY_ABBR[new Date(row.date).getDay()]
              const rowBg = row.isToday ? '#fffbeb' : row.isWeekend ? '#faf8f7' : idx % 2 === 0 ? '#fff' : '#fdfbfb'

              return (
                <tr key={row.day} style={{ backgroundColor: rowBg, opacity: row.isFuture ? 0.4 : 1 }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 10,
                    backgroundColor: row.isToday ? '#fffbeb' : rowBg,
                    padding: '5px 10px', whiteSpace: 'nowrap',
                    borderRight: '1px solid #ebebee', minWidth: 72,
                    fontWeight: row.isToday ? 700 : 400,
                    color: row.isToday ? '#b45309' : row.isWeekend ? '#6b6063' : '#1b1517',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: row.isToday || row.isWeekend ? 700 : 500 }}>
                      {String(row.day).padStart(2,'0')}
                    </span>
                    <span style={{ fontSize: 9, marginLeft: 4, color: '#6b6063' }}>{dayOfWeek}</span>
                    {row.isToday && <span style={{ marginLeft: 4, fontSize: 9, color: '#b45309' }}>◉</span>}
                  </td>
                  {COLS.map(col => (
                    <Cell key={col.key} col={col} fact={row[col.key] as number}
                      plan={getDailyPlan(col, workDays, row.isWeekend)} viewMode={viewMode} />
                  ))}
                </tr>
              )
            })}
          </tbody>

          {/* Итого */}
          <tfoot>
            <tr style={{ backgroundColor: '#faf8f7', position: 'sticky', bottom: 0, zIndex: 20, borderTop: '2px solid #ece5e5' }}>
              <td style={{
                position: 'sticky', left: 0, zIndex: 30,
                backgroundColor: '#f6f2f2', color: '#574d4f',
                padding: '6px 10px', fontWeight: 700, fontSize: 11,
                borderRight: '1px solid #e8dfe0', minWidth: 72,
              }}>ИТОГО</td>

              {[
                '—', fmtK(kpi.totalImpressions), fmtK(kpi.totalReach),
                fmtK(kpi.totalClicks), fmtPct(kpi.avgCtr), fmtK(kpi.avgCpc), fmtK(kpi.totalSpend),
                fmtNum(kpi.totalAppeals), fmtNum(kpi.totalAppealsLM),
                fmtK(kpi.avgCpl), fmtNum(kpi.totalLeads), fmtNum(kpi.totalAppointments),
                fmtNum(kpi.totalConsultations), fmtNum(kpi.totalSales),
                fmtPct(kpi.convAppealLead), fmtPct(kpi.convLeadConsult), fmtPct(kpi.convConsultSale),
                fmtMon(kpi.totalRevenue), fmtMon(kpi.avgCheck), fmtPct(kpi.romi), fmtPct(kpi.drr),
              ].map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-[11px] font-bold whitespace-nowrap" style={{ color: '#1b1517' }}>{v}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
