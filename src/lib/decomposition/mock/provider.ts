// ─── Мок-провайдер данных Декомпозиции ───────────────────────────────────────
// Реализует полный контракт DecompositionData с тестовыми данными.
// Заменяется реальным агрегатором в service.ts — UI не меняется.

import type {
  DecompositionData, PeriodData, PeriodStatus,
  ConversionRow, KpiItem, SummaryRow, DailyStatRow,
} from '../types'
import { calcConversionPct, calcPlanPct, calcDailyKpi } from '../sources/kpi'

// ── Константы мок-данных ──────────────────────────────────────────────────────

const MOCK_TARGETS = {
  conv: { appealsLeads: 70, leadsNV: 40, nvFV: 60, fvSale: 60, leadSale: 20, nvSale: 78 },
  plan: {
    appeals: 320, leads: 160, nv: 64, fv: 48,
    salesFV: 28, revFV: 2_380_000,
    salesNV: 0,  revNV: 0,
    workDays: 22,
  },
  avgCheck: 85_000,
}

const SEED_VALS = [11,14,16,8,12,9,15,13,10,7,14,11,9,16,12,8,13,10,15,0,0,0,0,0,0,0,0,0,0,0,0]

function buildRawDays(year: number, month: number) {
  const today = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day  = i + 1
    const date = new Date(year, month, day)
    const s    = date <= today ? (SEED_VALS[i] ?? 0) : 0
    return {
      day, date,
      appeals: s > 0 ? s + 3 : 0,
      leads:   s > 0 ? Math.floor(s / 2) : 0,
      nv:      s > 0 ? Math.floor(s / 4) : 0,
      fv:      s > 0 ? Math.floor(s / 5) : 0,
      salesFV: s > 0 ? Math.floor(s / 7) : 0,
      revFV:   s > 0 ? s * 7_800 : 0,
      bezNV:   s > 0 ? Math.floor(s / 8) : 0,
      salesNV: s > 0 ? Math.floor(s / 9) : 0,
      revNV:   s > 0 ? s * 4_200 : 0,
      delivery:s > 0 ? s * 80 : 0,
    }
  })
}

// ── Сборка периода ────────────────────────────────────────────────────────────

function buildPeriod(year: number, month: number): PeriodData {
  const today       = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const periodEnd   = new Date(year, month + 1, 0)
  const isActive    = today.getFullYear() === year && today.getMonth() === month
  const isDone      = today > periodEnd
  const daysPassed  = isActive ? Math.min(today.getDate(), daysInMonth) : isDone ? daysInMonth : 0
  const status: PeriodStatus = isActive ? 'active' : isDone ? 'done' : 'future'

  return {
    year, month, daysInMonth,
    workDays:    MOCK_TARGETS.plan.workDays,
    daysPassed,
    progressPct: Math.round((daysPassed / daysInMonth) * 100),
    status,
  }
}

// ── Сборка конверсий ──────────────────────────────────────────────────────────

function buildConversions(raw: ReturnType<typeof buildRawDays>): ConversionRow[] {
  const totAppeals = raw.reduce((s, r) => s + r.appeals, 0)
  const totLeads   = raw.reduce((s, r) => s + r.leads,   0)
  const totNV      = raw.reduce((s, r) => s + r.nv,      0)
  const totFV      = raw.reduce((s, r) => s + r.fv,      0)
  const totSalesFV = raw.reduce((s, r) => s + r.salesFV, 0)
  const totSalesNV = raw.reduce((s, r) => s + r.salesNV, 0)

  const t = MOCK_TARGETS.conv
  const rows: { label: string; fact: number; target: number }[] = [
    { label: 'Обращение → Лид',   fact: calcConversionPct(totLeads,   totAppeals), target: t.appealsLeads },
    { label: 'Лид → НВ',          fact: calcConversionPct(totNV,      totLeads),   target: t.leadsNV      },
    { label: 'НВ → ФВ',           fact: calcConversionPct(totFV,      totNV),      target: t.nvFV         },
    { label: 'ФВ → Продажа',      fact: calcConversionPct(totSalesFV, totFV),      target: t.fvSale       },
    { label: 'Лид → Продажа',     fact: calcConversionPct(totSalesFV, totLeads),   target: t.leadSale     },
    { label: 'Без НВ → Продажа',  fact: calcConversionPct(totSalesNV, raw.reduce((s,r)=>s+r.bezNV,0)), target: t.nvSale },
  ]
  return rows.map(r => ({ ...r, delta: r.fact - r.target, ok: r.fact >= r.target }))
}

// ── Сборка KPI карточек ───────────────────────────────────────────────────────

