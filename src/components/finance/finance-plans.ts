// ─── Плановые показатели: Финансы (Mock) ────────────────────────────────────

export interface FinancePlan {
  revenue:      number
  expenses:     number
  profit:       number
  margin:       number  // %
  transactions: number
  avgCheck:     number
  expPayroll:   number
  expMarketing: number
  expRent:      number
  expSupplies:  number
  expOther:     number
}

export const FINANCE_PLAN: FinancePlan = {
  revenue:      8_500_000,
  expenses:     5_200_000,
  profit:       3_300_000,
  margin:       38.8,
  transactions: 95,
  avgCheck:     89_474,
  expPayroll:   2_800_000,
  expMarketing:   250_000,
  expRent:        450_000,
  expSupplies:    900_000,
  expOther:       350_000,
  // итого expenses: 4_750_000 (уточнено)
}

export type MetricDir = 'higher' | 'lower'

export function getStatus(fact: number, plan: number, dir: MetricDir): 'green' | 'yellow' | 'red' | 'neutral' {
  if (plan === 0) return 'neutral'
  const ratio = dir === 'higher' ? fact / plan : plan / fact
  if (ratio >= 0.95) return 'green'
  if (ratio >= 0.70) return 'yellow'
  return 'red'
}

export const STATUS_COLOR = {
  green:   { text: 'var(--ok)', bg: 'var(--ok-tint)', border: 'var(--ok-border)' },
  yellow:  { text: 'var(--warn)', bg: 'var(--warn-tint)', border: 'var(--warn-border)' },
  red:     { text: 'var(--brand-ink)', bg: 'var(--bad-tint)', border: 'var(--bad-border)' },
  neutral: { text: 'var(--ink-25)', bg: 'var(--paper-2)', border: 'var(--line-soft)' },
}

export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' K'
  return n.toLocaleString('ru')
}

export function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K'
  return String(Math.round(n))
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

export function fmtNum(n: number): string {
  return n.toLocaleString('ru')
}
