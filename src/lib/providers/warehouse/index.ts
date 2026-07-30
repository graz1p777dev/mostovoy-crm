// ─── Provider: Товароучёт ─────────────────────────────────────────────────────
// Ответственность: продажи, выручка, себестоимость, остатки.
//
// Подключение (вариант A — Supabase):
//   Таблицы: `orders`, `order_items`, `products`, `stock_movements`
//   Клиент: createAdminClient()
//
// Подключение (вариант B — внешняя система):
//   Env: WAREHOUSE_API_URL, WAREHOUSE_API_KEY

import type { ISODateString, MoneyKGS } from '@/lib/models/common'

export interface WarehouseSaleDailyRaw {
  date:      ISODateString
  salesFV:   number       // продаж после ФВ
  revFV:     MoneyKGS     // выручка после ФВ
  salesNV:   number       // продаж без НВ
  revNV:     MoneyKGS     // выручка без НВ
  costFV:    MoneyKGS     // себестоимость ФВ-продаж
  costNV:    MoneyKGS
}

export interface ProductStockRaw {
  id:        string
  name:      string
  sku:       string
  stock:     number
  costPrice: MoneyKGS
}

export async function fetchDailySales(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<WarehouseSaleDailyRaw[]> {
  return []
}

export async function fetchProductStock(): Promise<ProductStockRaw[]> {
  return []
}
