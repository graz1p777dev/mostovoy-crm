// Автосоздание сделки по входящему сообщению клиента.
//
// Один вход для всех каналов: push от витрины (/api/internal/deals),
// вебхук Wazzup (/api/whatsapp/webhook) и сверка со витриной
// (reconcileDealsFromShop в src/actions/deals.ts).
//
// ВАЖНО: только серверный код — здесь service-role клиент. Все три вызова
// приходят снаружи сессии пользователя (бот, вебхук), поэтому RLS обойти
// приходится: сделку создаёт система, а не сотрудник.
//
// Идемпотентность держится на UNIQUE deals.external_key: повторное
// сообщение того же клиента не создаёт вторую сделку.

import { createAdminClient } from '@/lib/supabase/admin'
import type { DealSource } from '@/types'
import type { DealCurrency, DealOrderType } from '@/types'

export interface InboundDeal {
  /** Стабильный ключ клиента в канале: telegram:<chat_id>, wazzup:<phone>. */
  externalKey: string
  source: DealSource
  customerName?: string | null
  customerPhone?: string | null
  customerUsername?: string | null
}

const SOURCE_FALLBACK: Record<DealSource, string> = {
  telegram: 'Клиент из Telegram',
  whatsapp: 'Клиент из WhatsApp',
  instagram: 'Клиент из Instagram',
  site: 'Клиент с сайта',
  manual: 'Клиент',
}

/** Заголовок сделки: имя → username → телефон → канал. Пустым не бывает. */
export function dealTitleFor(input: InboundDeal): string {
  const candidates = [input.customerName, input.customerUsername, input.customerPhone]
  for (const value of candidates) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed.slice(0, 300)
  }
  return SOURCE_FALLBACK[input.source]
}

export interface UpsertDealResult {
  created: boolean
  id: string | null
  error?: string
}

export interface AdvanceDealResult {
  moved: boolean
  id: string | null
  stageName?: string
  error?: string
}

export interface MarkDealOrderInput {
  externalKey: string
  productName: string
  amount?: number | null
  currency?: DealCurrency
  orderType?: DealOrderType
  customerName?: string | null
  customerPhone?: string | null
  note?: string | null
}

/**
 * Создаёт сделку в этапе по умолчанию («Неразобранное»), если её ещё нет.
 * Существующую не трогает — менеджер мог уже изменить заголовок и сумму.
 */
export async function upsertDealFromInbound(input: InboundDeal): Promise<UpsertDealResult> {
  const key = input.externalKey.trim()
  if (!key) return { created: false, id: null, error: 'external_key пустой' }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('deals')
    .select('id')
    .eq('external_key', key)
    .maybeSingle()
  if (existing) return { created: false, id: (existing as { id: string }).id }

  const { data: stage, error: stageError } = await supabase
    .from('deal_stages')
    .select('id')
    .eq('is_default', true)
    .maybeSingle()
  if (stageError || !stage) {
    return { created: false, id: null, error: 'Не найден этап по умолчанию' }
  }

  // ignoreDuplicates — гонка двух сообщений подряд не должна падать 23505.
  const { data: inserted, error } = await supabase
    .from('deals')
    .upsert(
      {
        title: dealTitleFor(input),
        stage_id: (stage as { id: string }).id,
        source: input.source,
        external_key: key,
        customer_name: input.customerName?.trim() || null,
        customer_phone: input.customerPhone?.trim() || null,
        customer_username: input.customerUsername?.trim() || null,
      },
      { onConflict: 'external_key', ignoreDuplicates: true }
    )
    .select('id')

  if (error) return { created: false, id: null, error: error.message }

  const row = (inserted ?? [])[0] as { id: string } | undefined
  return { created: Boolean(row), id: row?.id ?? null }
}

/**
 * После первого содержательного ответа бота переводит новую сделку из
 * этапа по умолчанию в первый рабочий этап воронки. Сделку, которую уже
 * передвинул менеджер или другой процесс, не трогает.
 */
