'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor, can, isMarketingManager } from '@/lib/authz'
import type { Partner, PartnerType, PartnerStatus, PartnerTypeItem } from '@/types'

export type ActionResult = { success: true } | { success: false; error: string }

// Лёгкий вариант для дропдауна атрибуции в модалке консультации
export interface PartnerOption {
  id:   string
  name: string
  type: PartnerType
}

const STATUSES: PartnerStatus[] = ['active', 'inactive']

// ─── Справочник типов партнёров (редактируемый, миграция 065) ──────────────────
export async function getPartnerTypes(): Promise<PartnerTypeItem[]> {
  const actor = await getActor()
  if (!actor) return []
  const allowed = (await can(actor, 'marketing', 'view')) || (await can(actor, 'consultations', 'create')) || (await can(actor, 'consultations', 'edit'))
  if (!allowed) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('partner_types')
    .select('id, name, is_system, sort_order')
    .is('deleted_at', null)
    .order('sort_order').order('name')
  return (data ?? []).map(t => ({ id: t.id as string, name: t.name as string, is_system: !!t.is_system, sort_order: Number(t.sort_order) }))
}

export async function savePartnerType(id: string | null, name: string): Promise<ActionResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Недостаточно прав' }
  if (!await isMarketingManager(actor)) return { success: false, error: 'Недостаточно прав' }
  if (!name.trim()) return { success: false, error: 'Укажите название типа' }
  const admin = createAdminClient()
  const { error } = await admin.rpc('save_partner_type', { p_id: id, p_name: name.trim(), p_actor: actor.employeeId })
  if (error) {
    if ((error.message || '').includes('duplicate')) return { success: false, error: 'Такой тип уже есть' }
    return { success: false, error: 'Не удалось сохранить тип' }
  }
  revalidatePath('/dashboard/partners')
  return { success: true }
}

export async function deletePartnerType(id: string): Promise<ActionResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Недостаточно прав' }
  if (!await isMarketingManager(actor)) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()
  const { error } = await admin.rpc('delete_partner_type', { p_id: id, p_actor: actor.employeeId })
  if (error) {
    if ((error.message || '').includes('system_type_protected')) return { success: false, error: 'Базовый тип нельзя удалить' }
    return { success: false, error: 'Не удалось удалить тип' }
  }
  revalidatePath('/dashboard/partners')
  return { success: true }
}

// ─── Активные партнёры для селекта «Источник → Партнёр» ────────────────────────
// Нужен всем, кто заводит/правит консультации ИЛИ смотрит маркетинг: справочник
// партнёров для атрибуции. Читаем admin-клиентом (RLS обходим), но под явной
// проверкой прав. Партнёр — не чувствительные PII, но всё равно за правом.
export async function getActivePartners(): Promise<PartnerOption[]> {
  const actor = await getActor()
  if (!actor) return []
  const allowed =
    (await can(actor, 'consultations', 'create')) ||
    (await can(actor, 'consultations', 'edit')) ||
    (await can(actor, 'marketing', 'view'))
  if (!allowed) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('partners')
    .select('id, name, type')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name')
  return (data ?? []).map(p => ({ id: p.id as string, name: p.name as string, type: p.type as PartnerType }))
}

// ─── Полный список (для будущей вкладки «Партнёры») ───────────────────────────
export async function listPartners(): Promise<Partner[]> {
  const actor = await getActor()
  if (!actor) return []
  if (!await can(actor, 'marketing', 'view')) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('partners')
    .select('id, name, type, terms, contact, status, created_at, deleted_at')
    .is('deleted_at', null)
    .order('name')
  return (data ?? []) as Partner[]
}

// ─── Данные страницы «Управление → Партнёры» (fail-closed) ────────────────────
export interface PartnersPageData {
  partners: Partner[]
  types:    PartnerTypeItem[]
  canEdit:  boolean
}
export async function getPartnersPageData(): Promise<PartnersPageData | null> {
  const actor = await getActor()
  if (!actor) return null
  if (!await can(actor, 'marketing', 'view')) return null   // fail-closed
  const admin = createAdminClient()
  const [{ data: parts }, { data: tps }] = await Promise.all([
    admin.from('partners').select('id, name, type, terms, contact, status, created_at, deleted_at')
      .is('deleted_at', null).order('name'),
    admin.from('partner_types').select('id, name, is_system, sort_order')
      .is('deleted_at', null).order('sort_order').order('name'),
  ])
  return {
    partners: (parts ?? []) as Partner[],
    types: (tps ?? []).map(t => ({ id: t.id as string, name: t.name as string, is_system: !!t.is_system, sort_order: Number(t.sort_order) })),
    // canEdit = управляющая роль маркетинга (не простой marketing.edit) — иначе targetolog
    // видел бы кнопки, которые сервер всё равно отклонит (NOTE 2 Codex).
    canEdit: await isMarketingManager(actor),
  }
}

