'use server'

// «Ответы бота» — human in the loop витрины «МОСТОВОЙ».
// Пока в настройках бота включено «Подтверждать ответы перед отправкой»,
// каждый черновик ИИ ложится в очередь и уходит клиенту только после того,
// как менеджер его подтвердил (при желании отредактировав) или отклонил.
//
// Очередь живёт в SQLite магазина, своей копии в CRM нет. Админ-токен
// добавляется в mostovoyFetch на сервере и в браузер не попадает.

import { mostovoyFetch } from '@/lib/mostovoy-api'
import type {
  ShopApproval,
  ShopApprovalFilter,
  ShopBotStatus,
} from '@/lib/models/mostovoy'

export type ShopApprovalsResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ShopApprovalsData {
  approvals: ShopApproval[]
  /** Счётчики по всей очереди — не по текущему фильтру. */
  counters: ShopBotStatus['approvals']
  /**
   * Выключенное подтверждение — не сбой, а режим: бот отвечает сразу и очередь
   * остаётся пустой. Страница должна сказать это вслух, а не показывать
   * загадочный пустой список.
   */
  approvalEnabled: boolean
  /** Без ключа провайдера ИИ черновиков тоже не будет. */
  aiEnabled: boolean
  model: string
}

/**
 * Очередь и её состояние одним заходом: два дешёвых SELECT-а по SQLite,
 * поэтому этим же действием клиент опрашивает витрину по таймеру.
 */
export async function getShopApprovals(
  status: ShopApprovalFilter = 'pending'
): Promise<ShopApprovalsResult<ShopApprovalsData>> {
  const [list, botStatus] = await Promise.all([
    mostovoyFetch<{ approvals: ShopApproval[] }>(`/crm/approvals?status=${status}`),
    mostovoyFetch<ShopBotStatus>('/crm/developer/status'),
  ])
  if (!list.ok) return { ok: false, error: list.error }
  if (!botStatus.ok) return { ok: false, error: botStatus.error }

  return {
    ok: true,
    data: {
      approvals: list.data.approvals ?? [],
      counters: botStatus.data.approvals,
      approvalEnabled: botStatus.data.settings.approvalEnabled,
      aiEnabled: botStatus.data.enabled,
      model: botStatus.data.settings.model,
    },
  }
}

/**
 * Подтверждение: витрина сама доставляет текст в Telegram или amoCRM и
 * складывает пример в обучающую выборку. Пустой text = отправить черновик
 * как есть; отредактированный сохраняется в edited_reply.
 */
export async function approveShopReply(
  id: number,
  text: string
): Promise<ShopApprovalsResult<ShopApproval>> {
  const value = text.trim()
  if (!value) return { ok: false, error: 'Ответ пустой' }

  const result = await mostovoyFetch<{ approval: ShopApproval }>(
    `/crm/approvals/${id}/approve`,
    { method: 'POST', body: { text: value.slice(0, 4000) } }
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: result.data.approval }
}

/**
 * Отклонение. Причина обязательна: витрина её требует и использует для
 * обучения — при включённом «агрессивном обучении» она правит системный промпт.
 */
export async function rejectShopReply(
  id: number,
  reason: string
): Promise<ShopApprovalsResult<ShopApproval>> {
  const value = reason.trim()
  if (!value) return { ok: false, error: 'Укажите причину отклонения' }

  const result = await mostovoyFetch<{ approval: ShopApproval }>(
    `/crm/approvals/${id}/reject`,
    { method: 'POST', body: { reason: value.slice(0, 2000) } }
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: result.data.approval }
}
