'use server'

// ─── Отпуска, фаза 2 ──────────────────────────────────────────────────────────
//
// Вся запись — через SECURITY DEFINER функции (миграция 087). Правила (стаж 6
// месяцев, не более 7 дней, один отпуск на полугодие, заявка минимум за 7 дней,
// 30 дней между отпусками) проверяет БД, а не эта прослойка: приложение — не
// единственный вход, и правило, живущее только в TypeScript, обходится.
//
// ВИДИМОСТЬ. Сотрудник видит СВОИ заявки и их статус — и ничего больше. Он не
// видит ни чужих заявок, ни счётчиков, ни того, насколько близок к увольнению.
// Это требование владельца из фазы 1, и оно держится не сокрытием кнопки:
// область считает _perm_scope_for(actor, 'vacations') в самой БД.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor, can, getScope } from '@/lib/authz'

export type VacationResult = { success: true } | { success: false; error: string }

// Сообщения человеческие: их читает не разработчик, а сотрудник и владелец.
const VACATION_ERRORS: Record<string, string> = {
  forbidden:         'Недостаточно прав',
  employee_not_found:'Сотрудник не найден',
  not_found:         'Заявка не найдена',
  out_of_scope:      'Заявка вне вашей зоны ответственности',
  already_decided:   'Заявка уже рассмотрена',
  comment_required:  'Укажите комментарий',
  dates_order:       'Дата окончания раньше даты начала',
  no_hire_date:      'У сотрудника не указана дата приёма — отпуск посчитать не от чего',
  tenure_too_short:  'Отпуск доступен после 6 месяцев работы',
  too_many_days:     'Отпуск не может быть длиннее 7 дней',
  crosses_half_year: 'Отпуск не должен переходить из одного полугодия в другое',
  too_late:          'Заявку нужно подавать минимум за 7 дней',
  half_year_taken:   'В этом полугодии отпуск уже есть',
  gap_too_small:     'Между отпусками должно пройти не меньше 30 дней',
}

function toMessage(r: Record<string, unknown>): string {
  const key = String(r.reason)
  const base = VACATION_ERRORS[key] ?? 'Не удалось выполнить действие'
  // Функции возвращают уточнения — показываем их, иначе «не длиннее 7 дней»
  // на заявке в 9 дней выглядит как придирка без объяснения.
  if (key === 'too_many_days' && r.days) return `${base} (в заявке ${String(r.days)})`
  if (key === 'gap_too_small' && r.days) return `${base} (сейчас ${String(r.days)})`
  if (key === 'too_late' && r.earliest) return `${base}. Ближайшая возможная дата — ${String(r.earliest)}`
  if (key === 'half_year_taken' && r.period) return `${base} (${String(r.period)})`
  return base
}

// ─── Заявка от сотрудника ─────────────────────────────────────────────────────

