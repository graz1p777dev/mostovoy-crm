// ─── Model: Сотрудники ────────────────────────────────────────────────────────

export interface EmployeeKpiPlan {
  planFv:       number
  planSales:    number
  planRevenue:  number
  planAppeals:  number
  planLeads:    number
  planNv:       number
  planWorkDays: number
}

export interface EmployeeKpiFact {
  factFv:       number
  factSales:    number
  factRevenue:  number
  factWorkDays: number
}

export interface EmployeeListRow {
  id:             string
  name:           string
  email:          string
  phone:          string | null
  role:           string
  status:         string
  hireDate:       string | null
  departmentName: string | null
  baseSalary:     number
  kpiCoefficient: number
  scheduleType:   string
  isArchived:     boolean
  // KPI
  kpiPlan: EmployeeKpiPlan
  kpiFact: EmployeeKpiFact
  // Computed by mapper
  kpiPct:      number   // % выполнения KPI
  bonus:       number   // бонус к зарплате
  totalSalary: number   // оклад + бонус
}

export interface EmployeeStats {
  total:       number
  active:      number
  archived:    number
  totalFund:   number   // суммарный ФОТ (totalSalary всех активных)
  avgKpiPct:   number
}

export interface EmployeesData {
  employees: EmployeeListRow[]
  stats:     EmployeeStats
  period:    { year: number; month: number }
}
