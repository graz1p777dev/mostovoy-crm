// ─── SupabaseEmployeesAdapter ─────────────────────────────────────────────────
// Работает только на сервере (admin client). Не импортировать из 'use client' файлов.

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  IEmployeesAdapter,
  EmployeesRaw,
  EmployeeRaw,
  EmployeeKpiPlanRaw,
  EmployeeDecompRaw,
} from '../../contracts/IEmployeesAdapter'

export class SupabaseEmployeesAdapter implements IEmployeesAdapter {
  async fetchData(year: number, month: number): Promise<EmployeesRaw> {
    const admin = createAdminClient()

    const [empsRes, depsRes, kpiRes, decompRes] = await Promise.all([
      admin
        .from('employees')
        .select('id,name,email,phone,role,status,hire_date,base_salary,kpi_coefficient,schedule_type,deleted_at,department_id')
        .neq('role', 'owner')   // владелец — системная сущность, не отображается в модуле сотрудников
        .order('name'),
      admin.from('departments').select('id,name'),
      admin
        .from('employee_kpi')
        .select('employee_id,plan_fv,plan_sales,plan_revenue,plan_appeals,plan_leads,plan_nv,plan_work_days')
        .eq('period_year', year)
        .eq('period_month', month),
      admin
        .from('sales_plan_weekly')
        .select('employee_id,total_fv_fact,total_sales_fact,total_revenue_fact,total_work_days_fact,kpi_pct')
        .eq('period_year', year)
        .eq('period_month', month),
    ])

    const deptMap = new Map<string, string>(
      (depsRes.data ?? []).map((d: { id: string; name: string }) => [d.id, d.name])
    )

    const employees: EmployeeRaw[] = (empsRes.data ?? []).map((e: {
      id: string; name: string; email: string; phone: string | null
      role: string; status: string; hire_date: string | null
      base_salary: number; kpi_coefficient: number; schedule_type: string
      deleted_at: string | null; department_id: string | null
    }) => ({
      id:              e.id,
      name:            e.name,
      email:           e.email,
      phone:           e.phone,
      role:            e.role,
      status:          e.status,
      hire_date:       e.hire_date,
      base_salary:     Number(e.base_salary),
      kpi_coefficient: Number(e.kpi_coefficient),
      schedule_type:   e.schedule_type,
      deleted_at:      e.deleted_at,
      department_name: e.department_id ? (deptMap.get(e.department_id) ?? null) : null,
    }))

    const kpiPlans: EmployeeKpiPlanRaw[] = (kpiRes.data ?? []).map((k: {
      employee_id: string; plan_fv: number | null; plan_sales: number | null
      plan_revenue: number | null; plan_appeals: number | null
      plan_leads: number | null; plan_nv: number | null; plan_work_days: number | null
    }) => ({
      employee_id:   k.employee_id,
      plan_fv:       k.plan_fv,
      plan_sales:    k.plan_sales,
      plan_revenue:  k.plan_revenue,
      plan_appeals:  k.plan_appeals,
      plan_leads:    k.plan_leads,
      plan_nv:       k.plan_nv,
      plan_work_days:k.plan_work_days,
    }))

    const decompositions: EmployeeDecompRaw[] = (decompRes.data ?? []).map((d: {
      employee_id: string; total_fv_fact: number; total_sales_fact: number
      total_revenue_fact: number; total_work_days_fact: number; kpi_pct: number
    }) => ({
      employee_id:         d.employee_id,
      total_fv_fact:       Number(d.total_fv_fact),
      total_sales_fact:    Number(d.total_sales_fact),
      total_revenue_fact:  Number(d.total_revenue_fact),
      total_work_days_fact:Number(d.total_work_days_fact),
      kpi_pct:             Number(d.kpi_pct),
    }))

    return { year, month, employees, kpiPlans, decompositions }
  }
}
