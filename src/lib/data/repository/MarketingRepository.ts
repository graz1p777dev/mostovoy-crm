// ─── MarketingRepository ──────────────────────────────────────────────────────

import type { IMarketingAdapter } from '../contracts/IMarketingAdapter'
import type { ICache } from '../contracts/ICache'
import type { MarketingData } from '@/lib/models/marketing'
import { MarketingMapper } from '../mappers/marketing.mapper'
import { SupabaseMarketingAdapter } from '../adapters/marketing/SupabaseMarketingAdapter'
import { globalCache } from '../cache/MemoryCache'

const TTL_MS = 60_000

export class MarketingRepository {
  constructor(
    private readonly adapter: IMarketingAdapter,
    private readonly cache:   ICache,
  ) {}

  async getData(year: number, month: number): Promise<MarketingData> {
    const key    = `marketing:${year}:${month}`
    const cached = this.cache.get<MarketingData>(key)
    if (cached) return cached

    const raw  = await this.adapter.fetchData(year, month)
    const data = MarketingMapper.map(raw)
    this.cache.set(key, data, TTL_MS)
    return data
  }

  invalidate(year: number, month: number): void {
    this.cache.invalidate(`marketing:${year}:${month}`)
  }
}

export const marketingRepository = new MarketingRepository(
  new SupabaseMarketingAdapter(),
  globalCache,
)