export async function submitVacationRequest(
  from: string, to: string, comment: string,
): Promise<VacationResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('submit_vacation_request', {
    p_actor: actor.employeeId,
    p_from: from,
    p_to: to,
    p_comment: comment.trim() || null,
  })

  if (error) {
    console.error('[submitVacationRequest]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось отправить заявку' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok') { revalidatePath('/dashboard/attendance'); return { success: true } }
  return { success: false, error: toMessage(r) }
}

// ─── Решение по заявке ────────────────────────────────────────────────────────

export async function decideVacationRequest(
  requestId: string, approve: boolean, comment: string,
): Promise<VacationResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }
  // Отказ без объяснения человеку непонятен — это же требует и CHECK в БД.
  if (!approve && comment.trim().length === 0) {
    return { success: false, error: 'При отказе комментарий обязателен' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('decide_vacation_request', {
    p_actor: actor.employeeId,
    p_request_id: requestId,
    p_approve: approve,
    p_comment: comment.trim() || null,
  })

  if (error) {
    console.error('[decideVacationRequest]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось сохранить решение' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok') { revalidatePath('/dashboard/attendance'); return { success: true } }
  return { success: false, error: toMessage(r) }
}

// ─── Отпуск задним числом (только владелец, комментарий обязателен) ────────────

export async function registerVacationRetroactive(
  employeeId: string, from: string, to: string, comment: string,
): Promise<VacationResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }
  if (comment.trim().length === 0) {
    return { success: false, error: 'Комментарий обязателен: он объясняет, почему отпуск оформлен задним числом' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('register_vacation_retroactive', {
    p_actor: actor.employeeId,
    p_employee_id: employeeId,
    p_from: from,
    p_to: to,
    p_comment: comment.trim(),
  })

  if (error) {
    console.error('[registerVacationRetroactive]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось оформить отпуск' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok') { revalidatePath('/dashboard/attendance'); return { success: true } }
  return { success: false, error: toMessage(r) }
}

// ─── Чтение ───────────────────────────────────────────────────────────────────

export interface VacationRequestRow {
  id: string
  employee_id: string
  employee_name: string
  date_from: string
  date_to: string
  days_count: number
  period_key: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  comment: string | null
  decision_comment: string | null
  decided_at: string | null
  created_by_owner: boolean
}

type Row = Record<string, unknown>

function mapRow(r: Row): VacationRequestRow {
  const emp = r.employees as { name?: string } | null
  return {
    id: r.id as string,
    employee_id: r.employee_id as string,
    employee_name: emp?.name ?? '—',
    date_from: r.date_from as string,
    date_to: r.date_to as string,
    days_count: Number(r.days_count ?? 0),
    period_key: (r.period_key as string) ?? '',
    status: r.status as VacationRequestRow['status'],
    comment: (r.comment as string | null) ?? null,
    decision_comment: (r.decision_comment as string | null) ?? null,
    decided_at: (r.decided_at as string | null) ?? null,
    created_by_owner: r.created_by_owner === true,
  }
}

const SELECT = 'id, employee_id, date_from, date_to, days_count, period_key, status, comment, decision_comment, decided_at, created_by_owner, employees!vacation_requests_employee_id_fkey(name)'

/** Сотрудники, которым можно оформить отпуск задним числом — по области права. */
export async function getVacationEmployees(): Promise<{ id: string; name: string }[]> {
  const actor = await getActor()
  if (!actor) return []
  if (!await can(actor, 'vacations', 'view')) return []

  const scope = await getScope(actor, 'vacations')
  if (scope !== 'team' && scope !== 'all') return []

  const admin = createAdminClient()
  let q = admin.from('employees').select('id, name').is('deleted_at', null).eq('status', 'active').order('name')
  if (scope === 'team') q = q.eq('department_id', actor.departmentId ?? '')

  const { data, error } = await q
  if (error) { console.error('[getVacationEmployees]', error.message); return [] }
  return (data ?? []).map(e => ({ id: e.id as string, name: e.name as string }))
}

/** Свои заявки. Доступно каждому — это его собственные данные. */
export async function getMyVacations(): Promise<VacationRequestRow[]> {
  const actor = await getActor()
  if (!actor) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vacation_requests')
    .select(SELECT)
    .eq('employee_id', actor.employeeId)
    .order('date_from', { ascending: false })

  if (error) { console.error('[getMyVacations]', error.message); return [] }
  return (data ?? []).map(r => mapRow(r as unknown as Row))
}

export type VacationListResult =
  | { ok: true; rows: VacationRequestRow[] }
  | { ok: false; reason: 'no_access' | 'not_authenticated' }

/**
 * Заявки для рассмотрения. Право 'vacations' отдельное от 'attendance' и по
 * умолчанию есть только у владельца — но делегируется, поэтому получатель нигде
 * не зашит как 'owner'.
 */
export async function getVacationsForReview(): Promise<VacationListResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, reason: 'not_authenticated' }
  if (!await can(actor, 'vacations', 'view')) return { ok: false, reason: 'no_access' }

  const scope = await getScope(actor, 'vacations')
  if (scope !== 'team' && scope !== 'all') return { ok: false, reason: 'no_access' }

  const admin = createAdminClient()
  let q = admin.from('vacation_requests').select(SELECT).order('status').order('date_from')

  // admin-клиент обходит RLS, поэтому область применяется здесь явно —
  // ровно та ошибка, которую нашли в аудите 7.4 по табелю.
  if (scope === 'team') {
    const { data: dept } = await admin
      .from('employees').select('id')
      .eq('department_id', actor.departmentId ?? '')
      .is('deleted_at', null)
    q = q.in('employee_id', (dept ?? []).map(d => d.id as string))
  }

  const { data, error } = await q
  if (error) { console.error('[getVacationsForReview]', error.message); return { ok: true, rows: [] } }
  return { ok: true, rows: (data ?? []).map(r => mapRow(r as unknown as Row)) }
}
