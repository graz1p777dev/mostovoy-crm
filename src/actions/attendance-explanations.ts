'use server'

// ─── Причины опозданий и объяснительные, фаза 2 ───────────────────────────────
//
// РАЗДЕЛЕНИЕ ДВУХ ВЕЩЕЙ:
//   • причина — короткий текст, который сотрудник вводит В МОМЕНТ прихода.
//     Обязательна с 5 минут опоздания, редактированию не подлежит (триггер
//     _late_reason_immutable, миграция 086). Записывается сразу, не «потом»:
//     причина, придуманная вечером, стоит меньше сказанной на пороге.
//   • объяснительная — рукописная бумага, нужна при опоздании СВЫШЕ 15 минут.
//     Сюда загружается её фотография.
//
// СИСТЕМА НЕ ОЦЕНИВАЕТ ПРИЧИНУ. Она не делит её на уважительную и нет, ничего не
// прощает и никого не наказывает — только фиксирует сказанное и показывает
// владельцу. Решение принимает человек.
//
// ВИДИМОСТЬ. Сотрудник видит свои причины как факты. Счётчиков, порогов и того,
// сколько ему осталось до разговора об увольнении, он не видит нигде —
// требование владельца из фазы 1.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor, can, getScope } from '@/lib/authz'

const BUCKET = 'explanations'

export type SimpleResult = { success: true } | { success: false; error: string }

// ─── Причина опоздания ────────────────────────────────────────────────────────

const REASON_ERRORS: Record<string, string> = {
  reason_required: 'Укажите причину',
  not_found:       'Запись за этот день не найдена',
  not_your_record: 'Это чужая запись',
}

/**
 * Записывает причину опоздания. Вызывается модалкой сразу после отметки прихода;
 * пропустить её нельзя. Повторный вызов ничего не перезаписывает — БД вернёт
 * 'already', и это не ошибка, а нормальный исход при двойном клике.
 */
export async function recordLateReason(attendanceId: string, reason: string): Promise<SimpleResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }
  if (reason.trim().length === 0) return { success: false, error: 'Укажите причину' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('record_late_reason', {
    p_actor: actor.employeeId,
    p_attendance_id: attendanceId,
    p_reason: reason.trim(),
  })

  if (error) {
    console.error('[recordLateReason]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось сохранить причину' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok' || r.status === 'already') {
    revalidatePath('/dashboard')
    return { success: true }
  }
  return { success: false, error: REASON_ERRORS[String(r.reason)] ?? 'Не удалось сохранить причину' }
}

// ─── Просмотр причин владельцем ───────────────────────────────────────────────

export interface LateReasonRow {
  attendance_id: string
  date: string
  late_minutes: number
  late_grade: string
  reason: string | null
  reason_at: string | null
  needs_note: boolean
  note_uploaded: boolean
}

export type LateReasonsResult =
  | { ok: true; rows: LateReasonRow[] }
  | { ok: false; reason: 'no_access' | 'not_authenticated' }

/**
 * Все записанные причины ОДНОГО сотрудника в одном месте — требование владельца:
 * «показать все причины по человеку разом», чтобы было видно повторяющееся.
 * Окно — последние p_months календарных месяцев, включая текущий.
 */
export async function getLateReasons(
  employeeId: string, months = 3,
): Promise<LateReasonsResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, reason: 'not_authenticated' }
  if (!await can(actor, 'attendance', 'view')) return { ok: false, reason: 'no_access' }

  const scope = await getScope(actor, 'attendance')
  // 'own' — это «вижу себя»; список причин по чужому человеку для неё смысла не имеет.
  // Проверку области БД делает ещё раз сама (fail-closed) — здесь она ради понятного ответа.
  if (scope !== 'team' && scope !== 'all') return { ok: false, reason: 'no_access' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_late_reasons', {
    p_actor: actor.employeeId,
    p_employee_id: employeeId,
    p_months: months,
  })

  if (error) { console.error('[getLateReasons]', error.message); return { ok: true, rows: [] } }

  const rows = (data ?? []) as Record<string, unknown>[]
  return {
    ok: true,
    rows: rows.map(r => ({
      attendance_id: r.attendance_id as string,
      date:          r.date as string,
      late_minutes:  Number(r.late_minutes ?? 0),
      late_grade:    (r.late_grade as string) ?? 'on_time',
      reason:        (r.reason as string | null) ?? null,
      reason_at:     (r.reason_at as string | null) ?? null,
      needs_note:    r.needs_note === true,
      note_uploaded: r.note_uploaded === true,
    })),
  }
}

// ─── Свои долги по объяснительным ─────────────────────────────────────────────

export interface MyExplanationDebt {
  attendance_id: string
  date: string
  late_minutes: number
  reason: string | null
  uploaded: boolean
}

/**
 * Дни, за которые сотрудник должен объяснительную, и что из этого уже сдано.
 * Своё — не счётчик и не порог: человек обязан знать, какую бумагу он должен.
 * Отдельное действие от getExplanationStatus, потому что то требует области
 * team/all и сотруднику недоступно.
 */
export async function getMyExplanationDebt(): Promise<MyExplanationDebt[]> {
  const actor = await getActor()
  if (!actor) return []

  const admin = createAdminClient()
  // Полгода назад: старее уже не бумага, а археология.
  const since = new Date()
  since.setMonth(since.getMonth() - 6)

  const { data, error } = await admin
    .from('attendance')
    .select('id, date, late_minutes, late_reason, attendance_explanations(id)')
    .eq('employee_id', actor.employeeId)
    .in('late_grade', ['late_hard', 'late_critical'])
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: false })

  if (error) { console.error('[getMyExplanationDebt]', error.message); return [] }

  return (data ?? []).map(r => {
    const files = (r.attendance_explanations ?? []) as unknown as { id: string }[]
    return {
      attendance_id: r.id as string,
      date: r.date as string,
      late_minutes: Number(r.late_minutes ?? 0),
      reason: (r.late_reason as string | null) ?? null,
      uploaded: files.length > 0,
    }
  })
}

