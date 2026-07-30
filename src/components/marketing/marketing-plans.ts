// ─── Плановые показатели Marketing (Mock) ────────────────────────────────────
// В будущем придут из Supabase таблицы `plans` через Repository.
// UI импортирует только эти константы — архитектура не меняется.

export interface MarketingPlan {
  spend:          number   // расход KGS
  impressions:    number   // показы
  reach:          number   // охват
  clicks:         number   // клики
  ctr:            number   // % CTR
  cpc:            number   // KGS
  cpm:            number   // KGS (per 1000 shows)
  cpl:            number   // KGS
  appeals:        number
  leads:          number
  qualifiedLeads: number
  consultations:  number
  sales:          number
  convAppealLead: number   // %
  convLeadConsult:number   // %
  convConsultSale:number   // %
  revenue:        number   // KGS
  avgCheck:       number   // KGS
  romi:           number   // %
  drr:            number   // %
}

export type MetricDirection = 'higher' | 'lower'

export interface MetricMeta {
  key:       keyof MarketingPlan
  label:     string
  format:    'money' | 'number' | 'pct' | 'pct1'
  direction: MetricDirection   // higher=better или lower=better
  group:     'ad' | 'funnel' | 'conv' | 'fin'
  icon:      string
}

// ── Ежемесячный план ──────────────────────────────────────────────────────────

export const MONTHLY_PLAN: MarketingPlan = {
  spend:          300_000,
  impressions:    500_000,
  reach:          350_000,
  clicks:         12_000,
  ctr:            2.4,
  cpc:            25,
  cpm:            600,
  cpl:            750,
  appeals:        800,
  leads:          300,
  qualifiedLeads: 250,
  consultations:  150,
  sales:          90,
  convAppealLead: 37,
  convLeadConsult:50,
  convConsultSale:60,
  revenue:        8_000_000,
  avgCheck:       89_000,
  romi:           2_500,
  drr:            3.75,
}

// ── Описание метрик ───────────────────────────────────────────────────────────

export const METRICS: MetricMeta[] = [
  // Реклама
  { key: 'spend',          label: 'Расход',          format: 'money',  direction: 'lower',  group: 'ad',     icon: 'campaign' },
  { key: 'impressions',    label: 'Показы',           format: 'number', direction: 'higher', group: 'ad',     icon: 'views' },
  { key: 'reach',          label: 'Охват',            format: 'number', direction: 'higher', group: 'ad',     icon: 'reach' },
  { key: 'clicks',         label: 'Клики',            format: 'number', direction: 'higher', group: 'ad',     icon: 'clicks' },
  { key: 'ctr',            label: 'CTR',              format: 'pct1',   direction: 'higher', group: 'ad',     icon: 'percent' },
  { key: 'cpc',            label: 'CPC',              format: 'money',  direction: 'lower',  group: 'ad',     icon: 'cost' },
  { key: 'cpm',            label: 'CPM',              format: 'money',  direction: 'lower',  group: 'ad',     icon: 'number' },
  // Воронка
  { key: 'cpl',            label: 'CPL',              format: 'money',  direction: 'lower',  group: 'funnel', icon: 'target' },
  { key: 'appeals',        label: 'Обращения',        format: 'number', direction: 'higher', group: 'funnel', icon: 'message' },
  { key: 'leads',          label: 'Лиды',             format: 'number', direction: 'higher', group: 'funnel', icon: 'hot-leads' },
  { key: 'qualifiedLeads', label: 'Квал. лиды',       format: 'number', direction: 'higher', group: 'funnel', icon: 'qualified' },
  { key: 'consultations',  label: 'Консультации',     format: 'number', direction: 'higher', group: 'funnel', icon: 'people' },
  { key: 'sales',          label: 'Продажи',          format: 'number', direction: 'higher', group: 'funnel', icon: 'sales' },
  // Конверсии
  { key: 'convAppealLead',  label: 'Обр.→Лид',        format: 'pct1',   direction: 'higher', group: 'conv',   icon: 'conversion' },
  { key: 'convLeadConsult', label: 'Лид→Конс.',       format: 'pct1',   direction: 'higher', group: 'conv',   icon: 'conversion' },
  { key: 'convConsultSale', label: 'Конс.→Прод.',     format: 'pct1',   direction: 'higher', group: 'conv',   icon: 'conversion' },
  // Финансы
  { key: 'revenue',        label: 'Выручка',          format: 'money',  direction: 'higher', group: 'fin',    icon: 'revenue' },
  { key: 'avgCheck',       label: 'Средний чек',      format: 'money',  direction: 'higher', group: 'fin',    icon: 'receipt' },
  { key: 'romi',           label: 'ROMI',             format: 'pct',    direction: 'higher', group: 'fin',    icon: 'growth' },
  { key: 'drr',            label: 'ДРР',              format: 'pct1',   direction: 'lower',  group: 'fin',    icon: 'expense-rate' },
]

// ── Утилиты ───────────────────────────────────────────────────────────────────

export function getStatus(fact: number, plan: number, direction: MetricDirection): 'green' | 'yellow' | 'red' | 'neutral' {
  if (plan === 0) return 'neutral'
  const ratio = direction === 'higher' ? fact / plan : plan / fact
  if (ratio >= 0.95) return 'green'
  if (ratio >= 0.70) return 'yellow'
  return 'red'
}

export function fmtValue(value: number, format: MetricMeta['format']): string {
  if (value === 0) return '—'
  switch (format) {
    case 'money':
      if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + ' M'
      if (value >= 1_000)     return (value / 1_000).toFixed(0) + ' K'
      return value.toLocaleString('ru')
    case 'number':
      if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M'
      if (value >= 1_000)     return (value / 1_000).toFixed(0) + 'K'
      return value.toLocaleString('ru')
    case 'pct':
      return value.toLocaleString('ru') + '%'
    case 'pct1':
      return value.toFixed(1) + '%'
  }
}

export const STATUS_COLORS = {
  green:   { text: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  yellow:  { text: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
  red:     { text: '#c01818', bg: '#fef2f2', border: '#fca5a5' },
  neutral: { text: '#6b6063', bg: '#fdfbfb', border: '#ebebee' },
}

export function dailyPlanValue(planTotal: number, workDays: number): number {
  return Math.round(planTotal / workDays)
}
