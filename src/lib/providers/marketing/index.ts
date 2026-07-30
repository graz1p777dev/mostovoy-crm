// ─── Provider: Маркетинг ──────────────────────────────────────────────────────
// Ответственность: трафик по каналам, расходы на рекламу.
//
// Подключение (варианты):
//   A) Supabase таблица `marketing_expenses` + `lead_sources`
//   B) Meta Business API (Instagram / Facebook Ads)
//   C) Google Ads API
//   D) Ручной ввод через форму Settings
//
// Env (будущие): META_API_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN

import type { ISODateString, MoneyKGS } from '@/lib/models/common'
import type { LeadChannel } from '@/lib/models/marketing'

export interface MarketingSpendRaw {
  date:    ISODateString
  channel: LeadChannel
  spend:   MoneyKGS
  leads:   number
}

export async function fetchSpend(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<MarketingSpendRaw[]> {
  return []
}
