// ─── MarketingMapper ──────────────────────────────────────────────────────────
// Преобразует MarketingRaw → MarketingData.
// Все вычисления KPI здесь: CTR, CPC, CPL, конверсии, ROMI, ДРР.

import type { MarketingRaw, MarketingDayRaw } from '../contracts/IMarketingAdapter'
import type { MarketingData, MarketingDailyRow, MarketingKpi } from '@/lib/models/marketing'
import type { PeriodMeta } from '@/lib/models/common'

// ── Утилиты ──────────────────────────────────────────────────────────────────

const safe = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100) / 100)
const pct  = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 10000) / 100)
const avg  = (a: number, b: number) => (b === 0 ? 0 : Math.round(a / b))

// ── Период ────────────────────────────────────────────────────────────────────

function buildPeriod(year: number, month: number): PeriodMeta {
  const today       = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const end         = new Date(year, month + 1, 0)
  const isActive    = today.getFullYear() === year && today.getMonth() === month
  const isDone      = today > end
  const daysPassed  = isActive ? today.getDate() : isDone ? daysInMonth : 0
  return {
    year, month, daysInMonth, workDays: 22, daysPassed,
    progressPct: Math.round((daysPassed / daysInMonth) * 100),
    status: isActive ? 'active' : isDone ? 'done' : 'future',
  }
}

// ── Строка дня ────────────────────────────────────────────────────────────────

function mapDay(r: MarketingDayRaw, year: number, month: number): MarketingDailyRow {
  const today = new Date()
  const [,, d] = r.date.split('-').map(Number)
  const date   = new Date(year, month, d)

  const ctr     = pct(r.clicks, r.impressions)
  const cpc     = avg(r.spend, r.clicks)
  const cpl     = avg(r.spend, r.leads)
  const avgCheck= avg(r.revenue, r.sales)
  const romi    = r.spend === 0 ? 0 : Math.round(((r.revenue - r.spend) / r.spend) * 100)
  const drr     = r.revenue === 0 ? 0 : Math.round((r.spend / r.revenue) * 1000) / 10

  const convAppealLead   = pct(r.leads,         r.appeals)
  const convLeadConsult  = pct(r.consultations,  r.leads)
  const convConsultSale  = pct(r.sales,          r.consultations)

  return {
    day: d, date,
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
    isFuture:  date > today,
    isToday:   date.toDateString() === today.toDateString(),
    activeCampaigns: r.activeCampaigns,
    impressions: r.impressions,
    reach:       r.reach,
    clicks:      r.clicks,
    ctr, cpc,
    spend:       r.spend,
    appeals:     r.appeals,
    appealsLM:   r.appealsLM,
    cpl, leads:  r.leads,
    appointments:  r.appointments,
    consultations: r.consultations,
    sales:         r.sales,
    convAppealLead, convLeadConsult, convConsultSale,
    revenue: r.revenue, avgCheck, romi, drr,
  }
}

// ── Итоговые KPI ─────────────────────────────────────────────────────────────

function buildKpi(rows: MarketingDailyRow[], period: PeriodMeta): MarketingKpi {
  const t = <K extends keyof MarketingDailyRow>(k: K) =>
    rows.reduce((s, r) => s + (r[k] as number), 0)

  const totalSpend       = t('spend')
  const totalImpressions = t('impressions')
  const totalClicks      = t('clicks')
  const totalAppeals     = t('appeals')
  const totalLeads       = t('leads')
  const totalConsults    = t('consultations')
  const totalSales       = t('sales')
  const totalRevenue     = t('revenue')

  return {
    period,
    totalSpend,
    totalImpressions,
    totalReach:         t('reach'),
    totalClicks,
    avgCtr:             pct(totalClicks, totalImpressions),
    avgCpc:             avg(totalSpend, totalClicks),
    totalAppeals,
    totalAppealsLM:     t('appealsLM'),
    avgCpl:             avg(totalSpend, totalLeads),
    totalLeads,
    totalAppointments:  t('appointments'),
    totalConsultations: totalConsults,
    totalSales,
    convAppealLead:     pct(totalLeads,   totalAppeals),
    convLeadConsult:    pct(totalConsults, totalLeads),
    convConsultSale:    pct(totalSales,   totalConsults),
    totalRevenue,
    avgCheck:           avg(totalRevenue, totalSales),
    romi:   totalSpend === 0   ? 0 : Math.round(((totalRevenue - totalSpend) / totalSpend) * 100),
    drr:    totalRevenue === 0 ? 0 : Math.round((totalSpend / totalRevenue) * 1000) / 10,
  }
}

// ── Публичный API ─────────────────────────────────────────────────────────────

export const MarketingMapper = {
  map(raw: MarketingRaw): MarketingData {
    const period = buildPeriod(raw.year, raw.month)
    const daily  = raw.daily.map(r => mapDay(r, raw.year, raw.month))
    const kpi    = buildKpi(daily, period)
    return { kpi, daily }
  },
}

export { safe }
