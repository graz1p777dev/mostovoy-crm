'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionResult = { success: true } | { success: false; error: string }

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface CompanyPlanInput {
  date_start:       string  // YYYY-MM-DD
  date_end:         string
  target_revenue:   number
  avg_check:        number
  conv_appeal_lead: number  // %
  conv_lead_nv:     number
  conv_nv_fv:       number
  conv_fv_sale:     number
}

export interface CompanyPlan extends CompanyPlanInput {
  id: string
}

/** Рассчитанный план по воронке (реверсивно от выручки) */
export interface FunnelPlan {
  appeals: number
  leads:   number
  nv:      number
  fv:      number
  sales:   number
  revenue: number
}

/** Факт по воронке за период */
export interface FunnelFact {
  appeals:    number
  leads:      number
  nv:         number
  fv:         number
  sales:      number
  revenue:    number
  // Без НВ — только факт, план не рассчитывается
  no_nv_fv:      number
  no_nv_sales:   number
  no_nv_revenue: number
}

/** Фактическая конверсия по переходам, % (null если делитель = 0) */
export interface FunnelConversions {
  appeal_lead: number | null
  lead_nv:     number | null
  nv_fv:       number | null
  fv_sale:     number | null
}

// ─── Расчёт воронки (реверсивный) ─────────────────────────────────────────────
// Единственное место с формулой — UI вызывает её же через computeFunnelPlan.

export async function computeFunnelPlan(input: {
  target_revenue:   number
  avg_check:        number
  conv_appeal_lead: number
  conv_lead_nv:     number
  conv_nv_fv:       number
  conv_fv_sale:     number
}): Promise<FunnelPlan> {
  const sales   = Math.ceil(input.target_revenue / input.avg_check)
  const fv      = Math.ceil(sales / (input.conv_fv_sale     / 100))
  const nv      = Math.ceil(fv    / (input.conv_nv_fv       / 100))
  const leads   = Math.ceil(nv    / (input.conv_lead_nv     / 100))
  const appeals = Math.ceil(leads / (input.conv_appeal_lead / 100))
  return { appeals, leads, nv, fv, sales, revenue: input.target_revenue }
}

// ─── Auth guard ────────────────────────────────────────────────────────────────

async function requireOwner(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const { data } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', session.user.id)
    .single()
  return data?.role === 'owner'
}

async function requireSession(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}

// ─── Чтение плана ─────────────────────────────────────────────────────────────

/** План, покрывающий указанную дату (по умолчанию — сегодня) */
export async function getCompanyPlan(forDate?: string): Promise<CompanyPlan | null> {
  if (!await requireSession()) return null
  const admin = createAdminClient()
  const d = forDate ?? new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from('company_plans')
    .select('id, date_start, date_end, target_revenue, avg_check, conv_appeal_lead, conv_lead_nv, conv_nv_fv, conv_fv_sale')
    .lte('date_start', d)
    .gte('date_end', d)
    .maybeSingle()
  return data as CompanyPlan | null
}

/** Все планы (для списка периодов) */
export async function getCompanyPlans(): Promise<CompanyPlan[]> {
  if (!await requireSession()) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('company_plans')
    .select('id, date_start, date_end, target_revenue, avg_check, conv_appeal_lead, conv_lead_nv, conv_nv_fv, conv_fv_sale')
    .order('date_start', { ascending: false })
  return (data ?? []) as CompanyPlan[]
}

// ─── Запись плана ─────────────────────────────────────────────────────────────

function validatePlanInput(input: CompanyPlanInput): string | null {
  if (!input.date_start || !input.date_end) return 'Укажите даты периода'
  if (input.date_end < input.date_start) return 'Дата окончания раньше даты начала'
  if (input.target_revenue <= 0) return 'Целевая выручка должна быть больше 0'
  if (input.avg_check <= 0) return 'Средний чек должен быть больше 0'
  for (const [label, v] of [
    ['Обращение→Лид', input.conv_appeal_lead],
    ['Лид→НВ',        input.conv_lead_nv],
    ['НВ→ФВ',         input.conv_nv_fv],
    ['ФВ→Продажа',    input.conv_fv_sale],
  ] as const) {
    if (v <= 0 || v > 100) return `Конверсия «${label}» должна быть в диапазоне 0–100%`
  }
  return null
}

