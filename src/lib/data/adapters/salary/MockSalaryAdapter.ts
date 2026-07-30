// ─── MockSalaryAdapter ────────────────────────────────────────────────────────

import type { ISalaryAdapter, SalaryRaw } from '../../contracts/ISalaryAdapter'

export class MockSalaryAdapter implements ISalaryAdapter {
  async fetchData(year: number, month: number): Promise<SalaryRaw> {
    return { year, month, rows: [] }
  }
}
