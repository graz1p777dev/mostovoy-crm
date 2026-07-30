// ─── Общие типы — используются во всех моделях ───────────────────────────────
// UI работает только с этими типами. Никакого знания о API, amoCRM или таблицах.

export type ISODateString = string          // 'yyyy-MM-dd'
export type ISODateTimeString = string      // 'yyyy-MM-ddTHH:mm:ssZ'
export type MoneyKGS = number               // сумма в KGS (целое)

export type PeriodStatus = 'active' | 'done' | 'future'

export interface DateRange {
  from: ISODateString
  to:   ISODateString
}

export interface PeriodMeta {
  year:        number
  month:       number          // 0-based (как Date.getMonth())
  daysInMonth: number
  workDays:    number
  daysPassed:  number
  progressPct: number          // 0..100
  status:      PeriodStatus
}

export interface PaginationMeta {
  page:    number
  perPage: number
  total:   number
}

export interface NamedEntity {
  id:   string
  name: string
}

export type UserRole = 'owner' | 'rop' | 'mp' | 'lmai' | 'accountant'
