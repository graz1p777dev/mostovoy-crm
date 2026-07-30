// ─── EmployeesMapper ──────────────────────────────────────────────────────────
// Все вычисления: KPI%, бонус, итоговая зарплата — только здесь.

import type { EmployeesRaw, EmployeeRaw, EmployeeKpiPlanRaw, EmployeeDecompRaw } from '../contracts/IEmployeesAdapter'
import type { EmployeeListRow, EmployeeKpiPlan, EmployeeKpiFact, EmployeesData, EmployeeStats } from '@/lib/models/employees'

const ROLE_LABELS: Record<string, string> = {
  owner:     'Владелец',
  rop:       'РОП',
  mp:        'МП',
  lmai:      'ЛМАИ',
  accountant:'Бухгалтер',
}

function mapPlan(raw: EmployeeKpiPlanRaw | undefined): EmployeeKpiPlan {
  return {
    planFv:       raw?.plan_fv       ?? 0,
    planSales:    raw?.plan_sales    ?? 0,
    planRevenue:  raw?.plan_revenue  ?? 0,
    planAppeals:  raw?.plan_appeals  ?? 0,
    planLeads:    raw?.plan_leads    ?? 0,
    planNv:       raw?.plan_nv       ?? 0,
    planWorkDays: raw?.plan_work_days ?? 0,
  }
}

function mapFact(raw: EmployeeDecompRaw | undefined): EmployeeKpiFact {
  return {
    factFv:       raw?.total_fv_fact        ?? 0,
    factSales:    raw?.total_sales_fact     ?? 0,
    factRevenue:  raw?.total_revenue_fact   ?? 0,
    factWorkDays: raw?.total_work_days_fact ?? 0,
  }
}

function calcKpiPct(decompRow: EmployeeDecompRaw | undefined, plan: EmployeeKpiPlan): number {
  // Берём kpi_pct из decomposition (уже вычислен PostgreSQL-функцией)
  if (decompRow && decompRow.kpi_pct > 0) return Math.round(decompRow.kpi_pct)
  // Простой fallback: если хотя бы один план задан — считаем по FV
  if (plan.planFv > 0 && decompRow) {
    return Math.min(Math.round((decompRow.total_fv_fact / plan.planFv) * 100), 200)
  }
  return 0
}

function calcBonus(baseSalary: number, kpiCoefficient: number, kpiPct: number): number {
  // Бонус = оклад * коэффициент * % выполнения (кап 150%)
  if (baseSalary <= 0) return 0
  const pctCapped = Math.min(kpiPct / 100, 1.5)
  return Math.round(baseSalary * kpiCoefficient * pctCapped)
}

function mapEmployee(
  emp: EmployeeRaw,
  planRaw: EmployeeKpiPlanRaw | undefined,
  decompRaw: EmployeeDecompRaw | undefined,
): EmployeeListRow {
  const kpiPlan = mapPlan(planRaw)
  const kpiFact = mapFact(decompRaw)
  const kpiPct  = calcKpiPct(decompRaw, kpiPlan)
  const bonus   = calcBonus(emp.base_salary, emp.kpi_coefficient, kpiPct)

  return {
    id:             emp.id,
    name:           emp.name,
    email:          emp.email,
    phone:          emp.phone,
    role:           ROLE_LABELS[emp.role] ?? emp.role,
    status:         emp.status,
    hireDate:       emp.hire_date,
    departmentName: emp.department_name,
    baseSalary:     emp.base_salary,
    kpiCoefficient: emp.kpi_coefficient,
    scheduleType:   emp.schedule_type,
    isArchived:     emp.deleted_at !== null,
    kpiPlan,
    kpiFact,
    kpiPct,
    bonus,
    totalSalary: emp.base_salary + bonus,
  }
}

export class EmployeesMapper {
  static map(raw: EmployeesRaw): EmployeesData {
    const planMap  = new Map(raw.kpiPlans.map(p => [p.employee_id, p]))
    const decompMap = new Map(raw.decompositions.map(d => [d.employee_id, d]))

    const employees: EmployeeListRow[] = raw.employees.map(emp =>
      mapEmployee(emp, planMap.get(emp.id), decompMap.get(emp.id))
    )

    const active   = employees.filter(e => !e.isArchived)
    const archived = employees.filter(e => e.isArchived)
    const totalFund = active.reduce((s, e) => s + e.totalSalary, 0)
    const avgKpiPct = active.length > 0
      ? Math.round(active.reduce((s, e) => s + e.kpiPct, 0) / active.length)
      : 0

    const stats: EmployeeStats = {
      total:    employees.length,
      active:   active.length,
      archived: archived.length,
      totalFund,
      avgKpiPct,
    }

    return { employees, stats, period: { year: raw.year, month: raw.month } }
  }
}
