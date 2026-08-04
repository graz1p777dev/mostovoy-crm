import { TrendingUp, History, CalendarCheck, Lock } from 'lucide-react'
import { Panel, ProgressRow, StatTile, EmptyHint, BRAND, kpiColor, kpiBg, fmtMonth, fmtMoney } from './shared'

/** Строка помесячной декомпозиции (sales_plan_weekly — витрина план/факт за месяц). */
export interface ResultsRow {
  period_year: number
  period_month: number
  total_fv_plan: number
  total_fv_fact: number
  total_sales_plan: number
  total_sales_fact: number
  total_revenue_plan: number
  total_revenue_fact: number
  kpi_pct: number
}

/** Вкладка объединяет ДВА независимых ресурса прав:
 *  - decomposition → sales_plan_weekly (план/факт, KPI, история);
 *  - consultations → число записей за месяц.
 *  Права на них проверяются раздельно в page.tsx, поэтому здесь возможен случай
 *  «есть одно, нет другого». consultationsThisMonth = null означает «нет права». */
export function ResultsTab({ rows, year, month, consultationsThisMonth, canDecomposition }: {
  rows: ResultsRow[]
  year: number
  month: number
  consultationsThisMonth: number | null
  canDecomposition: boolean
}) {
  const current = rows.find(r => r.period_year === year && r.period_month === month) ?? null
  const history = rows.filter(r => !(r.period_year === year && r.period_month === month))
  const kpiPct  = Math.round(current?.kpi_pct ?? 0)

  return (
    <div className="space-y-4">
      <Panel title={`Текущий период — ${fmtMonth(year, month)}`} icon={<TrendingUp size={16} />}>
        <div className="grid grid-cols-2 gap-2 mb-5 sm:grid-cols-4">
          {consultationsThisMonth !== null && (
            <StatTile label="Записей за месяц" value={String(consultationsThisMonth)} />
          )}
          {canDecomposition && current && (
            <>
              <StatTile label="Первичных встреч" value={String(current.total_fv_fact)} sub={current.total_fv_plan > 0 ? `план ${current.total_fv_plan}` : undefined} />
              <StatTile label="Продаж"           value={String(current.total_sales_fact)} sub={current.total_sales_plan > 0 ? `план ${current.total_sales_plan}` : undefined} />
              <StatTile label="Выручка"          value={fmtMoney(current.total_revenue_fact)} />
            </>
          )}
        </div>

        {canDecomposition ? (
          current ? (
            <>
              <div className="space-y-4">
                <ProgressRow label="Первичные встречи (ФВ)" fact={current.total_fv_fact}      plan={current.total_fv_plan} />
                <ProgressRow label="Продажи"                fact={current.total_sales_fact}   plan={current.total_sales_plan} />
                <ProgressRow label="Выручка"                fact={current.total_revenue_fact} plan={current.total_revenue_plan} isMoney />
              </div>

              <div className="mt-5 p-4 rounded-xl flex items-center justify-between" style={{ backgroundColor: kpiBg(kpiPct) }}>
                <span className="font-medium text-sm" style={{ color: kpiColor(kpiPct) }}>Выполнение KPI</span>
                <span className="text-2xl font-bold tabular-nums" style={{ color: kpiColor(kpiPct) }}>{kpiPct}%</span>
              </div>
            </>
          ) : (
            <EmptyHint>
              За {fmtMonth(year, month)} декомпозиция не рассчитана — плана и факта по KPI пока нет.
            </EmptyHint>
          )
        ) : (
          <NoAccessHint what="декомпозиции и KPI" />
        )}
      </Panel>

      {canDecomposition && (
        <Panel title="История по месяцам" icon={<History size={16} />}>
          {history.length === 0 ? (
            <EmptyHint>
              <span className="inline-flex items-center gap-2">
                <CalendarCheck size={15} /> Данных за прошлые месяцы ещё нет
              </span>
            </EmptyHint>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-xs" style={{ minWidth: 520 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BRAND.divider}` }}>
                    <th className="text-left  py-2 pr-2 font-semibold" style={{ color: BRAND.muted }}>Период</th>
                    <th className="text-right py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>ФВ</th>
                    <th className="text-right py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>Продажи</th>
                    <th className="text-right py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>Выручка</th>
                    <th className="text-right py-2 pl-2 font-semibold" style={{ color: BRAND.muted }}>KPI</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(r => {
                    const pct = Math.round(r.kpi_pct ?? 0)
                    return (
                      <tr key={`${r.period_year}-${r.period_month}`} style={{ borderBottom: `1px solid ${BRAND.divider}` }}>
                        <td className="py-2 pr-2" style={{ color: BRAND.text }}>{fmtMonth(r.period_year, r.period_month)}</td>
                        <td className="py-2 px-2 text-right tabular-nums" style={{ color: BRAND.text }}>
                          {r.total_fv_fact}{r.total_fv_plan > 0 && <span style={{ color: BRAND.muted }}> / {r.total_fv_plan}</span>}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums" style={{ color: BRAND.text }}>
                          {r.total_sales_fact}{r.total_sales_plan > 0 && <span style={{ color: BRAND.muted }}> / {r.total_sales_plan}</span>}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums" style={{ color: BRAND.text }}>{fmtMoney(r.total_revenue_fact)}</td>
                        <td className="py-2 pl-2 text-right">
                          <span className="px-2 py-0.5 rounded-full font-semibold tabular-nums"
                            style={{ backgroundColor: kpiBg(pct), color: kpiColor(pct) }}>{pct}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

function NoAccessHint({ what }: { what: string }) {
  return (
    <div
      className="rounded-xl px-4 py-8 text-center text-sm inline-flex items-center justify-center gap-2 w-full"
      style={{ backgroundColor: BRAND.bg, color: BRAND.muted }}
    >
      <Lock size={15} /> Нет доступа к данным {what}
    </div>
  )
}
