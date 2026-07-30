'use server'

// Настройки бота витрины «МОСТОВОЙ»: GET/PUT /api/admin/crm/settings.
// Бот и его промпты живут в магазине (Express + SQLite), CRM ими только
// управляет — как товарами и постами. Админ-токен добавляется в mostovoyFetch
// на сервере и в браузер не попадает.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { mostovoyFetch } from '@/lib/mostovoy-api'
import {
  SHOP_BOT_PROMPT_LIMITS,
  type ShopBotPromptField,
  type ShopBotSettings,
  type ShopBotSettingsInput,
} from '@/lib/models/mostovoy'

const PAGE = '/dashboard/bot-settings'

export async function getShopBotSettings(): Promise<
  { ok: true; data: ShopBotSettings } | { ok: false; error: string }
> {
  const result = await mostovoyFetch<ShopBotSettings>('/crm/settings')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { ...result.data, models: result.data.models ?? [] } }
}

// Витрина сама режет промпты по лимиту и молча игнорирует неизвестную модель —
// здесь ловим то же самое заранее, чтобы пользователь увидел причину, а не
// «сохранилось, но не то».
const SettingsSchema = z.object({
  approvalEnabled: z.boolean(),
  aggressiveLearning: z.boolean(),
  model: z.string().trim().min(1, 'Выберите модель'),
  systemPrompt: z.string().max(SHOP_BOT_PROMPT_LIMITS.systemPrompt, 'Системный промпт длиннее 16000 символов'),
  hypervisorPrompt: z.string().max(SHOP_BOT_PROMPT_LIMITS.hypervisorPrompt, 'Промпт гипервизора длиннее 8000 символов'),
  characterPrompt: z.string().max(SHOP_BOT_PROMPT_LIMITS.characterPrompt, 'Промпт характера длиннее 8000 символов'),
  rulesPrompt: z.string().max(SHOP_BOT_PROMPT_LIMITS.rulesPrompt, 'Промпт правил длиннее 8000 символов'),
  taskPrompt: z.string().max(SHOP_BOT_PROMPT_LIMITS.taskPrompt, 'Промпт задачи длиннее 8000 символов'),
})

const PROMPT_LABELS: Record<ShopBotPromptField, string> = {
  systemPrompt: 'Системный промпт',
  hypervisorPrompt: 'Промпт гипервизора',
  characterPrompt: 'Промпт характера',
  rulesPrompt: 'Промпт правил',
  taskPrompt: 'Промпт задачи',
}

export type SaveBotSettingsResult =
  | {
      success: true
      /** Ответ PUT — это перечитанное состояние из SQLite витрины, не эхо запроса. */
      data: ShopBotSettings
      /** Расхождения «отправили → сохранилось»: витрина правит тихо, мы говорим вслух. */
      warnings: string[]
    }
  | { success: false; error: string }

export async function saveShopBotSettings(
  input: ShopBotSettingsInput
): Promise<SaveBotSettingsResult> {
  const parsed = SettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }

  const result = await mostovoyFetch<ShopBotSettings>('/crm/settings', {
    method: 'PUT',
    body: parsed.data,
  })
  if (!result.ok) return { success: false, error: result.error }

  const saved: ShopBotSettings = { ...result.data, models: result.data.models ?? [] }
  const warnings: string[] = []

  if (saved.model !== parsed.data.model) {
    warnings.push(`Витрина не приняла модель «${parsed.data.model}» и оставила «${saved.model}»`)
  }
  for (const field of Object.keys(PROMPT_LABELS) as ShopBotPromptField[]) {
    const sent = parsed.data[field].trim()
    if (sent === '' && saved[field] !== '') {
      warnings.push(`${PROMPT_LABELS[field]}: поле было пустым — витрина подставила промпт по умолчанию`)
    } else if (sent !== '' && saved[field] !== sent) {
      warnings.push(`${PROMPT_LABELS[field]}: витрина сохранила другой текст (обрезала по лимиту)`)
    }
  }

  revalidatePath(PAGE)
  return { success: true, data: saved, warnings }
}
