// ─── Service: Зарплата ────────────────────────────────────────────────────────
// Агрегирует данные из Salary Provider + Employees (Supabase).
//
// Поток данных:
//   Salary Provider    → оклады, бонусы, штрафы
//   Employees (DB)     → имена, роли, отделы
//   KPI Provider       → % выполнения KPI (для расчёта бонуса)
//         ↓
//   SalaryData → UI (/dashboard/salary)

import type { SalaryData } from '@/lib/models/salary'

export async function getSalaryData(
  _year:  number,
  _month: number,
): Promise<SalaryData> {
  // TODO Шаг 5:
  // const [records, bonuses, penalties, employees] = await Promise.all([
  //   salaryProvider.fetchSalaryRecords(year, month),
  //   salaryProvider.fetchBonuses(from, to),
  //   salaryProvider.fetchPenalties(from, to),
  //   getEmployees(false),
  // ])
  // return aggregateSalaryData(records, bonuses, penalties, employees, year, month)
  return {
    kpi: {
      totalFund: 0, totalBonus: 0, avgSalary: 0,
      period: { year: _year, month: _month, daysInMonth: 30, workDays: 22, daysPassed: 0, progressPct: 0, status: 'future' },
    },
    rows: [],
  }
}
