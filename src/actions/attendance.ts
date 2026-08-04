'use server'

// ─── Посещаемость, фаза 1 ─────────────────────────────────────────────────────
//
// Все записи идут через SECURITY DEFINER функции БД (миграция 078). Прямой записи
// из приложения больше нет: миграция 077 сняла политики записи и отозвала гранты у
// роли authenticated, поэтому сотрудник не может вписать себе день в обход этих
// действий (дыра из аудита 2026-07-29).
//
// ВРЕМЯ считает сервер БД в Asia/Bishkek. Клиентских вычислений даты нет вовсе —
// прежний localStorage-замок считал дату по UTC и с 00:00 до 06:00 глушил отметку.
//
// РАЗДЕЛЕНИЕ ВИДИМОСТИ. getMyAttendance отдаёт сотруднику ЕГО факты и не содержит
// агрегатов. Счётчики опозданий живут в отдельном действии getAttendanceCounters,
// доступном только тем, кто управляет посещаемостью. Это требование владельца:
// сотрудник не должен видеть, насколько он близок к увольнению.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor, can, getScope } from '@/lib/authz'
import { isWorkDay } from '@/lib/decomposition/schedule'

export type ActionResult = { success: true } | { success: false; error: string }

// ─── Приход ───────────────────────────────────────────────────────────────────

// attendance_id, needs_reason и needs_note добавлены в фазе 2 (миграция 090):
// при опоздании от 5 минут экран обязан тут же спросить причину, а свыше 15 —
// ещё и предупредить о рукописной объяснительной. Без id записи привязать
// причину не к чему.
export type CheckInResult =
  | {
      status: 'checked_in'
      late_minutes: number
      late_grade: string
      counts_as_worked: boolean
      attendance_id: string
      needs_reason: boolean
      needs_note: boolean
    }
  // 'already' тоже несёт needs_reason: сотрудник мог закрыть вкладку, не дописав
  // причину, — тогда при следующем заходе её спросят снова.
  | { status: 'already'; attendance_id: string; late_minutes: number; needs_reason: boolean; needs_note: boolean }
  | { status: 'skip'; reason: string }
  | { status: 'error'; error: string }

