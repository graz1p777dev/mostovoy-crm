// ─── Источник: Товароучёт ─────────────────────────────────────────────────────
// Отсюда в будущем будут приходить:
//   - Продажи после ФВ (salesFV) — количество закрытых сделок
//   - Выручка после ФВ (revFV)   — сумма продаж через ФВ
//   - Продажи без НВ (salesNV)   — продажи по каналу без НВ
//   - Выручка без НВ (revNV)
//   - Себестоимость (для расчёта маржи — в будущем)
//
// Подключение: Supabase таблица `consultations` + будущая таблица `orders`
//   SELECT date, amount, is_nv, status_after_fv
//   WHERE status_after_fv IN ('Купила', 'Предоплата')
//   AND deleted_at IS NULL

export interface WarehouseDailyMetrics {
  date: string   // 'yyyy-MM-dd'
  salesFV: number
  revFV: number
  salesNV: number
  revNV: number
}

// Заглушка — будет заменена на Server Action getWarehouseMetrics()
export async function fetchWarehouseMetrics(
  _year: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<WarehouseDailyMetrics[]> {
  return []
}
