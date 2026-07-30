// ─── Service: Marketing Analytics ────────────────────────────────────────────
// Единственная точка входа для UI страницы /dashboard/marketing.

import type { MarketingData } from '@/lib/models/marketing'
import { marketingRepository } from '@/lib/data/repository/MarketingRepository'

export async function getMarketingData(
  year:  number,
  month: number,
): Promise<MarketingData> {
  return marketingRepository.getData(year, month)
}

export type { MarketingData }
