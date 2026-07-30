// ─── FinanceMapper ────────────────────────────────────────────────────────────
// Только чистые функции: raw → model. Никаких side-эффектов.

import type { FinanceRaw, FinanceDayRaw } from '../contracts/IFinanceAdapter'
import type { FinanceData, FinanceDailyRow, FinanceKpi, ExpenseBreakdown } from '@/lib/models/finance'
import type { PeriodMeta } from '@/lib/models/common'

function buildPeriod(year: number, month: number, days: FinanceDayRaw[]): PeriodMeta {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today       = new Date()
  const todayMonth  = today.getMonth()
  const todayYear   = today.getFullYear()
  const todayDay    = today.getDate()

  const isCurrentMonth = year === todayYear && month === todayMonth
  const isPast         = year < todayYear || (year === todayYear && month < todayMonth)

  const workDays   = days.filter(d => d.expPayroll > 0).length || 22
  const daysPassed = isPast ? daysInMonth
                   : isCurrentMonth ? Math.min(todayDay, daysInMonth)
                   : 0
  const progressPct = Math.round((daysPassed / daysInMonth) * 100)
  const status      = isPast ? 'done' : isCurrentMonth ? 'active' : 'future'

  return { year, month, daysInMonth, workDays, daysPassed, progressPct, status }
}

function mapDay(raw: FinanceDayRaw, period: PeriodMeta, cumulativeCash: number): FinanceDailyRow {
  const [y, m, d] = raw.date.split('-').map(Number)
  const date       = new Date(y, m - 1, d)
  const dayOfWeek  = date.getDay()
  const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6

  const today    = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const isToday  = raw.date === todayStr
  const isFuture = raw.date > todayStr

  const expenses   = raw.expPayroll + raw.expMarketing + raw.expRent + raw.expSupplies + raw.expOther
  const grossProfit = raw.revenue - raw.expSupplies
  const netProfit   = raw.revenue - expenses
  const margin      = raw.revenue === 0 ? 0 : Math.round((netProfit / raw.revenue) * 1000) / 10

  const cashIn      = raw.revenue
  const cashOut     = expenses
  const cashBalance = cumulativeCash + cashIn - cashOut

  return {
    day: d,
    date,
    isWeekend,
    isFuture,
    isToday,
    revenue:      raw.revenue,
    transactions: raw.transactions,
    avgCheck:     raw.transactions > 0 ? Math.round(raw.revenue / raw.transactions) : 0,
    expenses,
    expPayroll:   raw.expPayroll,
    expMarketing: raw.expMarketing,
    expRent:      raw.expRent,
    expSupplies:  raw.expSupplies,
    expOther:     raw.expOther,
    grossProfit,
    netProfit,
    margin,
    cashIn,
    cashOut,
    cashBalance,
  }
}

function buildKpi(period: PeriodMeta, rows: FinanceDailyRow[]): FinanceKpi {
  const past = rows.filter(r => !r.isFuture && !r.isWeekend)

  const totalRevenue      = past.reduce((s, r) => s + r.revenue,      0)
  const totalExpenses     = past.reduce((s, r) => s + r.expenses,     0)
  const totalProfit       = past.reduce((s, r) => s + r.netProfit,    0)
  const totalTransactions = past.reduce((s, r) => s + r.transactions, 0)
  const totalCashIn       = past.reduce((s, r) => s + r.cashIn,       0)
  const totalCashOut      = past.reduce((s, r) => s + r.cashOut,      0)

  const avgMargin = totalRevenue === 0 ? 0
    : Math.round((totalProfit / totalRevenue) * 1000) / 10
  const avgCheck  = totalTransactions === 0 ? 0
    : Math.round(totalRevenue / totalTransactions)

  const expBreakdown: ExpenseBreakdown = {
    payroll:   past.reduce((s, r) => s + r.expPayroll,   0),
    marketing: past.reduce((s, r) => s + r.expMarketing, 0),
    rent:      past.reduce((s, r) => s + r.expRent,      0),
    supplies:  past.reduce((s, r) => s + r.expSupplies,  0),
    other:     past.reduce((s, r) => s + r.expOther,     0),
  }

  return {
    period, totalRevenue, totalExpenses, totalProfit, avgMargin,
    totalTransactions, avgCheck, totalCashIn, totalCashOut, expBreakdown,
  }
}

export const FinanceMapper = {
  map(raw: FinanceRaw): FinanceData {
    const period = buildPeriod(raw.year, raw.month, raw.days)

    let cum = 0
    const daily: FinanceDailyRow[] = raw.days.map(r => {
      const row = mapDay(r, period, cum)
      cum = row.cashBalance
      return row
    })

    const kpi = buildKpi(period, daily)
    return { kpi, daily }
  },
}
