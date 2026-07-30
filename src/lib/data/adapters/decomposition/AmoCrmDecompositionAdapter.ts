// ─── AmoCrmDecompositionAdapter ───────────────────────────────────────────────
// Будущая реализация: объединяет amoCRM + Records (Supabase) + Warehouse + Finance.
// Пока НЕ реализован — заглушка с документацией по подключению.
//
// Env: AMOCRM_DOMAIN, AMOCRM_ACCESS_TOKEN, AMOCRM_PIPELINE_ID
//
// Как включить (Шаг 3+):
//   В DecompositionRepository.ts заменить:
//     new MockDecompositionAdapter()
//   На:
//     new AmoCrmDecompositionAdapter()
//
// ВСЁ ОСТАЛЬНОЕ (Mapper, Repository, Service, UI) — не меняется.

import type { IDecompositionAdapter, DecompositionRaw } from '../../contracts/IDecompositionAdapter'

export class AmoCrmDecompositionAdapter implements IDecompositionAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchData(year: number, month: number): Promise<DecompositionRaw> {
    throw new Error(
      'AmoCrmDecompositionAdapter не реализован. ' +
      'Используйте MockDecompositionAdapter для разработки. ' +
      'Переключение: src/lib/data/repository/DecompositionRepository.ts'
    )

    // TODO Шаг 3: реализация
    //
    // const pad  = (n: number) => String(n).padStart(2, '0')
    // const from = `${year}-${pad(month+1)}-01`
    // const last = new Date(year, month+1, 0).getDate()
    // const to   = `${year}-${pad(month+1)}-${pad(last)}`
    //
    // const [amoDailyRaw, recordsRaw, warehouseRaw, financeRaw, planTargets] = await Promise.all([
    //   fetchAmoCrmDailyStats(from, to),
    //   fetchRecordsDailyStats(from, to),
    //   fetchWarehouseDailySales(from, to),
    //   fetchFinanceDailyStats(from, to),
    //   fetchActivePlanTargets(year, month),
    // ])
    //
    // return mergeIntoDailyRaw({ amoDailyRaw, recordsRaw, warehouseRaw, financeRaw, planTargets, year, month })
  }
}
