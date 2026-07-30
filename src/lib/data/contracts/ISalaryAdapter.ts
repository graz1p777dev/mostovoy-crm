// ─── Contract: ISalaryAdapter ─────────────────────────────────────────────────
// Реализации: MockSalaryAdapter → SupabaseSalaryAdapter

export interface SalaryRecordRaw {
  employee_id:   string
  employee_name: string
  role:          string
  base:          number
  bonus:         number
  penalty:       number
  total:         number
  kpi_pct:       number
  is_paid:       boolean
}

export interface SalaryRaw {
  year:  number
  month: number
  rows:  SalaryRecordRaw[]
}

export interface ISalaryAdapter {
  fetchData(year: number, month: number): Promise<SalaryRaw>
}
