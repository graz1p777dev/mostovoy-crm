// ─── Единый интерфейс данных Декомпозиции ─────────────────────────────────────
// Все компоненты получают данные только через этот контракт.
// UI не содержит вычислений — только отображение готовых значений.

// ── Период ────────────────────────────────────────────────────────────────────

export type PeriodStatus = 'active' | 'done' | 'future'

export interface PeriodData {
  year: number
  month: number            // 0-indexed
  daysInMonth: number
  workDays: number
  daysPassed: number
  progressPct: number      // % прошедших дней
  status: PeriodStatus
}

// ── Карточка плана ─────────────────────────────────────────────────────────────

export interface PlanData {
  name: string
  period: PeriodData
}

// ── Конверсия ──────────────────────────────────────────────────────────────────

export interface ConversionRow {
  label: string
  fact: number    // реальный %
  target: number  // ориентир %
  delta: number   // fact - target
  ok: boolean
}

export interface ConversionData {
  rows: ConversionRow[]
}

// ── Быстрые KPI ────────────────────────────────────────────────────────────────

export interface KpiItem {
  label: string
  value: number   // в KGS
  sub: string     // подпись (ориентир / факт / за месяц)
  color: string
  icon: string
}

// ── Итоги команды ──────────────────────────────────────────────────────────────

export interface SummaryRow {
  label: string
  plan: number
  fact: number
  pct: number          // уже вычислен в сервисе
  isMoney: boolean
  hasTarget: boolean   // false → показывать «аналитика» вместо прогресса
}

// ── Ежедневная статистика ──────────────────────────────────────────────────────

export interface DailyStatRow {
  day: number
  date: Date
  isWeekend: boolean
  isFuture: boolean
  isToday: boolean
  // Источник: amoCRM / AI
  appeals: number
  leads: number
  nv: number
  // Источник: Записи клиентов
  fv: number
  // Источник: Товароучёт
  salesFV: number
  revFV: number
  bezNV: number
  salesNV: number
  revNV: number
  // Источник: KPI (расчётные)
  avgFV: number
  avgNV: number
  // Источник: Финансы
  delivery: number
}

// ── Корневой интерфейс ─────────────────────────────────────────────────────────

export interface DecompositionData {
  plan: PlanData
  kpi: KpiItem[]
  conversion: ConversionData
  summary: SummaryRow[]
  daily: DailyStatRow[]
}
