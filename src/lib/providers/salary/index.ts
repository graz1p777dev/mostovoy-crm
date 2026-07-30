// ─── Provider: Зарплата ───────────────────────────────────────────────────────
// Ответственность: оклады, бонусы, штрафы, выплаты.
//
// Подключение:
//   Supabase таблицы: `salary_records`, `bonuses`, `penalties`, `employees`
//   Клиент: createAdminClient() — HR-данные закрыты RLS для mp/lmai

import type { ISODateString, MoneyKGS } from '@/lib/models/common'

export interface SalaryRecordRaw {
  employee_id: string
  month:       ISODateString    // первый день месяца
  base:        MoneyKGS
  bonus:       MoneyKGS
  penalty:     MoneyKGS
  total:       MoneyKGS
  is_paid:     boolean
  paid_at:     ISODateString | null
}

export interface BonusRaw {
  employee_id: string
  date:        ISODateString
  amount:      MoneyKGS
  reason:      string
}

export interface PenaltyRaw {
  employee_id: string
  date:        ISODateString
  amount:      MoneyKGS
  reason:      string
}

export async function fetchSalaryRecords(
  _year:  number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<SalaryRecordRaw[]> {
  return []
}

export async function fetchBonuses(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<BonusRaw[]> {
  return []
}

export async function fetchPenalties(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<PenaltyRaw[]> {
  return []
}
