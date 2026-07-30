// ─── Provider: KPI (чистые вычисления) ───────────────────────────────────────
// Ответственность: расчёт конверсий, средних чеков, % выполнения плана.
// НЕ источник данных — только математика поверх сырых данных.
// Используется в нескольких Services.

import type { MoneyKGS } from '@/lib/models/common'

export function calcPct(fact: number, base: number): number {
  if (base === 0) return 0
  return Math.round((fact / base) * 100)
}

export function calcDelta(fact: number, target: number): number {
  return fact - target
}

export function calcAvgCheck(revenue: MoneyKGS, sales: number): MoneyKGS {
  if (sales === 0) return 0
  return Math.round(revenue / sales)
}

export function calcMargin(revenue: MoneyKGS, cost: MoneyKGS): MoneyKGS {
  return revenue - cost
}

export function calcMarginPct(revenue: MoneyKGS, cost: MoneyKGS): number {
  if (revenue === 0) return 0
  return Math.round(((revenue - cost) / revenue) * 100)
}

export function calcPlanPct(fact: number, plan: number): number {
  if (plan === 0) return 0
  return Math.round((fact / plan) * 100)
}

export function calcRoas(revenue: MoneyKGS, spend: MoneyKGS): number {
  if (spend === 0) return 0
  return Math.round((revenue / spend) * 10) / 10
}

export function calcCpl(spend: MoneyKGS, leads: number): MoneyKGS {
  if (leads === 0) return 0
  return Math.round(spend / leads)
}
