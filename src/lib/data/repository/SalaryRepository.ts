// ─── SalaryRepository ─────────────────────────────────────────────────────────

import type { ISalaryAdapter } from '../contracts/ISalaryAdapter'
import type { ICache } from '../contracts/ICache'
import type { SalaryData } from '@/lib/models/salary'
import { SalaryMapper } from '../mappers/salary.mapper'
import { MockSalaryAdapter } from '../adapters/salary/MockSalaryAdapter'
import { globalCache } from '../cache/MemoryCache'

const TTL_MS = 60_000

export class SalaryRepository {
  constructor(
    private readonly adapter: ISalaryAdapter,
    private readonly cache:   ICache,
  ) {}

  async getData(year: number, month: number): Promise<SalaryData> {
    const key    = `salary:${year}:${month}`
    const cached = this.cache.get<SalaryData>(key)
    if (cached) return cached

    const raw  = await this.adapter.fetchData(year, month)
    const data = SalaryMapper.map(raw)

    this.cache.set(key, data, TTL_MS)
    return data
  }
}

export const salaryRepository = new SalaryRepository(new MockSalaryAdapter(), globalCache)