export async function upsertCompanyPlan(
  input: CompanyPlanInput,
  planId?: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }

  const validationError = validatePlanInput(input)
  if (validationError) return { success: false, error: validationError }

  const admin = createAdminClient()

  if (planId) {
    const { error } = await admin.from('company_plans').update(input).eq('id', planId)
    if (error) {
      if (error.code === '23P01') return { success: false, error: 'Период пересекается с существующим планом' }
      return { success: false, error: error.message }
    }
    revalidatePath('/dashboard/decomposition')
    return { success: true, id: planId }
  }

  const { data, error } = await admin
    .from('company_plans')
    .insert(input)
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '23P01') return { success: false, error: 'Период пересекается с существующим планом' }
    return { success: false, error: error?.message ?? 'Ошибка создания плана' }
  }
  revalidatePath('/dashboard/decomposition')
  return { success: true, id: data.id as string }
}

export async function deleteCompanyPlan(planId: string): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()
  const { error } = await admin.from('company_plans').delete().eq('id', planId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/decomposition')
  return { success: true }
}

// ─── Агрегация факта из существующих источников ───────────────────────────────
// Обращения/Лиды/НВ — только из daily_activity (там их единственный источник).
// ФВ/Продажи/Выручка — из daily_activity (override) с fallback на consultations
//   по дням: та же логика, что в recalculate_decomposition().
// Без НВ — из consultations (is_nv = false), override nv_* полей daily_activity
//   здесь не применяется, т.к. nv_* хранят факт ПО НВ, а не «без НВ».

