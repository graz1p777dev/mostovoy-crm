// ВНИМАНИЕ: этот компонент рендерится только после проверки can(actor,'salaries','view')
// в page.tsx, и данные для него там же не запрашиваются без права. Не рендерить его
// в обход этой проверки — здесь своей защиты нет по построению.

import { Wallet, History } from 'lucide-react'
import { Panel, StatTile, EmptyHint, BRAND, kpiColor, kpiBg, fmtMonth, fmtMoney } from './shared'

/** Строка ведомости (таблица salaries). */
export interface SalaryRecord {
  period_year: number
  period_month: number
  base_salary: number
  kpi_bonus: number
  bonuses: number
  deductions: number
  advance_amount: number
  total_amount: number
  kpi_pct: number
  work_days_fact: number | null
  work_days_plan: number | null
  status: string
  paid_at: string | null
}

const PAY_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  paid:       { label: 'Выплачено',  bg: 'var(--ok-soft-alt)', color: 'var(--series-positive-text)' },
  calculated: { label: 'Рассчитано', bg: 'var(--info-soft)', color: 'var(--info)' },
  draft:      { label: 'Черновик',   bg: 'var(--surface-2)', color: 'var(--ink-3)' },
}

export function SalaryTab({ records, baseSalary, kpiCoefficient }: {
  records: SalaryRecord[]        // по убыванию периода
  baseSalary: number
  kpiCoefficient: number
}) {
  const latest  = records[0] ?? null
  const history = records.slice(1)

  return (
    <div className="space-y-4">
      <Panel title="Условия оплаты" icon={<Wallet size={16} />}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Оклад"           value={fmtMoney(baseSalary)} />
          <StatTile label="Коэффициент KPI" value={`× ${kpiCoefficient}`} />
        </div>
      </Panel>

      {latest ? (
        <Panel title={`Ведомость — ${fmtMonth(latest.period_year, latest.period_month)}`} icon={<Wallet size={16} />}>
          <div className="space-y-2.5">
            <Row label="Оклад"        value={fmtMoney(latest.base_salary)} />
            <Row label="Бонус за KPI" value={fmtMoney(latest.kpi_bonus)} accent={latest.kpi_bonus > 0 ? 'var(--series-positive-text)' : undefined} />
            {latest.bonuses    > 0 && <Row label="Прочие надбавки" value={fmtMoney(latest.bonuses)}   accent="var(--series-positive-text)" />}
            {latest.advance_amount > 0 && <Row label="Аванс выдан" value={`− ${fmtMoney(latest.advance_amount)}`} />}
            {latest.deductions > 0 && <Row label="Удержания"       value={`− ${fmtMoney(latest.deductions)}`} accent="var(--brand-ink)" />}

            <div className="my-1" style={{ height: 1, backgroundColor: BRAND.divider }} />

            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: BRAND.muted }}>Выполнение KPI</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
                style={{ backgroundColor: kpiBg(Math.round(latest.kpi_pct)), color: kpiColor(Math.round(latest.kpi_pct)) }}>
                {Math.round(latest.kpi_pct)}%
              </span>
            </div>
            {latest.work_days_plan !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: BRAND.muted }}>Отработано дней</span>
                <span className="text-sm tabular-nums" style={{ color: BRAND.text }}>
                  {latest.work_days_fact ?? 0} / {latest.work_days_plan}
                </span>
              </div>
            )}

            <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: BRAND.text }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: BRAND.muted }}>Итого к выплате</span>
                <StatusBadge status={latest.status} />
              </div>
              <div className="text-2xl font-bold text-white tabular-nums">{fmtMoney(latest.total_amount)}</div>
              {latest.paid_at && (
                <div className="text-xs mt-1" style={{ color: BRAND.muted }}>
                  выплачено {new Date(latest.paid_at).toLocaleDateString('ru-RU')}
                </div>
              )}
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Ведомость" icon={<Wallet size={16} />}>
          <EmptyHint>Зарплата этому сотруднику ещё не начислялась</EmptyHint>
        </Panel>
      )}

      {history.length > 0 && (
        <Panel title="История выплат" icon={<History size={16} />}>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs" style={{ minWidth: 460 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BRAND.divider}` }}>
                  <th className="text-left  py-2 pr-2 font-semibold" style={{ color: BRAND.muted }}>Период</th>
                  <th className="text-right py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>KPI</th>
                  <th className="text-right py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>Итого</th>
                  <th className="text-right py-2 pl-2 font-semibold" style={{ color: BRAND.muted }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {history.map(r => (
                  <tr key={`${r.period_year}-${r.period_month}`} style={{ borderBottom: `1px solid ${BRAND.divider}` }}>
                    <td className="py-2 pr-2" style={{ color: BRAND.text }}>{fmtMonth(r.period_year, r.period_month)}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: BRAND.text }}>{Math.round(r.kpi_pct)}%</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium" style={{ color: BRAND.text }}>{fmtMoney(r.total_amount)}</td>
                    <td className="py-2 pl-2 text-right"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm" style={{ color: BRAND.muted }}>{label}</span>
      <span className="text-sm font-medium tabular-nums" style={{ color: accent ?? BRAND.text }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = PAY_STATUS[status] ?? { label: status, bg: BRAND.bg, color: BRAND.muted }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
  )
}
