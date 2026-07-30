// ─── MockDecompositionAdapter ─────────────────────────────────────────────────
// Реализует IDecompositionAdapter с детерминированными тестовыми данными.
// Замена на AmoCrmDecompositionAdapter не затронет Repository, Mapper, Service и UI.

import type { IDecompositionAdapter, DecompositionRaw, DailyStatRaw } from '../../contracts/IDecompositionAdapter'

const SEED = [11,14,16,8,12,9,15,13,10,7,14,11,9,16,12,8,13,10,15,0,0,0,0,0,0,0,0,0,0,0,0]

const PLAN_TARGETS = {
  name:     'Общий план компании',
  workDays: 22,
  appeals:  320,
  leads:    160,
  nv:       64,
  fv:       48,
  salesFV:  28,
  revFV:    2_380_000,
  salesNV:  0,
  revNV:    0,
  avgCheck: 85_000,
  conv: {
    appealsLeads: 70,
    leadsNV:      40,
    nvFV:         60,
    fvSale:       60,
    leadSale:     20,
    nvSale:       78,
  },
}

export class MockDecompositionAdapter implements IDecompositionAdapter {
  async fetchData(year: number, month: number): Promise<DecompositionRaw> {
    const today       = new Date()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const daily: DailyStatRaw[] = Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(year, month, i + 1)
      const s    = date <= today ? (SEED[i] ?? 0) : 0
      const pad  = (n: number) => String(n).padStart(2, '0')
      return {
        date:     `${year}-${pad(month + 1)}-${pad(i + 1)}`,
        appeals:  s > 0 ? s + 3 : 0,
        leads:    s > 0 ? Math.floor(s / 2) : 0,
        nv:       s > 0 ? Math.floor(s / 4) : 0,
        fv:       s > 0 ? Math.floor(s / 5) : 0,
        salesFV:  s > 0 ? Math.floor(s / 7) : 0,
        revFV:    s > 0 ? s * 7_800 : 0,
        bezNV:    s > 0 ? Math.floor(s / 8) : 0,
        salesNV:  s > 0 ? Math.floor(s / 9) : 0,
        revNV:    s > 0 ? s * 4_200 : 0,
        delivery: s > 0 ? s * 80 : 0,
      }
    })

    return { year, month, plan: PLAN_TARGETS, daily }
  }
}
