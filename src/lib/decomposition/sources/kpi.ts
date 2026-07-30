// ─── Источник: KPI (расчётные показатели) ────────────────────────────────────
// Этот модуль РАССЧИТЫВАЕТ показатели на основе данных из других источников.
// Компоненты получают уже готовые числа — не считают ничего сами.
//
// В будущем здесь будут формулы:
//   - Конверсии: appeals→leads, leads→nv, nv→fv, fv→sale
//   - Средний чек ФВ = revFV / salesFV
//   - Средний чек без НВ = revNV / salesNV
//   - % выполнения плана
//   - KPI-бонусы по конструктору мотивации (Sprint 7)

export interface KpiDailyMetrics {
  date: string
  avgFV: number   // = revFV / salesFV (0 если нет продаж)
  avgNV: number   // = revNV / salesNV
}

export function calcDailyKpi(params: {
  revFV: number
  salesFV: number
  revNV: number
  salesNV: number
}): KpiDailyMetrics & { date: string } {
  return {
    date: '',
    avgFV: params.salesFV > 0 ? Math.round(params.revFV / params.salesFV) : 0,
    avgNV: params.salesNV > 0 ? Math.round(params.revNV / params.salesNV) : 0,
  }
}

export function calcConversionPct(fact: number, base: number): number {
  if (base === 0) return 0
  return Math.round((fact / base) * 100)
}

export function calcPlanPct(fact: number, plan: number): number {
  if (plan === 0) return 0
  return Math.min(Math.round((fact / plan) * 100), 100)
}
