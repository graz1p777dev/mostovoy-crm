// Чистые функции расчёта рабочих дней по графику и динамической дневной нормы.
// Используются в Server Actions и юнит-тестах — без зависимостей от React/Supabase.

/** Статусы attendance, при которых день НЕ считается рабочим */
export const NON_WORKING_STATUSES = ['sick', 'day_off', 'vacation', 'absent'] as const

const MS_PER_DAY = 86_400_000

function parseDate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / MS_PER_DAY)
}

/**
 * Рабочий ли день по графику.
 * «5/2», «6/1» — по дню недели; «2/2», «3 через 1» — цикл от anchor.
 * Неизвестный график трактуется как «5/2» (наиболее строгий разумный дефолт).
 */
export function isWorkDay(dateIso: string, scheduleType: string, anchorIso: string | null): boolean {
  const dow = parseDate(dateIso).getDay() // 0 = вс

  switch (scheduleType) {
    case '5/2':
      return dow >= 1 && dow <= 5
    case '6/1':
      return dow >= 1 && dow <= 6
    case '2/2': {
      const anchor = anchorIso ?? dateIso // без якоря: день считается началом цикла
      const offset = ((daysBetween(anchor, dateIso) % 4) + 4) % 4
      return offset < 2
    }
    case '3 через 1': {
      const anchor = anchorIso ?? dateIso
      const offset = ((daysBetween(anchor, dateIso) % 4) + 4) % 4
      return offset < 3
    }
    default:
      return dow >= 1 && dow <= 5
  }
}

/**
 * Количество рабочих дней в диапазоне [fromIso..toIso] включительно.
 * absences — даты (YYYY-MM-DD) с нерабочим статусом из attendance
 *   (sick/day_off/vacation/absent): ВЫЧИТАЮТСЯ из графика.
 * extraDays — даты, отработанные фактически ВНЕ графика (подмена коллеги,
 *   доп. выход): ДОБАВЛЯЮТСЯ, даже если по графику это выходной.
 *
 * Итог для дня: (рабочий_по_графику И не absence) ИЛИ отработан_фактически.
 * absences имеет приоритет над графиком; extraDays — над absences не нужен
 * (нельзя одновременно отсутствовать и подменять), но extra всегда добавляет.
 */
export function countWorkDays(
  fromIso: string,
  toIso: string,
  scheduleType: string,
  anchorIso: string | null,
  absences: ReadonlySet<string> = new Set(),
  extraDays: ReadonlySet<string> = new Set(),
): number {
  if (toIso < fromIso) return 0
  let count = 0
  const cursor = parseDate(fromIso)
  const end = parseDate(toIso)
  let guard = 0
  while (cursor <= end && guard < 400) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const bySchedule = isWorkDay(iso, scheduleType, anchorIso) && !absences.has(iso)
    if (bySchedule || extraDays.has(iso)) count++
    cursor.setDate(cursor.getDate() + 1)
    guard++
  }
  return count
}

/**
 * Динамическая дневная норма:
 *   (личный план − факт с начала периода) ÷ оставшиеся рабочие дни (включая сегодня).
 *
 * Возвращает:
 *  - norm: сколько нужно делать в день (0 — план выполнен)
 *  - remaining: недобранный остаток плана
 *  - done: план уже выполнен/перевыполнен
 *  - noDaysLeft: рабочих дней не осталось, а план не добит
 */
export function dailyNorm(personalPlan: number, factToDate: number, remainingWorkDays: number): {
  norm: number
  remaining: number
  done: boolean
  noDaysLeft: boolean
} {
  const remaining = personalPlan - factToDate
  if (remaining <= 0) {
    return { norm: 0, remaining: 0, done: true, noDaysLeft: false }
  }
  if (remainingWorkDays <= 0) {
    return { norm: 0, remaining, done: false, noDaysLeft: true }
  }
  return { norm: Math.ceil(remaining / remainingWorkDays), remaining, done: false, noDaysLeft: false }
}

/** Равномерное распределение с остатком на первых участников; сумма = total */
export function distEven(total: number, n: number): number[] {
  if (n <= 0) return []
  // Один участник — весь план как есть, без округления (важно для дробной выручки)
  if (n === 1) return [total]
  const t = Math.round(total)
  const base = Math.floor(t / n)
  const rem  = t - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}
