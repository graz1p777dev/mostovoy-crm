// ─── MockFinanceAdapter ───────────────────────────────────────────────────────
// Детерминированные mock-данные для beauty-clinic в Бишкеке (KGS).
// Замена на Supabase: один файл, один new SupabaseFinanceAdapter() в Repository.

import type { IFinanceAdapter, FinanceRaw, FinanceDayRaw } from '../../contracts/IFinanceAdapter'

// Seed для детерминизма (по аналогии с MarketingAdapter)
const SEED = [
  0.72, 0.58, 0.83, 0.67, 0.91, 0.44, 0.38,
  0.79, 0.61, 0.85, 0.70, 0.55, 0.47, 0.52,
  0.88, 0.76, 0.63, 0.94, 0.69, 0.81, 0.57, 0.74,
  0.48, 0.66, 0.89, 0.75, 0.60, 0.43, 0.82, 0.71,
  0.56,
]

// Постоянные расходы в месяц (KGS)
const MONTHLY_PAYROLL   = 2_800_000
const MONTHLY_RENT      = 450_000
const MONTHLY_MARKETING = 250_000

// Базовая выручка за рабочий день
const BASE_REVENUE_MIN = 200_000
const BASE_REVENUE_MAX = 600_000

function isWeekend(date: Date): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

export class MockFinanceAdapter implements IFinanceAdapter {
  async fetchData(year: number, month: number): Promise<FinanceRaw> {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today       = new Date()
    const todayStr    = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

    // Считаем рабочие дни в месяце
    let workDays = 0
    for (let d = 1; d <= daysInMonth; d++) {
      if (!isWeekend(new Date(year, month, d))) workDays++
    }
    if (workDays === 0) workDays = 22

    const dailyPayroll   = Math.round(MONTHLY_PAYROLL   / workDays)
    const dailyRent      = Math.round(MONTHLY_RENT      / workDays)
    const dailyMarketing = Math.round(MONTHLY_MARKETING / workDays)

    const days: FinanceDayRaw[] = []

    for (let d = 1; d <= daysInMonth; d++) {
      const date    = new Date(year, month, d)
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const weekend = isWeekend(date)
      const future  = dateStr > todayStr && !(dateStr === todayStr)
      const seed    = SEED[(d - 1) % SEED.length]

      if (weekend) {
        // Выходные: нет операций (зарплата и аренда не начисляются)
        days.push({
          date: dateStr, revenue: 0, transactions: 0,
          expPayroll: 0, expMarketing: 0, expRent: 0, expSupplies: 0, expOther: 0,
        })
        continue
      }

      if (future) {
        days.push({
          date: dateStr, revenue: 0, transactions: 0,
          expPayroll: 0, expMarketing: 0, expRent: 0, expSupplies: 0, expOther: 0,
        })
        continue
      }

      const revenue = Math.round(BASE_REVENUE_MIN + seed * (BASE_REVENUE_MAX - BASE_REVENUE_MIN))
      const txns    = Math.round(2 + seed * 6)  // 2–8 сделок в день

      const expSupplies  = Math.round(revenue * 0.105)          // 10.5% от выручки
      const expOther     = Math.round(12_000 + seed * 8_000)    // 12K–20K в день
      const expMarketing = dateStr === todayStr
        ? Math.round(dailyMarketing * 0.7)
        : dailyMarketing

      days.push({
        date: dateStr,
        revenue,
        transactions: txns,
        expPayroll:   dailyPayroll,
        expMarketing,
        expRent:      dailyRent,
        expSupplies,
        expOther,
      })
    }

    return { year, month, days }
  }
}
