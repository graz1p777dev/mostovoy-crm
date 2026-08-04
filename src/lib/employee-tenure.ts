// ─── Стаж сотрудника: вычисление из даты приёма ───────────────────────────────
// Используется в досье сотрудника (вкладка «Обзор») и в списке сотрудников
// рядом с датой приёма. Единый источник правды, чтобы цифра нигде не разъезжалась.

/** Разбор DATE-строки 'YYYY-MM-DD' по компонентам — без сдвига часового пояса.
 *  new Date('2026-04-01') даёт полночь UTC и в отрицательных зонах «уезжает» на день назад. */
function parseDateOnly(iso: string): { y: number; m: number; d: number } | null {
  const parts = iso.slice(0, 10).split('-')
  if (parts.length !== 3) return null
  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return { y, m, d }
}

/** Полных месяцев с даты приёма. null — дата не задана/некорректна.
 *  Отрицательное значение (приём в будущем) нормализуется к 0. */
export function tenureInMonths(hireDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!hireDate) return null
  const h = parseDateOnly(hireDate)
  if (!h) return null

  let months = (now.getFullYear() - h.y) * 12 + (now.getMonth() + 1 - h.m)
  // Месяц засчитывается только когда наступило «то же число» — иначе 31.01→01.02 даст «1 мес».
  if (now.getDate() < h.d) months -= 1
  return months < 0 ? 0 : months
}

/** Русская форма числительного: 1 год, 2 года, 5 лет. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  switch (n % 10) {
    case 1:  return one
    case 2:
    case 3:
    case 4:  return few
    default: return many
  }
}

/** Компактно — для таблицы: «3 мес», «1 г 2 мес», «2 г». Пустая строка, если даты нет. */
export function formatTenureShort(hireDate: string | null | undefined, now: Date = new Date()): string {
  const months = tenureInMonths(hireDate, now)
  if (months === null) return ''
  if (months < 1) return 'меньше мес.'

  const years = Math.floor(months / 12)
  const rest  = months % 12
  if (years === 0) return `${rest} мес`
  if (rest === 0)  return `${years} г`
  return `${years} г ${rest} мес`
}

/** Развёрнуто — для карточки-досье: «работает 3 месяца», «работает 2 года 4 месяца». */
export function formatTenureLong(hireDate: string | null | undefined, now: Date = new Date()): string {
  const months = tenureInMonths(hireDate, now)
  if (months === null) return 'дата приёма не указана'
  if (months < 1) return 'работает меньше месяца'

  const years = Math.floor(months / 12)
  const rest  = months % 12
  const yearsPart  = years > 0 ? `${years} ${plural(years, 'год', 'года', 'лет')}` : ''
  const monthsPart = rest  > 0 ? `${rest} ${plural(rest, 'месяц', 'месяца', 'месяцев')}` : ''
  return `работает ${[yearsPart, monthsPart].filter(Boolean).join(' ')}`
}
