'use server'

// Состояние бота витрины для дашборда: сколько диалогов и сообщений, сколько
// ответов ИИ ждут подтверждения, сколько ошибок за сутки и во что обошёлся ИИ.
// Источники — GET /crm/developer/status и GET /crm/developer/usage витрины.

import { mostovoyFetch } from '@/lib/mostovoy-api'
import type { ShopAiUsage, ShopBotStatus } from '@/lib/models/mostovoy'

export interface ShopBotOverview {
  status: ShopBotStatus
  usage: ShopAiUsage
}

export async function getShopBotOverview(): Promise<
  { ok: true; data: ShopBotOverview } | { ok: false; error: string }
> {
  const [status, usage] = await Promise.all([
    mostovoyFetch<ShopBotStatus>('/crm/developer/status'),
    mostovoyFetch<ShopAiUsage>('/crm/developer/usage'),
  ])
  if (!status.ok) return { ok: false, error: status.error }
  if (!usage.ok) return { ok: false, error: usage.error }
  return { ok: true, data: { status: status.data, usage: usage.data } }
}
