// ─── Contract: IMarketingAdapter ──────────────────────────────────────────────
// Реализации: MockMarketingAdapter → MetaAdsAdapter / AmoCrmMarketingAdapter

export interface MarketingDayRaw {
  date:            string   // 'yyyy-MM-dd'
  activeCampaigns: number
  impressions:     number
  reach:           number
  clicks:          number
  spend:           number
  appeals:         number
  appealsLM:       number
  leads:           number
  appointments:    number
  consultations:   number
  sales:           number
  revenue:         number
}

export interface MarketingRaw {
  year:  number
  month: number
  daily: MarketingDayRaw[]
}

export interface IMarketingAdapter {
  fetchData(year: number, month: number): Promise<MarketingRaw>
}
