// ─── Model: Зарплата ──────────────────────────────────────────────────────────

import type { MoneyKGS, PeriodMeta, NamedEntity } from './common'

export interface EmployeeSalaryRow {
  employee:    NamedEntity
  role:        string
  baseSalary:  MoneyKGS
  bonus:       MoneyKGS
  penalty:     MoneyKGS
  total:       MoneyKGS
  kpiPct:      number       // % выполнения KPI
  isPaid:      boolean
}

export interface SalaryKpiData {
  totalFund:   MoneyKGS     // общий ФОТ
  totalBonus:  MoneyKGS
  avgSalary:   MoneyKGS
  period:      PeriodMeta
}

export interface SalaryData {
  kpi:      SalaryKpiData
  rows:     EmployeeSalaryRow[]
}
