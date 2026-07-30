// ─── DecompositionService — единая точка входа ────────────────────────────────
// UI всегда вызывает только этот файл.
// Здесь принимается решение: мок или реальные источники.
//
// Шаг 2 (текущий): возвращает getMockDecompositionData
// Шаг 3 (следующий): заменить тело getDecompositionData на реальные вызовы:
//
//   const [amo, records, warehouse, finance] = await Promise.all([
//     fetchAmoCrmMetrics(year, month),
//     fetchRecordsMetrics(year, month),
//     fetchWarehouseMetrics(year, month),
//     fetchFinanceMetrics(year, month),
//   ])
//   return aggregateDecompositionData({ amo, records, warehouse, finance, plan })

import type { DecompositionData } from './types'
import { getMockDecompositionData } from './mock/provider'

export async function getDecompositionData(
  year: number,
  month: number,
): Promise<DecompositionData> {
  // TODO Шаг 3: заменить на реальные источники
  return getMockDecompositionData(year, month)
}
