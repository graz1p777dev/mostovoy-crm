// ─── Provider: Финансы ────────────────────────────────────────────────────────
// Ответственность: расходы, доставка, Cash Flow.
//
// Подключение:
//   Supabase таблица `expenses`
//   SELECT date, amount, category, description
//   WHERE deleted_at IS NULL
//   AND date BETWEEN from AND to

import type { ISODateString, MoneyKGS } from '@/lib/models/common'

export type ExpenseCategoryCode =
  | 'delivery'
  | 'rent'
  | 'salary'
  | 'marketing'
  | 'supplies'
  | 'other'

export interface ExpenseRaw {
  id:          string
  date:        ISODateString
  amount:      MoneyKGS
  category:    ExpenseCategoryCode
  description: string
}

export interface FinanceDailyRaw {
  date:     ISODateString
  revenue:  MoneyKGS
  expenses: MoneyKGS
  delivery: MoneyKGS
}

export async function fetchExpenses(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ExpenseRaw[]> {
  return []
}

export async function fetchDailyFinance(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<FinanceDailyRaw[]> {
  return []
}
