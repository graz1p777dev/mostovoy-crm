// ─── MockMarketingAdapter ─────────────────────────────────────────────────────
// Детерминированные тестовые данные для Marketing Analytics.
// Заменяется на MetaAdsAdapter / AmoCrmMarketingAdapter без изменения UI.

import type { IMarketingAdapter, MarketingRaw, MarketingDayRaw } from '../../contracts/IMarketingAdapter'

// Сид — базовые значения по дням (0 = нет данных / выходной)
const SEED = [
  62, 78, 85, 71, 90, 0, 0,   // нед 1
  68, 82, 95, 74, 88, 0, 0,   // нед 2
  75, 91, 103, 67, 86, 0, 0,  // нед 3
  79, 94, 88, 71, 93, 0, 0,   // нед 4
  85, 0, 0,                   // конец месяца
]

export class MockMarketingAdapter implements IMarketingAdapter {
  async fetchData(year: number, month: number): Promise<MarketingRaw> {
    const today       = new Date()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const pad         = (n: number) => String(n).padStart(2, '0')

    const daily: MarketingDayRaw[] = Array.from({ length: daysInMonth }, (_, i) => {
      const date    = new Date(year, month, i + 1)
      const isPast  = date <= today
      const s       = isPast ? (SEED[i] ?? 60) : 0

      if (s === 0) {
        return {
          date: `${year}-${pad(month + 1)}-${pad(i + 1)}`,
          activeCampaigns: 0, impressions: 0, reach: 0, clicks: 0,
          spend: 0, appeals: 0, appealsLM: 0, leads: 0,
          appointments: 0, consultations: 0, sales: 0, revenue: 0,
        }
      }

      const impressions = s * 180
      const reach       = Math.round(impressions * 0.72)
      const clicks      = Math.round(impressions * (0.018 + (s % 5) * 0.002))
      const spend       = Math.round(clicks * (28 + (s % 7) * 3))
      const appeals     = Math.round(clicks * 0.11)
      const appealsLM   = Math.round(appeals * 0.6)
      const leads       = Math.round(appeals * 0.38)
      const appointments= Math.round(leads * 0.7)
      const consultations= Math.round(appointments * 0.82)
      const sales       = Math.round(consultations * 0.58)
      const revenue     = sales * (82_000 + (s % 4) * 8_000)

      return {
        date: `${year}-${pad(month + 1)}-${pad(i + 1)}`,
        activeCampaigns: 3 + (s % 3),
        impressions, reach, clicks, spend,
        appeals, appealsLM, leads,
        appointments, consultations, sales, revenue,
      }
    })

    return { year, month, daily }
  }
}
