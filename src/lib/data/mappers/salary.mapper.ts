// ─── SalaryMapper ─────────────────────────────────────────────────────────────

import type { SalaryRaw } from '../contracts/ISalaryAdapter'
import type { SalaryData } from '@/lib/models/salary'

export const SalaryMapper = {
  map(raw: SalaryRaw): SalaryData {
    const rows = raw.rows.map(r => ({
      employee:   { id: r.employee_id, name: r.employee_name },
      role:       r.role,
      baseSalary: r.base,
      bonus:      r.bonus,
      penalty:    r.penalty,
      total:      r.total,
      kpiPct:     r.kpi_pct,
      isPaid:     r.is_paid,
    }))

    const totalFund  = rows.reduce((s, r) => s + r.total, 0)
    const totalBonus = rows.reduce((s, r) => s + r.bonus, 0)
    const avgSalary  = rows.length === 0 ? 0 : Math.round(totalFund / rows.length)

    return {
      kpi: {
        totalFund, totalBonus, avgSalary,
        period: { year: raw.year, month: raw.month, daysInMonth: 30, workDays: 22, daysPassed: 0, progressPct: 0, status: 'future' },
      },
      rows,
    }
  },
}
