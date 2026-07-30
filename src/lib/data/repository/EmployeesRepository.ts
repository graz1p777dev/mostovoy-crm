// ─── EmployeesRepository ─────────────────────────────────────────────────────

import type { IEmployeesAdapter } from '../contracts/IEmployeesAdapter'
import type { ICache }             from '../contracts/ICache'
import type { EmployeesData }      from '@/lib/models/employees'
import { EmployeesMapper }         from '../mappers/employees.mapper'
import { SupabaseEmployeesAdapter }from '../adapters/employees/SupabaseEmployeesAdapter'
import { globalCache }             from '../cache/MemoryCache'

const TTL_MS = 60_000

export class EmployeesRepository {
  constructor(
    private readonly adapter: IEmployeesAdapter,
    private readonly cache:   ICache,
  ) {}

  async getData(year: number, month: number): Promise<EmployeesData> {
    const key    = `employees:${year}:${month}`
    const cached = this.cache.get<EmployeesData>(key)
    if (cached) return cached

    const raw  = await this.adapter.fetchData(year, month)
    const data = EmployeesMapper.map(raw)

    this.cache.set(key, data, TTL_MS)
    return data
  }
}

export const employeesRepository = new EmployeesRepository(
  new SupabaseEmployeesAdapter(),
  globalCache,
)
