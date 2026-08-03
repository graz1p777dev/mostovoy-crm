'use server'

// Воронка продаж. Сделки живут в Supabase (036_deals.sql), переписка — во
// внешних системах: диалоги витрины «МОСТОВОЙ» (Express + SQLite) и
// whatsapp_messages от Wazzup. Здесь только чтение переписки, вести её
// продолжают там же, где начали.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mostovoyFetch, isMostovoyConfigured } from '@/lib/mostovoy-api'
import { upsertDealFromInbound } from '@/lib/deals/auto-create'
import type {
  Deal,
  DealEmployee,
  DealMessage,
  DealSource,
  DealStage,
  DealViewer,
} from '@/types'

export type DealActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ─── Текущий сотрудник ───────────────────────────────────────────────────────

async function getViewer(): Promise<DealViewer | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data } = await supabase
    .from('employees')
    .select('id, role, name')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  return (data as DealViewer | null) ?? null
}

// ─── Данные для доски ────────────────────────────────────────────────────────

export interface DealsData {
  stages: DealStage[]
  deals: Deal[]
  employees: DealEmployee[]
  me: DealViewer | null
}

export async function getDealsData(): Promise<DealsData> {
  const me = await getViewer()
  if (!me) return { stages: [], deals: [], employees: [], me: null }

  const supabase = await createClient()
  const admin = createAdminClient()

  // deal_stages/deals — через RLS-клиент: какие сделки видны, решает БД.
  // employees — через admin: имена нужны для пикера ответственного.
  const [{ data: stages }, { data: deals }, { data: emps }] = await Promise.all([
    supabase
      .from('deal_stages')
      .select('id, name, sort_order, kind, color, is_default')
      .order('sort_order'),
    supabase
      .from('deals')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    admin
      .from('employees')
      .select('id, name, avatar_url')
      .is('deleted_at', null)
      .order('name'),
  ])

  return {
    stages: (stages ?? []) as DealStage[],
    deals: (deals ?? []) as Deal[],
    employees: (emps ?? []) as DealEmployee[],
    me,
  }
}

export async function getOrdersData(): Promise<DealsData> {
  const data = await getDealsData()
  return {
    ...data,
    deals: data.deals.filter((deal) => deal.note?.startsWith('[ORDER]')),
  }
}

// ─── Форма сделки ────────────────────────────────────────────────────────────

const DealSchema = z.object({
  title: z.string().trim().min(1, 'Введите название сделки').max(300, 'Слишком длинное название'),
  stage_id: z.string().uuid('Выберите этап'),
  amount: z.number().nonnegative('Сумма не может быть отрицательной').nullable().optional(),
  currency: z.enum(['KGS', 'USD', 'RUB']).default('KGS'),
  order_type: z.enum(['standard', 'installment', 'trade_in']).default('standard'),
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
  customer_username: z.string().nullable().optional(),
  responsible_employee_id: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
})

export type DealFormData = z.input<typeof DealSchema>

const clean = (value: string | null | undefined) => value?.trim() || null

export async function createDeal(input: DealFormData): Promise<DealActionResult<{ id: string }>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const parsed = DealSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }
  const d = parsed.data
  const supabase = await createClient()

  const { data: created, error } = await supabase
    .from('deals')
    .insert({
      title: d.title,
      stage_id: d.stage_id,
      amount: d.amount ?? null,
      currency: d.currency,
      order_type: d.order_type,
      customer_name: clean(d.customer_name),
      customer_phone: clean(d.customer_phone),
      customer_username: clean(d.customer_username),
      source: 'manual' satisfies DealSource,
      responsible_employee_id: d.responsible_employee_id ?? null,
      note: clean(d.note),
    })
    .select('id')
    .single()

  if (error || !created) {
    return { success: false, error: error?.message ?? 'Не удалось создать сделку' }
  }

  revalidatePath('/dashboard/deals')
  return { success: true, data: { id: (created as { id: string }).id } }
}

export async function updateDeal(id: string, input: DealFormData): Promise<DealActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const parsed = DealSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }
  const d = parsed.data
  const supabase = await createClient()

  // status и stage_changed_at проставляет триггер БД — здесь их не трогаем.
  const { data: updated, error } = await supabase
    .from('deals')
    .update({
      title: d.title,
      stage_id: d.stage_id,
      amount: d.amount ?? null,
      currency: d.currency,
      order_type: d.order_type,
      customer_name: clean(d.customer_name),
      customer_phone: clean(d.customer_phone),
      customer_username: clean(d.customer_username),
      responsible_employee_id: d.responsible_employee_id ?? null,
      note: clean(d.note),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!updated || updated.length === 0) return { success: false, error: 'Сделка недоступна' }

  revalidatePath('/dashboard/deals')
  return { success: true }
}

