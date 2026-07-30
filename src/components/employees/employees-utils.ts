// ─── employees-utils.ts ───────────────────────────────────────────────────────

export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  'Владелец':  { bg: '#e11d1d', text: '#ffffff' },
  'РОП':       { bg: '#e11d1d', text: '#ffffff' },
  'МП':        { bg: '#7d7174', text: '#1b1517' },
  'ЛМАИ':      { bg: '#ebebee', text: '#1b1517' },
  'Бухгалтер': { bg: '#ebebee', text: '#1b1517' },
}

export const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: '#dcfce7', text: '#166534', label: 'Активен' },
  probation: { bg: '#fef9c3', text: '#854d0e', label: 'Испытательный' },
  archived:  { bg: '#fdfbfb', text: '#6b7280', label: 'Архив' },
}

export function kpiColor(pct: number): string {
  if (pct >= 100) return '#166534'
  if (pct >= 80)  return '#854d0e'
  return '#c01818'
}

export function kpiBg(pct: number): string {
  if (pct >= 100) return '#dcfce7'
  if (pct >= 80)  return '#fef9c3'
  return '#fee2e2'
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
