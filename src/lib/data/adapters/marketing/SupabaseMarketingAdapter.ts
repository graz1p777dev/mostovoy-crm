import { createClient } from '@/lib/supabase/client'
import type { IMarketingAdapter, MarketingDayRaw, MarketingRaw } from '../../contracts/IMarketingAdapter'

type MarketingRow = { date: string; active_campaigns: number; reach: number; clicks: number; budget: number; ad_appeals: number }
type ActivityRow = { date: string; appeals_fact: number | null; leads_fact: number | null; fv_fact: number | null; sales_fact: number | null; revenue_fact: number | null; nv_sales_fact: number | null; nv_revenue_fact: number | null }

export class SupabaseMarketingAdapter implements IMarketingAdapter {
  async fetchData(year: number, month: number): Promise<MarketingRaw> {
    const supabase = createClient()
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
    const [{ data: marketing }, { data: activity }] = await Promise.all([
      supabase.from('marketing_daily_data').select('date, active_campaigns, reach, clicks, budget, ad_appeals').gte('date', from).lte('date', to),
      supabase.from('daily_activity').select('date, appeals_fact, leads_fact, fv_fact, sales_fact, revenue_fact, nv_sales_fact, nv_revenue_fact').gte('date', from).lte('date', to),
    ])
    const byDate = new Map<string, MarketingDayRaw>()
    const getDay = (date: string) => {
      const existing = byDate.get(date)
      if (existing) return existing
      const created: MarketingDayRaw = { date, activeCampaigns: 0, impressions: 0, reach: 0, clicks: 0, spend: 0, appeals: 0, appealsLM: 0, leads: 0, appointments: 0, consultations: 0, sales: 0, revenue: 0 }
      byDate.set(date, created)
      return created
    }
    for (const row of (marketing ?? []) as MarketingRow[]) {
      const day = getDay(row.date)
      day.activeCampaigns += Number(row.active_campaigns) || 0
      day.reach += Number(row.reach) || 0
      day.impressions += Number(row.reach) || 0
      day.clicks += Number(row.clicks) || 0
      day.spend += Number(row.budget) || 0
      day.appeals += Number(row.ad_appeals) || 0
    }
    for (const row of (activity ?? []) as ActivityRow[]) {
      const day = getDay(row.date)
      const totalAppeals = Number(row.appeals_fact) || 0
      day.appealsLM += Math.max(totalAppeals - day.appeals, 0)
      day.leads += Number(row.leads_fact) || 0
      day.consultations += Number(row.fv_fact) || 0
      day.appointments += Number(row.fv_fact) || 0
      day.sales += (Number(row.sales_fact) || 0) + (Number(row.nv_sales_fact) || 0)
      day.revenue += (Number(row.revenue_fact) || 0) + (Number(row.nv_revenue_fact) || 0)
    }
    return { year, month, daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) }
  }
}
