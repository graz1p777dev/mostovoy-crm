// ─── Contract: IEmployeesAdapter ─────────────────────────────────────────────

export interface EmployeeRaw {
  id:             string
  name:           string
  email:          string
  phone:          string | null
  role:           string
  status:         string
  hire_date:      string | null
  base_salary:    number
  kpi_coefficient:number
  schedule_type:  string
  deleted_at:     string | null
  department_name:string | null
}

export interface EmployeeKpiPlanRaw {
  employee_id:   string
  plan_fv:       number | null
  plan_sales:    number | null
  plan_revenue:  number | null
  plan_appeals:  number | null
  plan_leads:    number | null
  plan_nv:       number | null
  plan_work_days:number | null
}

export interface EmployeeDecompRaw {
  employee_id:         string
  total_fv_fact:       number
  total_sales_fact:    number
  total_revenue_fact:  number
  total_work_days_fact:number
  kpi_pct:             number
}

export interface EmployeesRaw {
  year:          number
  month:         number
  employees:     EmployeeRaw[]
  kpiPlans:      EmployeeKpiPlanRaw[]
  decompositions:EmployeeDecompRaw[]
}

export interface IEmployeesAdapter {
  fetchData(year: number, month: number): Promise<EmployeesRaw>
}
