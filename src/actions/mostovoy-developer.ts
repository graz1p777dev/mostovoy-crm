'use server'

// Инструменты разработчика витрины «МОСТОВОЙ»: диагностика бота, журнал
// прохождения сообщений, расход ИИ и песочница.
//
// Раньше эти три страницы CRM ходили в отдельный FastAPI-бэкенд, которого у
// этого деплоя нет, — теперь источник тот же, что у диалогов: админ-API
// магазина. Токен добавляется на сервере и в браузер не попадает.

import { mostovoyFetch } from '@/lib/mostovoy-api'
import type {
  ShopAiUsage,
  ShopBotEvent,
  ShopBotStatus,
  ShopLabReply,
} from '@/lib/models/mostovoy'

export type ShopDeveloperResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ShopBotDiagnostics {
  status: ShopBotStatus
  usage: ShopAiUsage
}

/** Состояние бота + расход ИИ: обе ручки — SELECT по SQLite, идут параллельно. */
export async function getShopBotDiagnostics(): Promise<ShopDeveloperResult<ShopBotDiagnostics>> {
  const [status, usage] = await Promise.all([
    mostovoyFetch<ShopBotStatus>('/crm/developer/status'),
    mostovoyFetch<ShopAiUsage>('/crm/developer/usage'),
  ])
  if (!status.ok) return { ok: false, error: status.error }
  if (!usage.ok) return { ok: false, error: usage.error }
  return { ok: true, data: { status: status.data, usage: { ...usage.data, tasks: usage.data.tasks ?? [] } } }
}

/** Журнал бота. level = 'error' оставляет только ошибки, витрина режет limit до 500. */
export async function getShopBotEvents(
  level: 'all' | 'error' = 'all',
  limit = 150
): Promise<ShopDeveloperResult<ShopBotEvent[]>> {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit) || 150))
  const query = level === 'error' ? `?level=error&limit=${safeLimit}` : `?limit=${safeLimit}`
  const result = await mostovoyFetch<{ events: ShopBotEvent[] }>(`/crm/developer/events${query}`)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: result.data.events ?? [] }
}

export interface ShopLabInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  model?: string
  /** Черновики промптов: витрина накладывает их поверх сохранённых настроек. */
  prompts?: {
    systemPrompt?: string
    characterPrompt?: string
    rulesPrompt?: string
    taskPrompt?: string
  }
}

/**
 * Песочница: витрина зовёт модель и возвращает ответ, никуда его не отправляя
 * и не создавая диалог. Расход при этом всё же попадает в ai_usage — там он
 * помечен задачей laboratory.
 */
export async function runShopBotLab(
  input: ShopLabInput
): Promise<ShopDeveloperResult<ShopLabReply>> {
  const message = input.message.trim()
  if (!message) return { ok: false, error: 'Введите сообщение тестового клиента' }

  const result = await mostovoyFetch<ShopLabReply>('/crm/developer/lab', {
    method: 'POST',
    body: {
      message: message.slice(0, 4000),
      history: input.history.slice(-20),
      model: input.model,
      prompts: input.prompts ?? {},
    },
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: result.data }
}
