// ─── DecompositionRepository ──────────────────────────────────────────────────
// Единственное место, где соединяются Adapter + Cache + Mapper.
// Repository не знает: откуда данные, как они считаются, где рендерятся.
//
// Замена источника данных (amoCRM вместо мока):
//   Строка 26: заменить MockDecompositionAdapter → AmoCrmDecompositionAdapter
//   Больше ничего не меняется.

import type { IDecompositionAdapter } from '../contracts/IDecompositionAdapter'
import type { ICache } from '../contracts/ICache'
import type { DecompositionData } from '@/lib/models/decomposition'
import { DecompositionMapper } from '../mappers/decomposition.mapper'
import { MockDecompositionAdapter } from '../adapters/decomposition/MockDecompositionAdapter'
import { globalCache } from '../cache/MemoryCache'

const TTL_MS = 60_000   // 1 минута

export class DecompositionRepository {
  constructor(
    private readonly adapter: IDecompositionAdapter,
    private readonly cache:   ICache,
  ) {}

  async getData(year: number, month: number): Promise<DecompositionData> {
    const key    = `decomposition:${year}:${month}`
    const cached = this.cache.get<DecompositionData>(key)
    if (cached) return cached

    const raw  = await this.adapter.fetchData(year, month)
    const data = DecompositionMapper.map(raw)

    this.cache.set(key, data, TTL_MS)
    return data
  }

  invalidate(year: number, month: number): void {
    this.cache.invalidate(`decomposition:${year}:${month}`)
  }
}

// ── Синглтон для использования в Service ─────────────────────────────────────
// Чтобы переключиться на реальный источник — заменить адаптер здесь:
//   import { AmoCrmDecompositionAdapter } from '../adapters/decomposition/AmoCrmDecompositionAdapter'
//   const adapter = new AmoCrmDecompositionAdapter()

const adapter = new MockDecompositionAdapter()

export const decompositionRepository = new DecompositionRepository(adapter, globalCache)
