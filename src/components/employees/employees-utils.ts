// ─── employees-utils.ts ───────────────────────────────────────────────────────

export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  'Владелец':  { bg: 'var(--brand)', text: 'var(--surface)' },
  'РОП':       { bg: 'var(--brand)', text: 'var(--surface)' },
  'МП':        { bg: 'var(--ink-3)', text: 'var(--ink)' },
  'ЛМАИ':      { bg: 'var(--line-soft)', text: 'var(--ink)' },
  'Бухгалтер': { bg: 'var(--line-soft)', text: 'var(--ink)' },
}

export const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: 'var(--ok-soft)', text: 'var(--ok-strong)', label: 'Активен' },
  probation: { bg: 'var(--warn-soft-2)', text: 'var(--warn-strong-2)', label: 'Испытательный' },
  archived:  { bg: 'var(--paper-2)', text: 'var(--ink-muted)', label: 'Архив' },
}

export function kpiColor(pct: number): string {
  if (pct >= 100) return 'var(--ok-strong)'
  if (pct >= 80)  return 'var(--warn-strong-2)'
  return 'var(--brand-ink)'
}

export function kpiBg(pct: number): string {
  if (pct >= 100) return 'var(--ok-soft)'
  if (pct >= 80)  return 'var(--warn-soft-2)'
  return 'var(--bad-soft)'
}

export function fmtMoney(v: number): string {
  if (v === 0) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'KGS', maximumFractionDigits: 0 }).format(v)
}

export function fmtDate(s: string | null): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export const MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]
