// ─── Service: Финансы ─────────────────────────────────────────────────────────
import type { FinanceData } from '@/lib/models/finance'
import { financeRepository } from '@/lib/data/repository/FinanceRepository'

export async function getFinanceData(year: number, month: number): Promise<FinanceData> {
  return financeRepository.getData(year, month)
}
