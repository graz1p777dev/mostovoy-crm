// ─── Model: Финансы ───────────────────────────────────────────────────────────
import type { PeriodMeta } from './common'

export interface FinanceDailyRow {
  day:       number
  date:      Date
  isWeekend: boolean
  isFuture:  boolean
  isToday:   boolean

  revenue:      number
  transactions: number
  avgCheck:     number

  expenses:     number
  expPayroll:   number
  expMarketing: number
  expRent:      number
  expSupplies:  number
  expOther:     number

  grossProfit: number
  netProfit:   number
  margin:      number

  cashIn:      number
  cashOut:     number
  cashBalance: number
}

export interface ExpenseBreakdown {
  payroll: number; marketing: number; rent: number; supplies: number; other: number
}

export interface FinanceKpi {
  period:            PeriodMeta
  totalRevenue:      number
  totalExpenses:     number
  totalProfit:       number
  avgMargin:         number
  totalTransactions: number
  avgCheck:          number
  totalCashIn:       number
  totalCashOut:      number
  expBreakdown:      ExpenseBreakdown
}

export interface FinanceData {
  kpi:   FinanceKpi
  daily: FinanceDailyRow[]
}
