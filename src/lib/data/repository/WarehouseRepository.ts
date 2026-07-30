// ─── WarehouseRepository ──────────────────────────────────────────────────────

import type { IWarehouseAdapter } from '../contracts/IWarehouseAdapter'
import type { ICache } from '../contracts/ICache'
import type { WarehouseData } from '@/lib/models/warehouse'
import { WarehouseMapper } from '../mappers/warehouse.mapper'
import { MockWarehouseAdapter } from '../adapters/warehouse/MockWarehouseAdapter'
import { globalCache } from '../cache/MemoryCache'

const TTL_MS = 60_000

export class WarehouseRepository {
  constructor(
    private readonly adapter: IWarehouseAdapter,
    private readonly cache:   ICache,
  ) {}

  async getData(year: number, month: number): Promise<WarehouseData> {
    const key    = `warehouse:${year}:${month}`
    const cached = this.cache.get<WarehouseData>(key)
    if (cached) return cached

    const raw  = await this.adapter.fetchData(year, month)
    const data = WarehouseMapper.map(raw)

    this.cache.set(key, data, TTL_MS)
    return data
  }
}

export const warehouseRepository = new WarehouseRepository(new MockWarehouseAdapter(), globalCache)
