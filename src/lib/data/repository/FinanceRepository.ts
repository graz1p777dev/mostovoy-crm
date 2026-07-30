// ─── FinanceRepository ────────────────────────────────────────────────────────

import type { IFinanceAdapter } from '../contracts/IFinanceAdapter'
import type { ICache } from '../contracts/ICache'
import type { FinanceData } from '@/lib/models/finance'
import { FinanceMapper } from '../mappers/finance.mapper'
import { HybridFinanceAdapter } from '../adapters/finance/HybridFinanceAdapter'
import { globalCache } from '../cache/MemoryCache'

const TTL_MS = 60_000

export class FinanceRepository {
  constructor(
    private readonly adapter: IFinanceAdapter,
    private readonly cache:   ICache,
  ) {}

  async getData(year: number, month: number): Promise<FinanceData> {
    const key    = `finance:${year}:${month}`
    const cached = this.cache.get<FinanceData>(key)
    if (cached) return cached

    const raw  = await this.adapter.fetchData(year, month)
    const data = FinanceMapper.map(raw)

    this.cache.set(key, data, TTL_MS)
    return data
  }
}

// Переключение: HybridAdapter (Supabase → Mock fallback) → MockAdapter → SupabaseAdapter
export const financeRepository = new FinanceRepository(new HybridFinanceAdapter(), globalCache)
