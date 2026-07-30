'use server'
// ─── EmployeesService ─────────────────────────────────────────────────────────
// 'use server' позволяет вызывать из Client Components через useEffect.
// Adapter использует admin client — SUPABASE_SERVICE_ROLE_KEY только на сервере.

import { employeesRepository } from '../data/repository/EmployeesRepository'
import type { EmployeesData }   from '../models/employees'

export async function getEmployeesData(year: number, month: number): Promise<EmployeesData> {
  return employeesRepository.getData(year, month)
}
