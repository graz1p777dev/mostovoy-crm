// ─── DecompositionMapper ──────────────────────────────────────────────────────
// Преобразует DecompositionRaw (сырые данные от Adapter) → DecompositionData (Model).
// Содержит всю логику агрегации и вычислений: конверсии, суммы, периоды.
// Mapper — чистые функции без side-effects, легко тестировать.

import type { DecompositionRaw, DailyStatRaw, PlanTargets } from '../contracts/IDecompositionAdapter'
import type {
  DecompositionData, PlanData, DailyStatRow,
  ConversionRow, ConversionData, KpiItem, SummaryRow,
} from '@/lib/models/decomposition'
import type { PeriodMeta } from '@/lib/models/common'

// ── Утилиты ───────────────────────────────────────────────────────────────────

function planPct(fact: number, plan: number): number {
  return plan === 0 ? 0 : Math.round((fact / plan) * 100)
}

function convPct(fact: number, base: number): number {
  return base === 0 ? 0 : Math.round((fact / base) * 100)
}

function avgCheck(rev: number, sales: number): number {
  return sales === 0 ? 0 : Math.round(rev / sales)
}

// ── Период ────────────────────────────────────────────────────────────────────

function mapPeriod(year: number, month: number, workDays: number): PeriodMeta {
  const today       = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const periodEnd   = new Date(year, month + 1, 0)
  const isActive    = today.getFullYear() === year && today.getMonth() === month
  const isDone      = today > periodEnd
  const daysPassed  = isActive ? Math.min(today.getDate(), daysInMonth) : isDone ? daysInMonth : 0
  return {
    year, month, daysInMonth, workDays, daysPassed,
    progressPct: Math.round((daysPassed / daysInMonth) * 100),
    status: isActive ? 'active' : isDone ? 'done' : 'future',
  }
}

// ── Ежедневные строки ─────────────────────────────────────────────────────────

function mapDailyRows(raw: DailyStatRaw[], year: number, month: number): DailyStatRow[] {
  const today = new Date()
  return raw.map(r => {
    const [, , d] = r.date.split('-').map(Number)
    const date    = new Date(year, month, d)
    return {
      day:       d,
      date,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isFuture:  date > today,
      isToday:   date.toDateString() === today.toDateString(),
      appeals:   r.appeals,
      leads:     r.leads,
      nv:        r.nv,
      fv:        r.fv,
      salesFV:   r.salesFV,
      revFV:     r.revFV,
      bezNV:     r.bezNV,
      salesNV:   r.salesNV,
      revNV:     r.revNV,
      avgFV:     avgCheck(r.revFV,  r.salesFV),
      avgNV:     avgCheck(r.revNV,  r.salesNV),
      delivery:  r.delivery,
    }
  })
}

// ── Конверсии ─────────────────────────────────────────────────────────────────

function mapConversions(daily: DailyStatRow[], targets: PlanTargets['conv']): ConversionData {
  const tot = (key: keyof DailyStatRow) => daily.reduce((s, r) => s + (r[key] as number), 0)
  const appeals = tot('appeals')
  const leads   = tot('leads')
  const nv      = tot('nv')
  const fv      = tot('fv')
  const salesFV = tot('salesFV')
  const salesNV = tot('salesNV')
  const bezNV   = tot('bezNV')

  const rows: { label: string; fact: number; target: number }[] = [
    { label: 'Обращение → Лид',  fact: convPct(leads,   appeals), target: targets.appealsLeads },
    { label: 'Лид → НВ',         fact: convPct(nv,      leads),   target: targets.leadsNV      },
    { label: 'НВ → ФВ',          fact: convPct(fv,      nv),      target: targets.nvFV         },
    { label: 'ФВ → Продажа',     fact: convPct(salesFV, fv),      target: targets.fvSale       },
    { label: 'Лид → Продажа',    fact: convPct(salesFV, leads),   target: targets.leadSale     },
    { label: 'Без НВ → Продажа', fact: convPct(salesNV, bezNV),   target: targets.nvSale       },
  ]

  const mapped: ConversionRow[] = rows.map(r => ({
    ...r,
    delta: r.fact - r.target,
    ok:    r.fact >= r.target,
  }))

  return { rows: mapped }
}

// ── KPI карточки ──────────────────────────────────────────────────────────────

function mapKpi(daily: DailyStatRow[], avgCheckTarget: number): KpiItem[] {
  const totSalesFV = daily.reduce((s, r) => s + r.salesFV, 0)
  const totRevFV   = daily.reduce((s, r) => s + r.revFV,   0)
  const totSalesNV = daily.reduce((s, r) => s + r.salesNV, 0)
  const totRevNV   = daily.reduce((s, r) => s + r.revNV,   0)
  const totDel     = daily.reduce((s, r) => s + r.delivery, 0)

  return [
    { label: 'Плановый ср. чек', value: avgCheckTarget,                                sub: 'ориентир', color: 'var(--brand)', icon: 'target' },
    { label: 'Ср. чек общий',    value: avgCheck(totRevFV + totRevNV, totSalesFV + totSalesNV), sub: 'факт',     color: 'var(--ink)', icon: 'avg-check' },
    { label: 'Ср. чек ФВ',       value: avgCheck(totRevFV, totSalesFV),                sub: 'после ФВ', color: 'var(--ok)', icon: 'sales-check' },
    { label: 'Ср. чек без НВ',   value: avgCheck(totRevNV, totSalesNV),                sub: 'мимо НВ',  color: 'var(--warn)', icon: 'percent' },
    { label: 'Расходы доставки', value: totDel,                                        sub: 'за месяц', color: 'var(--brand)', icon: 'delivery' },
  ]
}

// ── Итоги команды ─────────────────────────────────────────────────────────────

function mapSummary(daily: DailyStatRow[], p: PlanTargets): SummaryRow[] {
  const tot = (key: keyof DailyStatRow) => daily.reduce((s, r) => s + (r[key] as number), 0)
  const row = (label: string, plan: number, fact: number, isMoney: boolean, hasTarget: boolean): SummaryRow => ({
    label, plan, fact, isMoney, hasTarget,
    pct: hasTarget ? planPct(fact, plan) : 0,
  })
  return [
    row('Обращения',           p.appeals,  tot('appeals'),  false, true),
    row('Лиды',                p.leads,    tot('leads'),    false, true),
    row('Назначенные встречи', p.nv,       tot('nv'),       false, true),
    row('Факт встречи (ФВ)',   p.fv,       tot('fv'),       false, true),
    row('Продажи после ФВ',    p.salesFV,  tot('salesFV'),  false, true),
    row('Выручка после ФВ',    p.revFV,    tot('revFV'),    true,  true),
    row('Без НВ',              0,          tot('bezNV'),    false, false),
    row('Продажи без НВ',      0,          tot('salesNV'),  false, false),
    row('Выручка без НВ',      0,          tot('revNV'),    true,  false),
  ]
}

// ── Публичный API маппера ─────────────────────────────────────────────────────

export const DecompositionMapper = {
  map(raw: DecompositionRaw): DecompositionData {
    const period = mapPeriod(raw.year, raw.month, raw.plan.workDays)
    const plan: PlanData  = { name: raw.plan.name, period }
    const daily           = mapDailyRows(raw.daily, raw.year, raw.month)
    const conversion      = mapConversions(daily, raw.plan.conv)
    const kpi             = mapKpi(daily, raw.plan.avgCheck)
    const summary         = mapSummary(daily, raw.plan)
    return { plan, kpi, conversion, summary, daily }
  },
}