export async function advanceDealToPrimaryContact(externalKey: string): Promise<AdvanceDealResult> {
  const key = externalKey.trim()
  if (!key) return { moved: false, id: null, error: 'external_key пустой' }

  const supabase = createAdminClient()
  const [{ data: deal, error: dealError }, { data: defaultStage, error: defaultStageError }] = await Promise.all([
    supabase.from('deals').select('id, stage_id').eq('external_key', key).maybeSingle(),
    supabase.from('deal_stages').select('id').eq('is_default', true).maybeSingle(),
  ])

  if (dealError) return { moved: false, id: null, error: dealError.message }
  if (!deal) return { moved: false, id: null, error: 'Сделка не найдена' }
  const row = deal as { id: string; stage_id: string }
  if (defaultStageError || !defaultStage) {
    return { moved: false, id: row.id, error: 'Не найден этап по умолчанию' }
  }
  const defaultStageId = (defaultStage as { id: string }).id
  if (row.stage_id !== defaultStageId) return { moved: false, id: row.id }

  const { data: nextStage, error: nextStageError } = await supabase
    .from('deal_stages')
    .select('id, name')
    .eq('kind', 'normal')
    .eq('is_default', false)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (nextStageError || !nextStage) {
    return { moved: false, id: row.id, error: 'Не найден этап первичного контакта' }
  }

  const target = nextStage as { id: string; name: string }
  const { data: updated, error: updateError } = await supabase
    .from('deals')
    .update({ stage_id: target.id })
    .eq('id', row.id)
    .eq('stage_id', defaultStageId)
    .select('id')
  if (updateError) return { moved: false, id: row.id, error: updateError.message }

  return {
    moved: Boolean(updated?.length),
    id: row.id,
    stageName: target.name,
  }
}

/**
 * Помечает существующую сделку как оформленный ботом заказ.
 * Отдельную таблицу не создаём: карточка заказа остаётся той же сделкой,
 * поэтому переписка, этап и ответственный не расходятся между экранами.
 */
export async function markDealAsOrder(input: MarkDealOrderInput): Promise<UpsertDealResult> {
  const key = input.externalKey.trim()
  const productName = input.productName.trim()
  if (!key) return { created: false, id: null, error: 'external_key пустой' }
  if (!productName) return { created: false, id: null, error: 'productName пустой' }

  const supabase = createAdminClient()
  const { data: deal, error: lookupError } = await supabase
    .from('deals')
    .select('id')
    .eq('external_key', key)
    .maybeSingle()
  if (lookupError) return { created: false, id: null, error: lookupError.message }
  if (!deal) return { created: false, id: null, error: 'Сделка не найдена' }

  const row = deal as { id: string }
  const orderType = input.orderType ?? 'standard'
  const typeLabel = orderType === 'trade_in'
    ? 'Trade-in'
    : orderType === 'installment'
      ? 'Рассрочка'
      : 'Обычный заказ'
  const orderNote = [
    '[ORDER]',
    `Товар: ${productName}`,
    `Тип: ${typeLabel}`,
    input.note?.trim() || null,
  ].filter(Boolean).join('\n')

  const update: Record<string, unknown> = {
    title: productName,
    amount: input.amount ?? null,
    currency: input.currency ?? 'KGS',
    note: orderNote,
  }
  if (input.customerName?.trim()) update.customer_name = input.customerName.trim()
  if (input.customerPhone?.trim()) update.customer_phone = input.customerPhone.trim()

  const { data: updated, error } = await supabase
    .from('deals')
    .update(update)
    .eq('id', row.id)
    .select('id')
  if (error) return { created: false, id: row.id, error: error.message }
  return { created: false, id: (updated?.[0] as { id: string } | undefined)?.id ?? row.id }
}

/** Убирает ошибочную служебную отметку заказа, не удаляя саму сделку. */
export async function resetDealOrder(externalKey: string): Promise<UpsertDealResult> {
  const key = externalKey.trim()
  if (!key) return { created: false, id: null, error: 'external_key пустой' }

  const supabase = createAdminClient()
  const { data: deal, error: lookupError } = await supabase
    .from('deals')
    .select('id, source, customer_name, customer_phone, customer_username, note')
    .eq('external_key', key)
    .maybeSingle()
  if (lookupError) return { created: false, id: null, error: lookupError.message }
  if (!deal) return { created: false, id: null, error: 'Сделка не найдена' }

  const row = deal as {
    id: string
    source: DealSource
    customer_name: string | null
    customer_phone: string | null
    customer_username: string | null
    note: string | null
  }
  if (!row.note?.startsWith('[ORDER]')) return { created: false, id: row.id }

  const { error } = await supabase
    .from('deals')
    .update({
      title: dealTitleFor({
        externalKey: key,
        source: row.source,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerUsername: row.customer_username,
      }),
      amount: null,
      note: null,
    })
    .eq('id', row.id)
  if (error) return { created: false, id: row.id, error: error.message }
  return { created: false, id: row.id }
}