function buildKpi(raw: ReturnType<typeof buildRawDays>): KpiItem[] {
  const totSalesFV = raw.reduce((s, r) => s + r.salesFV, 0)
  const totRevFV   = raw.reduce((s, r) => s + r.revFV,   0)
  const totSalesNV = raw.reduce((s, r) => s + r.salesNV, 0)
  const totRevNV   = raw.reduce((s, r) => s + r.revNV,   0)
  const totDel     = raw.reduce((s, r) => s + r.delivery,0)
  const avgFV      = totSalesFV > 0 ? Math.round(totRevFV   / totSalesFV) : 0
  const avgNV      = totSalesNV > 0 ? Math.round(totRevNV   / totSalesNV) : 0
  const avgTotal   = (totSalesFV + totSalesNV) > 0
    ? Math.round((totRevFV + totRevNV) / (totSalesFV + totSalesNV)) : 0

  return [
    { label: 'Плановый ср. чек', value: MOCK_TARGETS.avgCheck, sub: 'ориентир',  color: '#e11d1d', icon: 'target' },
    { label: 'Ср. чек общий',    value: avgTotal,               sub: 'факт',      color: '#1b1517', icon: 'avg-check' },
    { label: 'Ср. чек ФВ',       value: avgFV,                  sub: 'после ФВ',  color: '#15803d', icon: 'sales-check' },
    { label: 'Ср. чек без НВ',   value: avgNV,                  sub: 'мимо НВ',   color: '#b45309', icon: 'percent' },
    { label: 'Расходы доставки', value: totDel,                  sub: 'за месяц',  color: '#e11d1d', icon: 'delivery' },
  ]
}

// ── Сборка итогов команды ─────────────────────────────────────────────────────

function buildSummary(raw: ReturnType<typeof buildRawDays>): SummaryRow[] {
  const p = MOCK_TARGETS.plan
  const totAppeals = raw.reduce((s,r)=>s+r.appeals,0)
  const totLeads   = raw.reduce((s,r)=>s+r.leads,0)
  const totNV      = raw.reduce((s,r)=>s+r.nv,0)
  const totFV      = raw.reduce((s,r)=>s+r.fv,0)
  const totSalesFV = raw.reduce((s,r)=>s+r.salesFV,0)
  const totRevFV   = raw.reduce((s,r)=>s+r.revFV,0)
  const totBezNV   = raw.reduce((s,r)=>s+r.bezNV,0)
  const totSalesNV = raw.reduce((s,r)=>s+r.salesNV,0)
  const totRevNV   = raw.reduce((s,r)=>s+r.revNV,0)

  const row = (label: string, plan: number, fact: number, isMoney: boolean, hasTarget: boolean): SummaryRow => ({
    label, plan, fact, isMoney, hasTarget,
    pct: hasTarget ? calcPlanPct(fact, plan) : 0,
  })

  return [
    row('Обращения',           p.appeals,  totAppeals,  false, true),
    row('Лиды',                p.leads,    totLeads,    false, true),
    row('Назначенные встречи', p.nv,       totNV,       false, true),
    row('Факт встречи (ФВ)',   p.fv,       totFV,       false, true),
    row('Продажи после ФВ',    p.salesFV,  totSalesFV,  false, true),
    row('Выручка после ФВ',    p.revFV,    totRevFV,    true,  true),
    row('Без НВ',              0,          totBezNV,    false, false),
    row('Продажи без НВ',      0,          totSalesNV,  false, false),
    row('Выручка без НВ',      0,          totRevNV,    true,  false),
  ]
}

// ── Сборка ежедневной статистики ──────────────────────────────────────────────

function buildDaily(raw: ReturnType<typeof buildRawDays>): DailyStatRow[] {
  const today = new Date()
  return raw.map(r => {
    const { avgFV, avgNV } = calcDailyKpi({
      revFV: r.revFV, salesFV: r.salesFV,
      revNV: r.revNV, salesNV: r.salesNV,
    })
    return {
      day:       r.day,
      date:      r.date,
      isWeekend: r.date.getDay() === 0 || r.date.getDay() === 6,
      isFuture:  r.date > today,
      isToday:   r.date.toDateString() === today.toDateString(),
      appeals:   r.appeals,
      leads:     r.leads,
      nv:        r.nv,
      fv:        r.fv,
      salesFV:   r.salesFV,
      revFV:     r.revFV,
      bezNV:     r.bezNV,
      salesNV:   r.salesNV,
      revNV:     r.revNV,
      avgFV,
      avgNV,
      delivery:  r.delivery,
    }
  })
}

// ── Главная функция провайдера ─────────────────────────────────────────────────

export function getMockDecompositionData(year: number, month: number): DecompositionData {
  const raw    = buildRawDays(year, month)
  const period = buildPeriod(year, month)

  return {
    plan:       { name: 'Общий план компании', period },
    kpi:        buildKpi(raw),
    conversion: { rows: buildConversions(raw) },
    summary:    buildSummary(raw),
    daily:      buildDaily(raw),
  }
}
