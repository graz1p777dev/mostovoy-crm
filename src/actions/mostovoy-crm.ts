'use server'

// Состояние бота витрины для дашборда: сколько диалогов и сообщений, сколько
// ответов ИИ ждут подтверждения, сколько ошибок за сутки и во что обошёлся ИИ.
// Источники — GET /crm/developer/status и GET /crm/developer/usage витрины.

import { mostovoyFetch } from '@/lib/mostovoy-api'
import type {
  ShopAiUsage,
  ShopBotStatus,
  ShopConversationPatch,
  ShopCrmStatus,
  ShopInboxConversation,
  ShopInboxDetail,
} from '@/lib/models/mostovoy'

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

// ─── Единый inbox ────────────────────────────────────────────────────────────
// Диалоги живут на витрине: она владеет ботом, Telegram и amoCRM. CRM только
// показывает их и пишет обратно через админ-API — своей копии переписки нет.

export type ShopCrmResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ShopInboxData {
  conversations: ShopInboxConversation[]
  status: ShopCrmStatus
  usage: ShopAiUsage
}

/**
 * Всё, что нужно шапке страницы и списку слева, одним заходом.
 * Три запроса витрины дешёвые (SQLite, без внешних вызовов), поэтому этим же
 * действием клиент опрашивает витрину по таймеру.
 */
export async function getShopInbox(): Promise<ShopCrmResult<ShopInboxData>> {
  const [list, status, usage] = await Promise.all([
    mostovoyFetch<{ conversations: ShopInboxConversation[] }>('/crm/conversations'),
    mostovoyFetch<ShopCrmStatus>('/crm/status'),
    mostovoyFetch<ShopAiUsage>('/crm/developer/usage'),
  ])
  if (!list.ok) return { ok: false, error: list.error }
  if (!status.ok) return { ok: false, error: status.error }
  if (!usage.ok) return { ok: false, error: usage.error }
  return {
    ok: true,
    data: { conversations: list.data.conversations ?? [], status: status.data, usage: usage.data },
  }
}

/** Переписка одного диалога. Витрина на этом же запросе обнуляет unread_count. */
export async function getShopConversation(id: number): Promise<ShopCrmResult<ShopInboxDetail>> {
  const result = await mostovoyFetch<ShopInboxDetail>(`/crm/conversations/${id}`)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { conversation: result.data.conversation, messages: result.data.messages ?? [] } }
}

/**
 * Тумблер AI и заметка менеджера — это одна и та же ручка витрины.
 * Она принимает только aiEnabled / notes / status и возвращает диалог целиком.
 */
export async function updateShopConversation(
  id: number,
  patch: ShopConversationPatch
): Promise<ShopCrmResult<ShopInboxDetail>> {
  const result = await mostovoyFetch<ShopInboxDetail>(`/crm/conversations/${id}`, {
    method: 'PATCH',
    body: patch,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { conversation: result.data.conversation, messages: result.data.messages ?? [] } }
}

/**
 * Ручной ответ менеджера. Витрина сама доставляет его в Telegram или amoCRM,
 * поэтому ошибка доставки приходит её текстом — показываем дословно.
 */
export async function sendShopMessage(
  id: number,
  text: string
): Promise<ShopCrmResult<ShopInboxDetail>> {
  const value = text.trim()
  if (!value) return { ok: false, error: 'Сообщение пустое' }

  const result = await mostovoyFetch<ShopInboxDetail>(`/crm/conversations/${id}/messages`, {
    method: 'POST',
    body: { text: value.slice(0, 4000) },
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { conversation: result.data.conversation, messages: result.data.messages ?? [] } }
}