export async function registerCheckIn(): Promise<CheckInResult> {
  const actor = await getActor()
  if (!actor) return { status: 'skip', reason: 'no_actor' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('register_check_in', { p_actor: actor.employeeId })

  if (error) {
    console.error('[registerCheckIn]', error.code, '|', error.message)
    return { status: 'error', error: 'Не удалось отметить приход' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'checked_in') {
    revalidatePath('/dashboard')
    return {
      status: 'checked_in',
      late_minutes: Number(r.late_minutes ?? 0),
      late_grade: String(r.late_grade ?? 'on_time'),
      counts_as_worked: Boolean(r.counts_as_worked),
      attendance_id: String(r.attendance_id ?? ''),
      needs_reason: r.needs_reason === true,
      needs_note: r.needs_note === true,
    }
  }
  if (r.status === 'already') {
    return {
      status: 'already',
      attendance_id: String(r.attendance_id ?? ''),
      late_minutes: Number(r.late_minutes ?? 0),
      needs_reason: r.needs_reason === true,
      needs_note: r.needs_note === true,
    }
  }
  return { status: 'skip', reason: String(r.reason ?? 'skip') }
}

// ─── Уход ─────────────────────────────────────────────────────────────────────
// Кнопка «Закончить смену». Забыли нажать — день остаётся открытым и подсвечивается
// владельцу; конец смены НЕ додумывается (решение владельца).

export type CheckOutResult =
  | { status: 'checked_out'; worked_minutes: number; overtime_minutes: number; shortfall_minutes: number }
  | { status: 'already' }
  | { status: 'error'; error: string }

export async function registerCheckOut(): Promise<CheckOutResult> {
  const actor = await getActor()
  if (!actor) return { status: 'error', error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('register_check_out', { p_actor: actor.employeeId })

  if (error) {
    console.error('[registerCheckOut]', error.code, '|', error.message)
    return { status: 'error', error: 'Не удалось завершить смену' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'checked_out') {
    revalidatePath('/dashboard')
    return {
      status: 'checked_out',
      worked_minutes: Number(r.worked_minutes ?? 0),
      overtime_minutes: Number(r.overtime_minutes ?? 0),
      shortfall_minutes: Number(r.shortfall_minutes ?? 0),
    }
  }
  if (r.status === 'already') return { status: 'already' }
  return {
    status: 'error',
    error: r.reason === 'no_check_in' ? 'Приход за сегодня не отмечен' : 'Не удалось завершить смену',
  }
}

// ─── Подмена ──────────────────────────────────────────────────────────────────

export interface Colleague { id: string; name: string }

const SUBSTITUTION_ERRORS: Record<string, string> = {
  reason_required: 'Укажите причину подмены',
  self_substitution: 'Нельзя подменять самого себя',
  not_tracked: 'Учёт посещаемости для вас не ведётся',
  covered_not_found: 'Сотрудник не найден',
  other_department: 'Коллега из другого отдела',
  outside_window: 'Отметка принимается с 06:00',
  already_marked: 'Приход за сегодня уже отмечен',
  bad_reason_type: 'Выберите причину из списка',
}

/** Причина подмены. При 'illness' замещаемому проставляется больничный за этот день. */
export type SubstitutionReasonType = 'illness' | 'personal' | 'other'

export type SubstitutionResult =
  | { success: true; sickMarked: boolean; sickSkipped: string | null }
  | { success: false; error: string }

export async function registerSubstitution(
  coveringForId: string,
  reason: string,
  reasonType: SubstitutionReasonType,
): Promise<SubstitutionResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }
  if (!reason || reason.trim().length === 0) return { success: false, error: 'Укажите причину подмены' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('register_substitution', {
    p_actor: actor.employeeId,
    p_covering_for: coveringForId,
    p_reason: reason.trim(),
    p_reason_type: reasonType,
  })

  if (error) {
    console.error('[registerSubstitution]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось отметить подмену' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok') {
    revalidatePath('/dashboard')
    return {
      success: true,
      sickMarked: r.sick_marked === true,
      sickSkipped: (r.sick_skipped as string | null) ?? null,
    }
  }
  return { success: false, error: SUBSTITUTION_ERRORS[String(r.reason)] ?? 'Не удалось отметить подмену' }
}

/** Коллеги того же отдела, у кого сегодня рабочий день — для выбора при подмене. */
export async function getSubstitutionCandidates(): Promise<Colleague[]> {
  const actor = await getActor()
  if (!actor || !actor.departmentId) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('employees')
    .select('id, name, schedule_type, schedule_anchor_date, hire_date')
    .eq('department_id', actor.departmentId)
    .neq('id', actor.employeeId)
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('name')

  const today = new Date().toISOString().slice(0, 10)
  return (data ?? [])
    .filter(e => isWorkDay(
      today,
      (e.schedule_type as string) ?? '5/2',
      (e.schedule_anchor_date as string | null) ?? (e.hire_date as string | null),
    ))
    .map(e => ({ id: e.id as string, name: e.name as string }))
}

// ─── Правка владельцем ────────────────────────────────────────────────────────
// Комментарий обязателен и на уровне БД (CHECK), и здесь. Правка и запись в журнал
// идут одной транзакцией внутри correct_attendance.

export interface AttendanceChanges {
  status?: string
  check_in_time?: string | null
  check_out_time?: string | null
  counts_as_worked?: boolean
  comment?: string
}

const CORRECTION_ERRORS: Record<string, string> = {
  comment_required: 'Комментарий к правке обязателен',
  forbidden: 'Недостаточно прав',
  not_found: 'Запись не найдена',
  out_of_scope: 'Сотрудник вне вашей зоны ответственности',
}

export async function correctAttendance(
  attendanceId: string,
  changes: AttendanceChanges,
  comment: string,
): Promise<ActionResult> {
  const actor = await getActor()
  if (!actor) return { success: false, error: 'Не авторизован' }
  if (!comment || comment.trim().length === 0) {
    return { success: false, error: 'Комментарий к правке обязателен' }
  }
  if (!await can(actor, 'attendance', 'edit')) {
    return { success: false, error: 'Недостаточно прав' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('correct_attendance', {
    p_actor: actor.employeeId,
    p_attendance_id: attendanceId,
    p_changes: changes,
    p_comment: comment.trim(),
  })

  if (error) {
    console.error('[correctAttendance]', error.code, '|', error.message)
    return { success: false, error: 'Не удалось сохранить правку' }
  }

  const r = data as Record<string, unknown>
  if (r.status === 'ok') { revalidatePath('/dashboard/attendance'); return { success: true } }
  return { success: false, error: CORRECTION_ERRORS[String(r.reason)] ?? 'Не удалось сохранить правку' }
}

export interface CorrectionEntry {
  id: string
  corrected_by_name: string
  comment: string
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  created_at: string
}

export async function getAttendanceCorrections(attendanceId: string): Promise<CorrectionEntry[]> {
  const actor = await getActor()
  if (!actor) return []
  const scope = await getScope(actor, 'attendance')
  if (scope !== 'team' && scope !== 'all') return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('attendance_corrections')
    .select('id, comment, old_values, new_values, created_at, employees:corrected_by(name)')
    .eq('attendance_id', attendanceId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(r => ({
    id: r.id as string,
    corrected_by_name: (r.employees as unknown as { name: string } | null)?.name ?? '—',
    comment: r.comment as string,
    old_values: (r.old_values ?? {}) as Record<string, unknown>,
    new_values: (r.new_values ?? {}) as Record<string, unknown>,
    created_at: r.created_at as string,
  }))
}

// ─── Счётчики — ТОЛЬКО для управляющих посещаемостью ──────────────────────────
// Сотруднику это действие недоступно: функция БД сама проверяет область видимости
// и не-управляющему возвращает пусто.

export interface AttendanceCounters {
  soft_month: number
  soft_rolling3: number
  hard_month: number
  month_key: string
  rolling3_key: string
}

export async function getAttendanceCounters(employeeId: string): Promise<AttendanceCounters | null> {
  const actor = await getActor()
  if (!actor) return null
  const scope = await getScope(actor, 'attendance')
  if (scope !== 'team' && scope !== 'all') return null

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_attendance_counters', {
    p_actor: actor.employeeId,
    p_employee_id: employeeId,
    p_as_of: null,
  })
  if (error || !data) return null
  const rows = Array.isArray(data) ? data : [data]
  if (rows.length === 0) return null

  const row = rows[0] as Record<string, unknown>
  return {
    soft_month: Number(row.soft_month ?? 0),
    soft_rolling3: Number(row.soft_rolling3 ?? 0),
    hard_month: Number(row.hard_month ?? 0),
    month_key: String(row.month_key ?? ''),
    rolling3_key: String(row.rolling3_key ?? ''),
  }
}

// ─── Мои факты (для сотрудника) ───────────────────────────────────────────────
// Никаких агрегатов: только его дни. Умышленно отдельное действие, чтобы счётчики
// нельзя было получить «заодно».

export interface MyAttendanceDay {
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  late_minutes: number
  overtime_minutes: number
  shortfall_minutes: number
  counts_as_worked: boolean
  is_open: boolean
}

function toMyDay(r: Record<string, unknown>): MyAttendanceDay {
  return {
    date: r.date as string,
    status: r.status as string,
    check_in_time: (r.check_in_time as string | null) ?? null,
    check_out_time: (r.check_out_time as string | null) ?? null,
    late_minutes: Number(r.late_minutes ?? 0),
    overtime_minutes: Number(r.overtime_minutes ?? 0),
    shortfall_minutes: Number(r.shortfall_minutes ?? 0),
    counts_as_worked: Boolean(r.counts_as_worked),
    is_open: r.check_in_time !== null && r.check_out_time === null,
  }
}

const MY_DAY_COLUMNS =
  'date, status, check_in_time, check_out_time, late_minutes, overtime_minutes, shortfall_minutes, counts_as_worked'

export async function getMyAttendance(year: number, month: number): Promise<MyAttendanceDay[]> {
  const actor = await getActor()
  if (!actor) return []

  const daysInMonth = new Date(year, month, 0).getDate()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const admin = createAdminClient()
  const { data } = await admin
    .from('attendance')
    .select(MY_DAY_COLUMNS)
    .eq('employee_id', actor.employeeId)
    .gte('date', from)
    .lte('date', to)
    .order('date')

  return (data ?? []).map(r => toMyDay(r as Record<string, unknown>))
}

/** Состояние сегодняшнего дня — для кнопки «Закончить смену». */
export async function getTodayAttendance(): Promise<MyAttendanceDay | null> {
  const actor = await getActor()
  if (!actor) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('attendance')
    .select(MY_DAY_COLUMNS)
    .eq('employee_id', actor.employeeId)
    .eq('date', new Date().toISOString().slice(0, 10))
    .maybeSingle()

  return data ? toMyDay(data as Record<string, unknown>) : null
}

// ─── Отчёт для управляющих ────────────────────────────────────────────────────
// Правки против прежней версии:
//   • гейт isManager заменён на право attendance.view + область видимости, поэтому
//     бухгалтер получает внятный отказ, а не молча пустую таблицу (аудит 7.2);
//   • применяется getScope: при 'team' видно только свой отдел (было: все отделы);
//   • круг лиц берётся из attendance_tracked, а не из permission_level;
//   • день без записи больше НЕ красится прогулом: различаются no_record,
//     before_hire, future, off и absent (аудит 7.5).

export type DayCellStatus =
  | 'on_time' | 'late_forgiven' | 'late_soft' | 'late_hard' | 'late_critical'
  | 'substitute' | 'absent' | 'off' | 'no_record' | 'not_tracked'
  | 'before_hire' | 'future' | 'manual'

export interface AttendanceCell {
  date: string
  status: DayCellStatus
  attendance_id: string | null
  check_in: string | null
  check_out: string | null
  late_minutes: number
  overtime_minutes: number
  shortfall_minutes: number
  is_open: boolean
  title: string
}

export interface AttendanceRow {
  employee_id: string
  employee_name: string
  role_label: string
  cells: AttendanceCell[]
}

export interface AttendanceReport {
  year: number
  month: number
  days: number
  rows: AttendanceRow[]
}

export type ReportResult =
  | { ok: true; report: AttendanceReport }
  | { ok: false; reason: 'no_access' | 'not_authenticated' }

export async function getAttendanceReport(year: number, month: number): Promise<ReportResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, reason: 'not_authenticated' }

  if (!await can(actor, 'attendance', 'view')) return { ok: false, reason: 'no_access' }
  const scope = await getScope(actor, 'attendance')
  // Таблица по людям имеет смысл только при team/all. Область 'own' — это «вижу себя»,
  // для неё есть getMyAttendance, а не этот отчёт.
  if (scope !== 'team' && scope !== 'all') return { ok: false, reason: 'no_access' }

  const admin = createAdminClient()
  const daysInMonth = new Date(year, month, 0).getDate()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  let empQuery = admin
    .from('employees')
    .select('id, name, role, department_id, schedule_type, schedule_anchor_date, hire_date, status, attendance_tracked_since')
    .is('deleted_at', null)
    .eq('attendance_tracked', true)
    .order('name')

  // Раньше область не применялась вовсе, и руководитель отдела видел все отделы,
  // потому что admin-клиент обходит RLS (аудит 7.4).
  if (scope === 'team') {
    empQuery = empQuery.eq('department_id', actor.departmentId ?? '')
  }

  // Раньше здесь был четвёртый запрос — ВСЕ строки attendance целиком, чтобы найти
  // первую запись каждого сотрудника. Теперь граница учёта хранится в самой карточке
  // (employees.attendance_tracked_since, миграция 084), и таблица целиком не нужна.
  const [{ data: emps }, { data: roleRows }, { data: attRows }] = await Promise.all([
    empQuery,
    admin.from('roles').select('name, label').is('deleted_at', null),
    admin.from('attendance')
      .select('id, employee_id, date, status, check_in_time, check_out_time, late_grade, late_minutes, overtime_minutes, shortfall_minutes, covering_for_employee_id')
      .gte('date', from).lte('date', to),
  ])

  const roleLabels = new Map((roleRows ?? []).map(r => [r.name as string, r.label as string]))
  const byEmpDate = new Map<string, Record<string, unknown>>()
  for (const a of attRows ?? []) {
    byEmpDate.set(`${a.employee_id as string}|${a.date as string}`, a as Record<string, unknown>)
  }

  const todayIso = new Date().toISOString().slice(0, 10)

  const rows: AttendanceRow[] = (emps ?? []).map(e => {
    const empId = e.id as string
    const hire = (e.hire_date as string | null) ?? null
    const schedule = (e.schedule_type as string) ?? '5/2'
    const anchor = (e.schedule_anchor_date as string | null) ?? hire

    const cells: AttendanceCell[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const day = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const rec = byEmpDate.get(`${empId}|${day}`)

      if (rec) {
        const grade = String(rec.late_grade ?? 'on_time')
        const covering = (rec.covering_for_employee_id as string | null) ?? null
        const st: DayCellStatus =
          covering ? 'substitute'
          : rec.status === 'absent' ? 'absent'
          : rec.status === 'day_off' ? 'off'
          : (rec.status === 'sick' || rec.status === 'vacation') ? 'manual'
          : (grade as DayCellStatus)
        const isOpen = rec.check_in_time !== null && rec.check_out_time === null
        const late = Number(rec.late_minutes ?? 0)
        const over = Number(rec.overtime_minutes ?? 0)
        const short = Number(rec.shortfall_minutes ?? 0)
        cells.push({
          date: day,
          status: st,
          attendance_id: rec.id as string,
          check_in: (rec.check_in_time as string | null) ?? null,
          check_out: (rec.check_out_time as string | null) ?? null,
          late_minutes: late,
          overtime_minutes: over,
          shortfall_minutes: short,
          is_open: isOpen,
          title: cellTitle(st, late, isOpen, over, short),
        })
        continue
      }

      // Записи нет — раскладываем причину, а не красим всё прогулом.
      //
      // «Нет отметки» (?) — это ПРОБЛЕМА, и показывать её можно только там, где
      // отсутствие строки действительно что-то доказывает. Доказывает оно только
      // с того дня, с которого по этому сотруднику включён учёт: с этого момента
      // автопрогул (mark_absentees) создаёт строку на каждый его рабочий день,
      // поэтому пустой рабочий день = реальный пробел.
      // Дата своя у каждого — раньше это была одна общая константа на всю компанию,
      // и включение учёта новому человеку задним числом помечало бы пробелами
      // месяцы, когда за ним никто не следил.
      const since = (e.attendance_tracked_since as string | null) ?? null
      let st: DayCellStatus
      if (hire && day < hire) st = 'before_hire'
      else if (day > todayIso) st = 'future'
      else if (since === null || day < since) st = 'not_tracked'
      else if (!isWorkDay(day, schedule, anchor)) st = 'off'
      else st = 'no_record'

      cells.push({
        date: day, status: st, attendance_id: null,
        check_in: null, check_out: null,
        late_minutes: 0, overtime_minutes: 0, shortfall_minutes: 0,
        is_open: false, title: cellTitle(st, 0, false, 0, 0),
      })
    }

    return {
      employee_id: empId,
      employee_name: e.name as string,
      role_label: roleLabels.get(e.role as string) ?? (e.role as string),
      cells,
    }
  })

  return { ok: true, report: { year, month, days: daysInMonth, rows } }
}

function cellTitle(
  st: DayCellStatus, late: number, isOpen: boolean, over: number, short: number,
): string {
  const tail = isOpen ? ' · смена не закрыта'
    : over > 0 ? ` · переработка ${over} мин`
    : short > 0 ? ` · недоработка ${short} мин`
    : ''
  switch (st) {
    case 'on_time':       return 'Вовремя' + tail
    case 'late_forgiven': return `Опоздание ${late} мин (в пределах допустимого)` + tail
    case 'late_soft':     return `Опоздание ${late} мин` + tail
    case 'late_hard':     return `Опоздание ${late} мин` + tail
    case 'late_critical': return `Опоздание ${late} мин — день не зачтён` + tail
    case 'substitute':    return 'Подмена' + tail
    case 'absent':        return 'Прогул'
    case 'off':           return 'Выходной по графику'
    case 'no_record':     return 'Нет отметки за рабочий день'
    case 'not_tracked':   return 'Учёт в этот день не вёлся'
    case 'before_hire':   return 'Ещё не принят'
    case 'future':        return ''
    case 'manual':        return 'Больничный / отпуск'
  }
}

// ─── Сводка контроля (экран для управляющих) ──────────────────────────────────
// Одним запросом по всем сотрудникам: вызывать счётчики по одному было бы N+1,
// а каждый round-trip стоит ~180 мс. Доступ проверяет сама функция БД по правам
// актора — сотруднику она возвращает пусто, поэтому экран для него не наполнится
// даже при прямом обращении к действию.

export interface AttendanceSummaryRow {
  employee_id: string
  employee_name: string
  role_label: string
  soft_month: number
  soft_rolling3: number
  hard_month: number
  absences_month: number
  open_days_month: number
  unmarked_subs: number
  worked_days_month: number
  overtime_month: number
  shortfall_month: number
}

// Результат различает «нет доступа» и «данных нет». Раньше действие отдавало
// просто массив, и экран не мог их разделить — приходилось писать «либо никого
// нет на учёте, либо у вас нет прав», а владельцу, у которого права есть, это
// читалось как подозрение в отсутствии доступа.
export type SummaryResult =
  | { ok: true; rows: AttendanceSummaryRow[] }
  | { ok: false; reason: 'no_access' | 'not_authenticated' }

export async function getAttendanceSummary(
  year: number, month: number,
): Promise<SummaryResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, reason: 'not_authenticated' }
  const scope = await getScope(actor, 'attendance')
  if (scope !== 'team' && scope !== 'all') return { ok: false, reason: 'no_access' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_attendance_summary', {
    p_actor: actor.employeeId,
    p_year: year,
    p_month: month,
  })
  if (error) {
    console.error('[getAttendanceSummary]', error.code, '|', error.message)
    return { ok: true, rows: [] }
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map(r => ({
    employee_id: r.employee_id as string,
    employee_name: r.employee_name as string,
    role_label: r.role_label as string,
    soft_month: Number(r.soft_month ?? 0),
    soft_rolling3: Number(r.soft_rolling3 ?? 0),
    hard_month: Number(r.hard_month ?? 0),
    absences_month: Number(r.absences_month ?? 0),
    open_days_month: Number(r.open_days_month ?? 0),
    unmarked_subs: Number(r.unmarked_subs ?? 0),
    worked_days_month: Number(r.worked_days_month ?? 0),
    overtime_month: Number(r.overtime_month ?? 0),
    shortfall_month: Number(r.shortfall_month ?? 0),
  }))
  return { ok: true, rows }
}

/** Одна запись целиком — для окна правки. */
export interface AttendanceRecord {
  id: string
  employee_id: string
  employee_name: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  planned_start: string
  planned_end: string
  late_minutes: number
  late_grade: string
  counts_as_worked: boolean
  overtime_minutes: number
  shortfall_minutes: number
  covering_for_name: string | null
  substitution_reason: string | null
  comment: string | null
}

export async function getAttendanceRecord(attendanceId: string): Promise<AttendanceRecord | null> {
  const actor = await getActor()
  if (!actor) return null
  const scope = await getScope(actor, 'attendance')
  if (scope !== 'team' && scope !== 'all') return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('attendance')
    .select('id, employee_id, date, status, check_in_time, check_out_time, planned_start, planned_end, late_minutes, late_grade, counts_as_worked, overtime_minutes, shortfall_minutes, substitution_reason, comment, employee:employee_id(name), covering:covering_for_employee_id(name)')
    .eq('id', attendanceId)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id as string,
    employee_id: data.employee_id as string,
    employee_name: (data.employee as unknown as { name: string } | null)?.name ?? '—',
    date: data.date as string,
    status: data.status as string,
    check_in_time: (data.check_in_time as string | null) ?? null,
    check_out_time: (data.check_out_time as string | null) ?? null,
    planned_start: data.planned_start as string,
    planned_end: data.planned_end as string,
    late_minutes: Number(data.late_minutes ?? 0),
    late_grade: data.late_grade as string,
    counts_as_worked: Boolean(data.counts_as_worked),
    overtime_minutes: Number(data.overtime_minutes ?? 0),
    shortfall_minutes: Number(data.shortfall_minutes ?? 0),
    covering_for_name: (data.covering as unknown as { name: string } | null)?.name ?? null,
    substitution_reason: (data.substitution_reason as string | null) ?? null,
    comment: (data.comment as string | null) ?? null,
  }
}