/** Перенос карточки между колонками. deal_events пишет триггер БД. */
export async function moveDeal(dealId: string, stageId: string): Promise<DealActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deals')
    .update({ stage_id: stageId })
    .eq('id', dealId)
    .is('deleted_at', null)
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) return { success: false, error: 'Недостаточно прав' }

  revalidatePath('/dashboard/deals')
  return { success: true }
}

/** Мягкое удаление — история переходов в deal_events остаётся. */
export async function deleteDeal(id: string): Promise<DealActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) return { success: false, error: 'Сделка недоступна' }

  revalidatePath('/dashboard/deals')
  return { success: true }
}

// ─── Сверка с витриной ───────────────────────────────────────────────────────

/** Диалог витрины в ответе GET /api/admin/crm/conversations. */
interface ShopConversation {
  id: number
  externalKey: string | null
  source: string
  customerName: string | null
  customerUsername: string | null
  customerPhone: string | null
}

interface ShopMessage {
  id: number
  direction: string
  text: string
  createdAt: string
}

// В воронке нет канала «amocrm»: через amoCRM у этого магазина приходят
// WhatsApp и Instagram, неопознанный origin считаем WhatsApp.
function shopSource(source: string): DealSource {
  if (source === 'telegram') return 'telegram'
  if (source === 'instagram') return 'instagram'
  return 'whatsapp'
}

/**
 * Страховка на случай, если push от витрины не дошёл (CRM перезапускалась,
 * сеть моргнула): проходим по всем диалогам витрины и заводим недостающие
 * сделки. Идемпотентно — существующие не трогаем.
 */
export async function reconcileDealsFromShop(): Promise<
  DealActionResult<{ created: number; checked: number }>
> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }
  if (!isMostovoyConfigured()) {
    return { success: false, error: 'Интеграция с витриной не настроена' }
  }

  const result = await mostovoyFetch<{ conversations: ShopConversation[] }>('/crm/conversations')
  if (!result.ok) return { success: false, error: result.error }

  const conversations = result.data.conversations ?? []
  let created = 0
  for (const conversation of conversations) {
    if (!conversation.externalKey) continue
    const upsert = await upsertDealFromInbound({
      externalKey: conversation.externalKey,
      source: shopSource(conversation.source),
      customerName: conversation.customerName,
      customerPhone: conversation.customerPhone,
      customerUsername: conversation.customerUsername,
    })
    if (upsert.created) created += 1
  }

  revalidatePath('/dashboard/deals')
  return { success: true, data: { created, checked: conversations.length } }
}

// ─── Переписка по сделке ─────────────────────────────────────────────────────

export interface DealConversation {
  messages: DealMessage[]
  /** Почему переписки нет — показываем вместо пустоты. */
  note: string | null
  aiEnabled: boolean | null
}

/**
 * Читаемая расшифровка диалога: для сделок с витрины — её диалог,
 * для сделок Wazzup — whatsapp_messages. Только чтение.
 */
export async function getDealConversation(dealId: string): Promise<DealConversation> {
  const me = await getViewer()
  if (!me) return { messages: [], note: 'Нет авторизации', aiEnabled: null }

  const supabase = await createClient()
  const { data } = await supabase
    .from('deals')
    .select('external_key, customer_phone')
    .eq('id', dealId)
    .maybeSingle()
  const deal = data as { external_key: string | null; customer_phone: string | null } | null
  if (!deal) return { messages: [], note: 'Сделка недоступна', aiEnabled: null }

  if (deal.external_key?.startsWith('wazzup:')) {
    const phone = deal.external_key.slice('wazzup:'.length)
    const { data: rows } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, text, created_at')
      .eq('phone', phone)
      .order('created_at')
      .limit(200)
    const messages = (rows ?? []) as DealMessage[]
    return { messages, note: messages.length ? null : 'Сообщений пока нет', aiEnabled: null }
  }

  if (!deal.external_key) {
    return { messages: [], note: 'Сделка заведена вручную — переписки нет', aiEnabled: null }
  }
  if (!isMostovoyConfigured()) {
    return { messages: [], note: 'Интеграция с витриной не настроена', aiEnabled: null }
  }

  // У витрины диалог адресуется числовым id, а в сделке лежит external_key —
  // сначала находим id в списке диалогов.
  const list = await mostovoyFetch<{ conversations: ShopConversation[] }>('/crm/conversations')
  if (!list.ok) return { messages: [], note: list.error, aiEnabled: null }

  const found = (list.data.conversations ?? []).find(c => c.externalKey === deal.external_key)
  if (!found) return { messages: [], note: 'Диалог на витрине не найден', aiEnabled: null }

  const detail = await mostovoyFetch<{ messages: ShopMessage[] }>(
    `/crm/conversations/${found.id}`
  )
  if (!detail.ok) return { messages: [], note: detail.error, aiEnabled: null }

  const messages: DealMessage[] = (detail.data.messages ?? []).map(m => ({
    id: String(m.id),
    direction: m.direction === 'incoming' ? 'in' : 'out',
    text: m.text,
    created_at: m.createdAt,
  }))
  return { messages, note: messages.length ? null : 'Сообщений пока нет', aiEnabled: Boolean((detail.data as { conversation?: { aiEnabled?: boolean } }).conversation?.aiEnabled) }
}