export async function getCompanyFact(dateStart: string, dateEnd: string): Promise<FunnelFact | null> {
  if (!await requireSession()) return null
  const admin = createAdminClient()

  const [{ data: daRows }, { data: consRows }] = await Promise.all([
    admin
      .from('daily_activity')
      .select('date, appeals_fact, leads_fact, nv_fact, fv_fact, sales_fact, revenue_fact')
      .gte('date', dateStart)
      .lte('date', dateEnd),
    admin
      .from('consultations')
      .select('date, actual_status, status_after_fv, amount, is_nv')
      .gte('date', dateStart)
      .lte('date', dateEnd)
      .is('deleted_at', null),
  ])

  const da   = daRows ?? []
  const cons = consRows ?? []

  // Прямые суммы из daily_activity
  const appeals = da.reduce((s, r) => s + (r.appeals_fact ?? 0), 0)
  const leads   = da.reduce((s, r) => s + (r.leads_fact ?? 0), 0)
  const nv      = da.reduce((s, r) => s + (r.nv_fact ?? 0), 0)

  // ФВ/Продажи/Выручка: по дням — override из daily_activity, иначе consultations.
  // daily_activity может иметь несколько строк на день (по сотрудникам) — при
  // наличии хотя бы одного override за день суммируем overrides, иначе консультации.
  const dayKeys = new Set<string>([...da.map(r => r.date as string), ...cons.map(r => r.date as string)])

  let fv = 0, sales = 0, revenue = 0
  for (const day of dayKeys) {
    const daDay   = da.filter(r => r.date === day)
    const consDay = cons.filter(r => r.date === day)

    const fvOverrides = daDay.filter(r => r.fv_fact !== null)
    fv += fvOverrides.length > 0
      ? fvOverrides.reduce((s, r) => s + (r.fv_fact ?? 0), 0)
      : consDay.filter(c => c.actual_status === 'Пришла').length

    const salesOverrides = daDay.filter(r => r.sales_fact !== null)
    sales += salesOverrides.length > 0
      ? salesOverrides.reduce((s, r) => s + (r.sales_fact ?? 0), 0)
      : consDay.filter(c => c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата').length

    const revenueOverrides = daDay.filter(r => r.revenue_fact !== null)
    revenue += revenueOverrides.length > 0
      ? revenueOverrides.reduce((s, r) => s + Number(r.revenue_fact ?? 0), 0)
      : consDay
          .filter(c => c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата')
          .reduce((s, c) => s + Number(c.amount ?? 0), 0)
  }

  // Без НВ — только из consultations
  const noNv = cons.filter(c => c.is_nv === false)
  const no_nv_fv    = noNv.filter(c => c.actual_status === 'Пришла').length
  const noNvSold    = noNv.filter(c => c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата')
  const no_nv_sales   = noNvSold.length
  const no_nv_revenue = noNvSold.reduce((s, c) => s + Number(c.amount ?? 0), 0)

  return { appeals, leads, nv, fv, sales, revenue, no_nv_fv, no_nv_sales, no_nv_revenue }
}

// ─── Факт по дням (для таблицы «План/Факт по дням») ──────────────────────────
// Возвращает строку на КАЖДЫЙ календарный день диапазона (включая нулевые).

export interface DailyFactRow {
  date:    string  // YYYY-MM-DD
  appeals: number
  leads:   number
  nv:      number
  fv:      number
  sales:   number
  revenue: number
}

export async function getCompanyFactDaily(dateStart: string, dateEnd: string): Promise<DailyFactRow[]> {
  if (!await requireSession()) return []
  const admin = createAdminClient()

  const [{ data: daRows }, { data: consRows }] = await Promise.all([
    admin
      .from('daily_activity')
      .select('date, appeals_fact, leads_fact, nv_fact, fv_fact, sales_fact, revenue_fact')
      .gte('date', dateStart)
      .lte('date', dateEnd),
    admin
      .from('consultations')
      .select('date, actual_status, status_after_fv, amount')
      .gte('date', dateStart)
      .lte('date', dateEnd)
      .is('deleted_at', null),
  ])

  const da   = daRows ?? []
  const cons = consRows ?? []

  // Генерируем все календарные дни диапазона
  const days: string[] = []
  const cursor = new Date(dateStart + 'T00:00:00')
  const endD   = new Date(dateEnd + 'T00:00:00')
  while (cursor <= endD) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
    if (days.length > 366) break
  }

  return days.map(day => {
    const daDay   = da.filter(r => r.date === day)
    const consDay = cons.filter(r => r.date === day)

    const appeals = daDay.reduce((s, r) => s + (r.appeals_fact ?? 0), 0)
    const leads   = daDay.reduce((s, r) => s + (r.leads_fact ?? 0), 0)
    const nv      = daDay.reduce((s, r) => s + (r.nv_fact ?? 0), 0)

    const fvOverrides = daDay.filter(r => r.fv_fact !== null)
    const fv = fvOverrides.length > 0
      ? fvOverrides.reduce((s, r) => s + (r.fv_fact ?? 0), 0)
      : consDay.filter(c => c.actual_status === 'Пришла').length

    const salesOverrides = daDay.filter(r => r.sales_fact !== null)
    const soldCons = consDay.filter(c => c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата')
    const sales = salesOverrides.length > 0
      ? salesOverrides.reduce((s, r) => s + (r.sales_fact ?? 0), 0)
      : soldCons.length

    const revenueOverrides = daDay.filter(r => r.revenue_fact !== null)
    const revenue = revenueOverrides.length > 0
      ? revenueOverrides.reduce((s, r) => s + Number(r.revenue_fact ?? 0), 0)
      : soldCons.reduce((s, c) => s + Number(c.amount ?? 0), 0)

    return { date: day, appeals, leads, nv, fv, sales, revenue }
  })
}

// ─── Фактическая конверсия ────────────────────────────────────────────────────

export async function computeFactConversions(fact: FunnelFact): Promise<FunnelConversions> {
  const pct = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 10000) / 100 : null
  return {
    appeal_lead: pct(fact.leads, fact.appeals),
    lead_nv:     pct(fact.nv,    fact.leads),
    nv_fv:       pct(fact.fv,    fact.nv),
    fv_sale:     pct(fact.sales, fact.fv),
  }
}
