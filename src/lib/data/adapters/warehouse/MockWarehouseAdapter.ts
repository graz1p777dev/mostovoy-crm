// ─── MockWarehouseAdapter ─────────────────────────────────────────────────────

import type { IWarehouseAdapter, WarehouseRaw } from '../../contracts/IWarehouseAdapter'

export class MockWarehouseAdapter implements IWarehouseAdapter {
  async fetchData(year: number, month: number): Promise<WarehouseRaw> {
    return { year, month, daily: [], products: [] }
  }
}
