// ─── Model: Декомпозиция ──────────────────────────────────────────────────────
// Всё, что получает UI страницы /dashboard/decomposition.
// Компонент не знает: откуда пришли данные, какая CRM, какая БД.

import type { MoneyKGS, PeriodMeta } from './common'

export interface PlanData {
  name:   string
  period: PeriodMeta
}

export interface ConversionRow {
  label:  string
  fact:   number    // %
  target: number    // %
  delta:  number    // fact - target
  ok:     boolean
}

export interface ConversionData {
  rows: ConversionRow[]
}

export interface KpiItem {
  label: string
  value: MoneyKGS
  sub:   string
  color: string
  icon:  string
}

export interface SummaryRow {
  label:     string
  plan:      number
  fact:      number
  pct:       number        // 0..100+
  isMoney:   boolean
  hasTarget: boolean
}

export interface DailyStatRow {
  day:       number
  date:      Date
  isWeekend: boolean
  isFuture:  boolean
  isToday:   boolean
  appeals:   number
  leads:     number
  nv:        number
  fv:        number
  salesFV:   number
  revFV:     MoneyKGS
  bezNV:     number
  salesNV:   number
  revNV:     MoneyKGS
  avgFV:     MoneyKGS
  avgNV:     MoneyKGS
  delivery:  MoneyKGS
}

export interface DecompositionData {
  plan:       PlanData
  kpi:        KpiItem[]
  conversion: ConversionData
  summary:    SummaryRow[]
  daily:      DailyStatRow[]
}
