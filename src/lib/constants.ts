import type {
  ConsultationStatus,
  ActualStatus,
  StatusAfterFv,
  AlbStatus,
  AttendanceStatus,
  UserRole,
  EmployeeStatus,
  SalaryStatus,
} from '@/types'

// ============================================================
// Consultation status labels & colors
// ============================================================

export const CONSULTATION_STATUS_MAP: Record<
  ConsultationStatus,
  { label: string; color: string; bg: string }
> = {
  'Придёт':      { label: 'Придёт',      color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  'Не придёт':   { label: 'Не придёт',   color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  'Перезапись':  { label: 'Перезапись',  color: 'var(--warn-strong)', bg: 'var(--warn-soft)' },
  'Отменил':     { label: 'Отменил',     color: 'var(--ink-muted)', bg: 'var(--paper-2)' },
  'Не отвечает': { label: 'Не отвечает', color: 'var(--brand-ink)', bg: 'var(--paper-2)' },
}

export const ACTUAL_STATUS_MAP: Record<
  ActualStatus,
  { label: string; color: string; bg: string }
> = {
  'Пришла':    { label: 'Пришла',    color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  'Не пришла': { label: 'Не пришла', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
}

export const STATUS_AFTER_FV_MAP: Record<
  StatusAfterFv,
  { label: string; color: string; bg: string }
> = {
  'Купила':    { label: 'Купила',    color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  'Не купила': { label: 'Не купила', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  'Предоплата':{ label: 'Предоплата',color: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  'Дожать':    { label: 'Дожать',    color: 'var(--warn-strong)', bg: 'var(--warn-soft)' },
  'Отказ':     { label: 'Отказ',     color: 'var(--ink-muted)', bg: 'var(--paper-2)' },
}

export const NOTIFICATION_TYPE_MAP: Record<
  string,
  { label: string; icon: string; color: string; bg: string }
> = {
  server_load:            { label: 'Нагрузка сервера',     icon: '⚠️', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  sale_lead:               { label: 'Хочет купить',         icon: '🛒', color: 'var(--ok-strong)', bg: 'var(--ok-border-2)' },
  consultation_booked:     { label: 'Запись на консультацию', icon: '📅', color: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  consultation_reminder:   { label: 'Скоро консультация',   icon: '⏰', color: 'var(--warn-strong)', bg: 'var(--warn-soft)' },
  deploy:                   { label: 'Деплой',               icon: '🚀', color: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  security:                 { label: 'Безопасность',         icon: '🔒', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  audit:                    { label: 'Изменение записи',     icon: '✏️', color: 'var(--ink-muted)', bg: 'var(--paper-2)' },
  kpi_alert:                { label: 'KPI',                  icon: '📉', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  kpi_success:              { label: 'KPI',                  icon: '📈', color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  plan_100:                 { label: 'План выполнен',        icon: '🎯', color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  absence:                  { label: 'Отсутствие',           icon: '🚫', color: 'var(--warn-strong)', bg: 'var(--warn-soft)' },
  salary_ready:             { label: 'Зарплата',             icon: '💰', color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  finance_alert:            { label: 'Финансы',              icon: '💸', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  sale:                      { label: 'Продажа',              icon: '✅', color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  system:                   { label: 'Система',              icon: 'ℹ️', color: 'var(--ink-muted)', bg: 'var(--paper-2)' },
}

export const ALB_STATUS_MAP: Record<
  AlbStatus,
  { label: string; color: string; bg: string }
> = {
  'Не записан': { label: 'Не записан', color: 'var(--ink-muted)', bg: 'var(--paper-2)' },
  'Записан':    { label: 'Записан',    color: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  'Пришёл':     { label: 'Пришёл',    color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
  'Не пришёл':  { label: 'Не пришёл', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
  'Купил':      { label: 'Купил',     color: 'var(--ok-strong)', bg: 'var(--ok-border-2)' },
}

export const FORMAT_BADGE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  'Онлайн': { label: 'Онлайн', color: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  'Офлайн': { label: 'Офлайн', color: 'var(--orange-strong)', bg: 'var(--orange-tint)' },
}

// ============================================================
// Attendance status labels & colors
// ============================================================

export const ATTENDANCE_STATUS_MAP: Record<
  AttendanceStatus,
  { label: string; color: string; dot: string }
> = {
  // Точка несёт цвет и может быть яркой (это графика, порог 3:1),
  // а подпись рядом берёт затемнённый вариант того же тона — ей нужен AA.
  present:  { label: 'На месте',  color: 'var(--ok)', dot: 'bg-[var(--ok-base)]' },
  remote:   { label: 'Удалённо',  color: 'var(--brand)', dot: 'bg-[var(--brand)]' },
  absent:   { label: 'Отсутствует',color: 'var(--brand-ink)',dot: 'bg-[var(--brand-ink)]' },
  sick:     { label: 'Больничный',color: 'var(--warn)', dot: 'bg-[var(--warn-base)]' },
  vacation: { label: 'Отпуск',    color: 'var(--brand-ink)', dot: 'bg-[var(--brand-coral)]' },
  day_off:  { label: 'Выходной',  color: 'var(--ink-muted)', dot: 'bg-[var(--ink-4)]' },
  weekend:  { label: 'Выходной',  color: 'var(--ink-muted)', dot: 'bg-[var(--ink-4)]' },
}

// ============================================================
// Employee role labels
// ============================================================

export const ROLE_LABELS: Record<UserRole, string> = {
  owner:     'Владелец',
  rop:       'РОП',
  mp:        'МП',
  lmai:      'LMAI',
  accountant:'Бухгалтер',
}

export const EMPLOYEE_STATUS_MAP: Record<
  EmployeeStatus,
  { label: string; color: string }
> = {
  active:   { label: 'Активен',    color: 'var(--ok)' },
  vacation: { label: 'В отпуске',  color: 'var(--warn)' },
  sick:     { label: 'На больничном', color: 'var(--brand-ink)' },
  archived: { label: 'Архив',      color: 'var(--ink-muted)' },
}

// ============================================================
// Salary status labels & colors
// ============================================================

export const SALARY_STATUS_MAP: Record<
  SalaryStatus,
  { label: string; color: string; bg: string }
> = {
  draft:    { label: 'Черновик',  color: 'var(--ink-muted)', bg: 'var(--paper-2)' },
  approved: { label: 'Утверждён', color: 'var(--warn-strong)', bg: 'var(--warn-soft)' },
  paid:     { label: 'Выплачен',  color: 'var(--ok-strong)', bg: 'var(--ok-soft)' },
}

// ============================================================
// KPI progress thresholds (color breakpoints)
// ============================================================

export const KPI_THRESHOLDS = {
  danger:  30,  // < 30% → crimson
  warning: 60,  // 30–60% → amber
  brand:   90,  // 60–90% → brand red
  success: 100, // ≥ 90% → green
} as const

export function getKpiColor(pct: number): string {
  if (pct < KPI_THRESHOLDS.danger)  return 'var(--brand-ink)' // deep crimson (danger)
  if (pct < KPI_THRESHOLDS.warning) return 'var(--warn)' // amber
  if (pct < KPI_THRESHOLDS.success) return 'var(--brand)' // brand red
  return 'var(--ok)'                                    // green
}

// ============================================================
// Finance transaction types
// ============================================================

export const TRANSACTION_TYPE_LABELS = {
  income:  { label: 'Доход',  color: 'var(--ok)' },
  expense: { label: 'Расход', color: 'var(--brand-ink)' },
} as const

// ============================================================
// Brand palette (from Design System)
// ============================================================

export const BRAND = {
  ink:      'var(--ink)',
  accent:   'var(--brand)',
  steel:    'var(--ink-3)',
  fog:      'var(--line-soft)',
  sidebar:  'var(--ink)',
} as const