// ─── Партнёр с агрегатами из consultations за период ──────────────────────────
export interface PartnerAgg extends Partner {
  sent:       number        // прислал обращений (все консультации partner_id)
  reached:    number        // дошло (actual_status='Пришла')
  bought:     number        // купило (amount>0)
  revenue:    number        // выручка
  conversion: number | null // обращение→продажа, % (bought/sent); null если обращений нет
}

export async function getPartnersWithAggregates(dateStart: string, dateEnd: string): Promise<PartnerAgg[] | null> {
  const actor = await getActor()
  if (!actor) return null
  if (!await can(actor, 'marketing', 'view')) return null   // fail-closed
  if (!dateStart || !dateEnd || dateEnd < dateStart) return null

  const admin = createAdminClient()
  const [{ data: parts }, { data: cons }] = await Promise.all([
    admin.from('partners')
      .select('id, name, type, terms, contact, status, created_at, deleted_at')
      .is('deleted_at', null).order('name'),
    admin.from('consultations')
      .select('partner_id, actual_status, amount')
      .not('partner_id', 'is', null).is('deleted_at', null)
      .gte('date', dateStart).lte('date', dateEnd),
  ])

  const agg = new Map<string, { sent: number; reached: number; bought: number; revenue: number }>()
  for (const c of cons ?? []) {
    const pid = c.partner_id as string
    const a = agg.get(pid) ?? { sent: 0, reached: 0, bought: 0, revenue: 0 }
    a.sent += 1
    if (c.actual_status === 'Пришла') a.reached += 1
    if (Number(c.amount ?? 0) > 0) { a.bought += 1; a.revenue += Number(c.amount) }
    agg.set(pid, a)
  }

  const rows: PartnerAgg[] = (parts ?? []).map(p => {
    const a = agg.get(p.id as string) ?? { sent: 0, reached: 0, bought: 0, revenue: 0 }
    return {
      ...(p as Partner),
      sent: a.sent, reached: a.reached, bought: a.bought, revenue: a.revenue,
      conversion: a.sent > 0 ? (a.bought / a.sent) * 100 : null,
    }
  })
  // активные первыми, внутри — по выручке убыв.
  rows.sort((x, y) => (x.status === y.status ? y.revenue - x.revenue : x.status === 'active' ? -1 : 1))
  return rows
}

// ─── Сохранение партнёра (create/update, деактивация = status) через RPC с аудитом ─
export async function savePartner(
  id: string | null,
  input: { name: string; type: PartnerType; terms?: string | null; contact?: string | null; status?: PartnerStatus },
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Недостаточно прав' }
  if (!await isMarketingManager(actor)) return { success: false, error: 'Недостаточно прав' }

  const name = input.name?.trim()
  if (!name) return { success: false, error: 'Укажите название партнёра' }
  const partnerType = input.type?.trim() || 'Другое'   // тип — из справочника partner_types
  const status = input.status ?? 'active'
  if (!STATUSES.includes(status)) return { success: false, error: 'Некорректный статус' }

  const admin = createAdminClient()

  // Тип должен существовать в справочнике активных типов (после 065 type — свободный текст)
  const { data: typeRow } = await admin
    .from('partner_types').select('id')
    .ilike('name', partnerType).is('deleted_at', null).maybeSingle()
  if (!typeRow) return { success: false, error: 'Такого типа партнёра нет в справочнике' }

  const { data, error } = await admin.rpc('save_partner', {
    p_id:    id,
    p_data:  { name, type: partnerType, terms: input.terms ?? null, contact: input.contact ?? null, status },
    p_actor: actor.employeeId,
  })
  if (error) {
    console.error('[savePartner]', error.code, '|', error.message)
    const m = error.message || ''
    if (m.includes('not_marketing_manager') || m.includes('actor_inactive')) return { success: false, error: 'Недостаточно прав' }
    if (m.includes('partner_type_not_found')) return { success: false, error: 'Такого типа партнёра нет в справочнике' }
    if (m.includes('partner_not_found')) return { success: false, error: 'Партнёр не найден' }
    return { success: false, error: 'Не удалось сохранить партнёра' }
  }
  revalidatePath('/dashboard/decomposition')
  return { success: true, id: data as string }
}
