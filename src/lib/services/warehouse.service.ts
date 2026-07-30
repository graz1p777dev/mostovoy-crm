// ─── Service: Товароучёт ──────────────────────────────────────────────────────
// Агрегирует данные из Warehouse Provider.
//
// Поток данных:
//   Warehouse Provider → продажи, себестоимость, остатки
//   KPI Provider       → маржа, % выполнения
//         ↓
//   WarehouseData → UI (/dashboard/warehouse — будущий Sprint)

import type { WarehouseData } from '@/lib/models/warehouse'
import { calcMargin, calcMarginPct } from '@/lib/providers/kpi'

export async function getWarehouseData(
  year:  number,
  month: number,
): Promise<WarehouseData> {
  void year; void month
  // TODO Шаг 6:
  // const { from, to } = periodRange(year, month)
  // const [sales, products] = await Promise.all([
  //   warehouseProvider.fetchDailySales(from, to),
  //   warehouseProvider.fetchProductStock(),
  // ])
  // return aggregateWarehouseData(sales, products)
  void calcMargin
  void calcMarginPct
  return { kpi: { totalRevenue: 0, totalCost: 0, totalMargin: 0, marginPct: 0, totalSold: 0, lowStockCount: 0 }, products: [], movements: [] }
}