// ─── Объяснительная: загрузка ─────────────────────────────────────────────────

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_BYTES = 5 * 1024 * 1024

export type UploadSlot =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string }

/**
 * Готовит место под файл и отдаёт одноразовый токен загрузки.
 *
 * Путь ЗАДАЁТ СЕРВЕР — «<employee_id>/<attendance_id>» — и на первой папке
 * строится проверка доступа (политики storage.objects, миграция 085). Если бы
 * путь приходил с клиента, сотрудник мог бы записать файл в чужую папку.
 */
export async function prepareExplanationUpload(
  attendanceId: string, mime: string, size: number,
): Promise<UploadSlot> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Не авторизован' }
  if (!ALLOWED_MIME.includes(mime)) return { ok: false, error: 'Нужна фотография (JPEG, PNG, WEBP или HEIC)' }
  if (size <= 0 || size > MAX_BYTES) return { ok: false, error: 'Файл должен быть не больше 5 МБ' }

  const admin = createAdminClient()

  // День должен принадлежать вызывающему и действительно требовать объяснительной.
  // Ту же проверку делает register_explanation — здесь она нужна, чтобы не выдавать
  // токен загрузки под то, что всё равно будет отклонено.
  const { data: rec } = await admin
    .from('attendance')
    .select('id, employee_id, late_grade')
    .eq('id', attendanceId)
    .maybeSingle()

  if (!rec) return { ok: false, error: 'Запись за этот день не найдена' }
  if (rec.employee_id !== actor.employeeId) return { ok: false, error: 'Это чужая запись' }
  if (!['late_hard', 'late_critical'].includes(String(rec.late_grade))) {
    return { ok: false, error: 'За этот день объяснительная не требуется' }
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/heic' ? 'heic' : 'jpg'
  const path = `${actor.employeeId}/${attendanceId}.${ext}`

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[prepareExplanationUpload]', error?.message)
    return { ok: false, error: 'Не удалось подготовить загрузку' }
  }
  return { ok: true, path, token: data.token }
}

const EXPLANATION_ERRORS: Record<string, string> = {
  not_found:       'Запись за этот день не найдена',
  not_your_record: 'Это чужая запись',
  not_required:    'За этот день объяснительная не требуется',
}

/** Регистрирует уже загруженный файл. Перезаписать или удалить его сотрудник не может. */
export async function registerExplanation(
  attendanceId: string, path: string, mime: string, size: number,
): Promise<SimpleResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('register_explanation', {
    p_actor: actor.employeeId,
    p_attendance_id: attendanceId,
    p_path: path,
    p_mime: mime,
    p_size: size,
  })

  if (error) {
    console.error('[registerExplanation]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось сохранить объяснительную' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok' || r.status === 'already') {
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/attendance')
    return { success: true }
  }
  return { success: false, error: EXPLANATION_ERRORS[String(r.reason)] ?? 'Не удалось сохранить объяснительную' }
}

// ─── Кто должен объяснительную и кто сдал ─────────────────────────────────────

export interface ExplanationRow {
  attendance_id: string
  employee_id: string
  employee_name: string
  date: string
  late_minutes: number
  reason: string | null
  uploaded: boolean
  storage_path: string | null
}

export type ExplanationStatusResult =
  | { ok: true; rows: ExplanationRow[] }
  | { ok: false; reason: 'no_access' | 'not_authenticated' }

export async function getExplanationStatus(year: number, month: number): Promise<ExplanationStatusResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, reason: 'not_authenticated' }
  if (!await can(actor, 'attendance', 'view')) return { ok: false, reason: 'no_access' }

  const scope = await getScope(actor, 'attendance')
  if (scope !== 'team' && scope !== 'all') return { ok: false, reason: 'no_access' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_explanation_status', {
    p_actor: actor.employeeId, p_year: year, p_month: month,
  })

  if (error) { console.error('[getExplanationStatus]', error.message); return { ok: true, rows: [] } }

  const rows = (data ?? []) as Record<string, unknown>[]
  return {
    ok: true,
    rows: rows.map(r => ({
      attendance_id: r.attendance_id as string,
      employee_id:   r.employee_id as string,
      employee_name: (r.employee_name as string) ?? '—',
      date:          r.date as string,
      late_minutes:  Number(r.late_minutes ?? 0),
      reason:        (r.reason as string | null) ?? null,
      uploaded:      r.uploaded === true,
      storage_path:  (r.storage_path as string | null) ?? null,
    })),
  }
}

/**
 * Ссылка на фотографию объяснительной, живущая 60 секунд. Бакет приватный:
 * постоянного публичного адреса у документа нет.
 */
export async function getExplanationUrl(path: string): Promise<string | null> {
  const actor = await getActor()
  if (!actor) return null
  if (!await can(actor, 'attendance', 'view')) return null

  const scope = await getScope(actor, 'attendance')
  // Свою объяснительную сотрудник посмотреть может, чужую — только управляющий.
  const ownerOfFile = path.split('/')[0]
  if (scope !== 'team' && scope !== 'all' && ownerOfFile !== actor.employeeId) return null

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) { console.error('[getExplanationUrl]', error.message); return null }
  return data?.signedUrl ?? null
}
