// ─── Источник: Финансы ────────────────────────────────────────────────────────
// Отсюда в будущем будут приходить:
//   - Расходы на доставку (delivery) — из таблицы `expenses`
//   - Общие расходы, Cash Flow — для модуля Финансы
//
// Подключение: Supabase таблица `expenses`
//   SELECT date, amount, category
//   WHERE category = 'delivery'
//   AND date BETWEEN period_start AND period_end
//   AND deleted_at IS NULL

export interface FinanceDailyMetrics {
  date: string   // 'yyyy-MM-dd'
  delivery: number
}

// Заглушка — будет заменена на Server Action getFinanceMetrics()
export async function fetchFinanceMetrics(
  _year: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<FinanceDailyMetrics[]> {
  return []
}
