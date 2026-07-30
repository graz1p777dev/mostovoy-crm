// ─── SupabaseFinanceAdapter ───────────────────────────────────────────────────
// Получает реальные данные из таблиц finance_transactions + finance_categories.
// Вызывается из браузера (createBrowserClient), поэтому импортирует client.ts.
// RLS: пользователь должен иметь роль owner или accountant.

import { createClient } from '@/lib/supabase/client'
import type { IFinanceAdapter, FinanceRaw, FinanceDayRaw } from '../../contracts/IFinanceAdapter'

// Маппинг категорий БД → поля FinanceDayRaw
const CATEGORY_FIELD: Record<string, keyof Pick<FinanceDayRaw, 'expPayroll'|'expMarketing'|'expRent'|'expSupplies'|'expOther'>> = {
  'Зарплата':         'expPayroll',
  'Выплата инвестору':'expOther',
  'Аренда':           'expRent',
  'Коммунальные':     'expRent',
  'Маркетинг':        'expMarketing',
  'Доставка':         'expSupplies',
  'Прочее':           'expOther',
}

interface RawTransaction {
  id:          string
  type:        'income' | 'expense'
  amount:      number
  date:        string
  finance_categories: { name: string } | null
}

export class SupabaseFinanceAdapter implements IFinanceAdapter {
  async fetchData(year: number, month: number): Promise<FinanceRaw> {
    const supabase = createClient()

    const from      = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay   = new Date(year, month + 1, 0).getDate()
    const to        = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('finance_transactions')
      .select('id, type, amount, date, finance_categories(name)')
      .gte('date', from)
      .lte('date', to)
      .is('deleted_at', null)
      .order('date', { ascending: true })

    if (error || !data || data.length === 0) {
      // Нет данных в БД за этот период — возвращаем пустой массив
      // HybridAdapter решит, что делать дальше
      return { year, month, days: [] }
    }

    const txns = data as unknown as RawTransaction[]

    // Группируем по дате
    const byDate = new Map<string, FinanceDayRaw>()

    for (const tx of txns) {
      if (!byDate.has(tx.date)) {
        byDate.set(tx.date, {
          date: tx.date, revenue: 0, transactions: 0,
          expPayroll: 0, expMarketing: 0, expRent: 0, expSupplies: 0, expOther: 0,
        })
      }
      const day = byDate.get(tx.date)!
      const catName = tx.finance_categories?.name ?? ''

      if (tx.type === 'income') {
        day.revenue      += Number(tx.amount)
        day.transactions += 1
      } else {
        const field = CATEGORY_FIELD[catName] ?? 'expOther'
        day[field] += Number(tx.amount)
      }
    }

    // Заполняем все дни месяца (включая дни без транзакций)
    const days: FinanceDayRaw[] = []
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push(byDate.get(dateStr) ?? {
        date: dateStr, revenue: 0, transactions: 0,
        expPayroll: 0, expMarketing: 0, expRent: 0, expSupplies: 0, expOther: 0,
      })
    }

    return { year, month, days }
  }
}