async function getShopConversationForDeal(dealId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('deals')
    .select('external_key')
    .eq('id', dealId)
    .is('deleted_at', null)
    .maybeSingle()
  const deal = data as { external_key: string | null } | null
  if (!deal?.external_key) return { error: 'У лида нет подключённого канала связи' } as const
  if (!isMostovoyConfigured()) return { error: 'Интеграция с витриной не настроена' } as const

  const list = await mostovoyFetch<{ conversations: ShopConversation[] }>('/crm/conversations')
  if (!list.ok) return { error: list.error } as const
  const conversation = (list.data.conversations ?? []).find((item) => item.externalKey === deal.external_key)
  if (!conversation) return { error: 'Диалог на витрине не найден' } as const
  return { conversation } as const
}

/** Ручной ответ уходит в тот же Telegram / WhatsApp / Instagram-диалог, что и бот. */
export async function sendDealMessage(dealId: string, text: string): Promise<DealActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }
  const value = text.trim()
  if (!value) return { success: false, error: 'Введите сообщение' }

  const found = await getShopConversationForDeal(dealId)
  if ('error' in found) return { success: false, error: found.error ?? 'Диалог на витрине не найден' }
  const result = await mostovoyFetch(`/crm/conversations/${found.conversation.id}/messages`, {
    method: 'POST', body: { text: value },
  })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath('/dashboard/deals')
  return { success: true }
}

/** Менеджер берёт диалог на себя или возвращает его ИИ. */
export async function setDealAiControl(dealId: string, aiEnabled: boolean): Promise<DealActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }
  const found = await getShopConversationForDeal(dealId)
  if ('error' in found) return { success: false, error: found.error ?? 'Диалог на витрине не найден' }
  const result = await mostovoyFetch(`/crm/conversations/${found.conversation.id}`, {
    method: 'PATCH', body: { aiEnabled },
  })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath('/dashboard/deals')
  return { success: true }
}

/** Очищает историю внешнего диалога, но оставляет лид и его сделку в CRM. */
export async function clearDealConversation(dealId: string): Promise<DealActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }
  if (me.role !== 'owner') return { success: false, error: 'Недостаточно прав' }
  if (!isMostovoyConfigured()) return { success: false, error: 'Интеграция с витриной не настроена' }

  const supabase = await createClient()
  const { data } = await supabase
    .from('deals')
    .select('external_key')
    .eq('id', dealId)
    .is('deleted_at', null)
    .maybeSingle()
  const deal = data as { external_key: string | null } | null
  if (!deal?.external_key) return { success: false, error: 'Для этого лида нет переписки' }

  if (deal.external_key.startsWith('wazzup:')) {
    const phone = deal.external_key.slice('wazzup:'.length)
    const admin = createAdminClient()
    const { error } = await admin.from('whatsapp_messages').delete().eq('phone', phone)
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/deals')
    return { success: true }
  }

  const list = await mostovoyFetch<{ conversations: ShopConversation[] }>('/crm/conversations')
  if (!list.ok) return { success: false, error: list.error }
  const conversation = (list.data.conversations ?? []).find(item => item.externalKey === deal.external_key)
  if (!conversation) return { success: false, error: 'Диалог на витрине не найден' }

  const result = await mostovoyFetch(`/crm/conversations/${conversation.id}/clear-history`, { method: 'POST' })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath('/dashboard/deals')
  return { success: true }
}
