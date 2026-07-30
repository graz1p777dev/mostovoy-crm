// ─── HybridFinanceAdapter ─────────────────────────────────────────────────────
// Стратегия: сначала пробует реальные данные из Supabase.
// Если за период нет ни одной транзакции → полный fallback на Mock.
// Если данные частичные → real income + mock expenses для отсутствующих категорий.
// Архитектура не меняется: Repository видит только IFinanceAdapter.

import type { IFinanceAdapter, FinanceRaw, FinanceDayRaw } from '../../contracts/IFinanceAdapter'
import { SupabaseFinanceAdapter } from './SupabaseFinanceAdapter'
import { MockFinanceAdapter }     from './MockFinanceAdapter'

export class HybridFinanceAdapter implements IFinanceAdapter {
  private readonly supabase = new SupabaseFinanceAdapter()
  private readonly mock     = new MockFinanceAdapter()

  async fetchData(year: number, month: number): Promise<FinanceRaw> {
    let real: FinanceRaw

    try {
      real = await this.supabase.fetchData(year, month)
    } catch {
      // Ошибка сети / auth → чистый mock
      return this.mock.fetchData(year, month)
    }

    const hasAnyIncome = real.days.some(d => d.revenue > 0)

    // Нет реальных доходов → весь период на mock
    if (!hasAnyIncome) {
      return this.mock.fetchData(year, month)
    }

    // Есть реальные доходы: берём их, добавляем mock для отсутствующих расходов
    const mockRaw = await this.mock.fetchData(year, month)
    const mockMap = new Map(mockRaw.days.map(d => [d.date, d]))

    const merged: FinanceDayRaw[] = real.days.map(realDay => {
      const fallback = mockMap.get(realDay.date)

      // Реальные расходы по категориям (если 0, берём mock)
      const expPayroll   = realDay.expPayroll   > 0 ? realDay.expPayroll   : (fallback?.expPayroll   ?? 0)
      const expMarketing = realDay.expMarketing > 0 ? realDay.expMarketing : (fallback?.expMarketing ?? 0)
      const expRent      = realDay.expRent      > 0 ? realDay.expRent      : (fallback?.expRent      ?? 0)
      const expSupplies  = realDay.expSupplies  > 0 ? realDay.expSupplies  : (fallback?.expSupplies  ?? 0)
      const expOther     = realDay.expOther     > 0 ? realDay.expOther     : (fallback?.expOther     ?? 0)

      return {
        date:         realDay.date,
        revenue:      realDay.revenue,
        transactions: realDay.transactions,
        expPayroll,
        expMarketing,
        expRent,
        expSupplies,
        expOther,
      }
    })

    return { year, month, days: merged }
  }
}
