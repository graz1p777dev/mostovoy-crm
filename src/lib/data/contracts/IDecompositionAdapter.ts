// ─── Contract: IDecompositionAdapter ─────────────────────────────────────────
// Интерфейс, который должен реализовать ЛЮБОЙ источник данных декомпозиции.
// Adapter знает только как достать сырые данные — никакой бизнес-логики.
//
// Реализации:
//   MockDecompositionAdapter   — текущий мок (Sprint 6)
//   AmoCrmDecompositionAdapter — amoCRM + Records + Warehouse (Шаг 3+)

export interface DailyStatRaw {
  date:     string    // 'yyyy-MM-dd'
  appeals:  number
  leads:    number
  nv:       number
  fv:       number
  salesFV:  number
  revFV:    number
  bezNV:    number
  salesNV:  number
  revNV:    number
  delivery: number
}

export interface ConversionTargets {
  appealsLeads: number   // % цель: обращение → лид
  leadsNV:      number
  nvFV:         number
  fvSale:       number
  leadSale:     number
  nvSale:       number
}

export interface PlanTargets {
  name:     string
  workDays: number
  appeals:  number
  leads:    number
  nv:       number
  fv:       number
  salesFV:  number
  revFV:    number
  salesNV:  number
  revNV:    number
  avgCheck: number
  conv:     ConversionTargets
}

export interface DecompositionRaw {
  year:    number
  month:   number
  plan:    PlanTargets
  daily:   DailyStatRaw[]
}

export interface IDecompositionAdapter {
  fetchData(year: number, month: number): Promise<DecompositionRaw>
}
