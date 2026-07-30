// ─── Contract: IFinanceAdapter ────────────────────────────────────────────────

export interface FinanceDayRaw {
  date:         string
  revenue:      number
  transactions: number
  expPayroll:   number
  expMarketing: number
  expRent:      number
  expSupplies:  number
  expOther:     number
}

export interface FinanceRaw {
  year:  number
  month: number
  days:  FinanceDayRaw[]
}

export interface IFinanceAdapter {
  fetchData(year: number, month: number): Promise<FinanceRaw>
}
