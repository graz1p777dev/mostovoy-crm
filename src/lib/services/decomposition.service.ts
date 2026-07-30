// ─── Service: Декомпозиция ────────────────────────────────────────────────────
// Единственная точка входа для UI страницы /dashboard/decomposition.
// Service НЕ обращается к источникам данных напрямую —
// он делегирует в DecompositionRepository, который управляет
// Adapter + Cache + Mapper.
//
// Цепочка:
//   Service → Repository → (Cache | Adapter) → Mapper → DecompositionData

import type { DecompositionData } from '@/lib/models/decomposition'
import { decompositionRepository } from '@/lib/data/repository/DecompositionRepository'

export async function getDecompositionData(
  year:  number,
  month: number,
): Promise<DecompositionData> {
  return decompositionRepository.getData(year, month)
}

export type { DecompositionData }
