// ─── Model: Marketing Analytics ──────────────────────────────────────────────
// LeadChannel экспортируется для обратной совместимости со старыми провайдерами
export type LeadChannel = 'instagram' | 'telegram' | 'website' | 'referral' | 'whatsapp' | 'other'
// UI работает только с этими типами. Никакого знания об API или рекламных кабинетах.

import type { MoneyKGS, PeriodMeta } from './common'

// ── Ежедневная строка ────────────────────────────────────────────────────────

export interface MarketingDailyRow {
  // Дата
  day:       number
  date:      Date
  isWeekend: boolean
  isFuture:  boolean
  isToday:   boolean

  // Реклама
  activeCampaigns: number   // кол-во активных кампаний
  impressions:     number   // показы
  reach:           number   // охват
  clicks:          number   // клики
  ctr:             number   // CTR %  = clicks / impressions * 100
  cpc:             MoneyKGS // CPC    = spend / clicks
  spend:           MoneyKGS // расходы

  // Воронка
  appeals:       number   // обращения всего
  appealsLM:     number   // обращения от лид-менеджера
  cpl:           MoneyKGS // CPL = spend / leads
  leads:         number   // квалифицированные лиды
  appointments:  number   // назначенные консультации
  consultations: number   // проведённые консультации (ФВ)
  sales:         number   // продажи

  // Конверсии %
  convAppealLead:   number  // обращение → лид
  convLeadConsult:  number  // лид → консультация
  convConsultSale:  number  // консультация → продажа

  // Финансы
  revenue:  MoneyKGS  // выручка
  avgCheck: MoneyKGS  // средний чек
  romi:     number    // ROMI % = (revenue - spend) / spend * 100
  drr:      number    // ДРР % = spend / revenue * 100
}

// ── Итоговые KPI ─────────────────────────────────────────────────────────────

export interface MarketingKpi {
  period:          PeriodMeta
  totalSpend:      MoneyKGS
  totalImpressions:number
  totalReach:      number
  totalClicks:     number
  avgCtr:          number   // %
  avgCpc:          MoneyKGS
  totalAppeals:    number
  totalAppealsLM:  number
  avgCpl:          MoneyKGS
  totalLeads:      number
  totalAppointments:number
  totalConsultations:number
  totalSales:      number
  convAppealLead:  number   // %
  convLeadConsult: number   // %
  convConsultSale: number   // %
  totalRevenue:    MoneyKGS
  avgCheck:        MoneyKGS
  romi:            number   // %
  drr:             number   // %
}

// ── Корневая модель ──────────────────────────────────────────────────────────

export interface MarketingData {
  kpi:   MarketingKpi
  daily: MarketingDailyRow[]
}
