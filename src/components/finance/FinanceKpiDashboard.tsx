'use client'

import type { FinanceKpi } from '@/lib/models/finance'
import { FINANCE_PLAN, getStatus, STATUS_COLOR, fmtMoney, fmtPct, fmtNum, type MetricDir } from './finance-plans'
import { FinanceMetricIcon, type MetricIconKey } from './FinanceDesignerIcons'

interface Metric {
  label: string; icon: MetricIconKey; dir: MetricDir
  fact: number; plan: number
  fmt: (n: number) => string
  suffix?: string
}

function KpiCard({ m }: { m: Metric }) {
  const status = getStatus(m.fact, m.plan, m.dir)
  const c      = STATUS_COLOR[status]
  const pct    = m.plan === 0 ? 0 : Math.round((m.fact / m.plan) * 100)
  const delta  = m.fact - m.plan
  const good   = m.dir === 'lower' ? delta <= 0 : delta >= 0
  const prog   = Math.min(100, pct)

  return (
    <div className="rounded-2xl p-4 border flex flex-col gap-2.5"
      style={{ backgroundColor: '#fff', borderColor: c.border, borderWidth: 1.5 }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <FinanceMetricIcon icon={m.icon} />
          <p className="text-[11px] font-semibold" style={{ color: '#1b1517' }}>{m.label}</p>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: c.bg, color: c.text }}
        >
          {status === 'green' ? '✓ OK' : status === 'yellow' ? '~ Норма' : status === 'red' ? '✗ Риск' : '—'}
        </span>
      </div>

      <p className="text-xl font-bold leading-none" style={{ color: c.text }}>
        {m.fmt(m.fact)}{m.suffix ?? ''}
      </p>

      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#fdfbfb' }}>
        <div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: c.text }} />
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span style={{ color: '#7d7174' }}>
          план <span className="font-semibold" style={{ color: '#1b1517' }}>{m.fmt(m.plan)}{m.suffix ?? ''}</span>
        </span>
        <span className="font-bold" style={{ color: c.text }}>{pct}%</span>
        <span className="font-semibold" style={{ color: good ? '#15803d' : '#e11d1d' }}>
          {good ? '+' : ''}{m.fmt(Math.abs(delta))}{m.suffix ?? ''}
        </span>
      </div>
    </div>
  )
}

interface Props { kpi: FinanceKpi }

export default function FinanceKpiDashboard({ kpi }: Props) {
  const rows: { title: string; metrics: Metric[] }[] = [
    {
      title: 'Выручка и прибыль',
      metrics: [
        { label: 'Выручка',       icon: 'revenue',  dir: 'higher', fact: kpi.totalRevenue,  plan: FINANCE_PLAN.revenue,  fmt: fmtMoney },
        { label: 'Расходы',       icon: 'expenses', dir: 'lower',  fact: kpi.totalExpenses, plan: FINANCE_PLAN.expenses, fmt: fmtMoney },
        { label: 'Чистая прибыль',icon: 'profit',   dir: 'higher', fact: kpi.totalProfit,   plan: FINANCE_PLAN.profit,   fmt: fmtMoney },
        { label: 'Маржа',         icon: 'margin',   dir: 'higher', fact: kpi.avgMargin,     plan: FINANCE_PLAN.margin,   fmt: fmtPct, suffix: '' },
      ],
    },
    {
      title: 'Продажи',
      metrics: [
        { label: 'Сделки',     icon: 'deals',    dir: 'higher', fact: kpi.totalTransactions, plan: FINANCE_PLAN.transactions, fmt: fmtNum },
        { label: 'Средний чек',icon: 'avgCheck', dir: 'higher', fact: kpi.avgCheck,           plan: FINANCE_PLAN.avgCheck,     fmt: fmtMoney },
      ],
    },
    {
      title: 'Структура расходов',
      metrics: [
        { label: 'ФОТ',        icon: 'payroll',   dir: 'lower', fact: kpi.expBreakdown.payroll,   plan: FINANCE_PLAN.expPayroll,   fmt: fmtMoney },
        { label: 'Маркетинг',  icon: 'marketing', dir: 'lower', fact: kpi.expBreakdown.marketing, plan: FINANCE_PLAN.expMarketing, fmt: fmtMoney },
        { label: 'Аренда',     icon: 'rent',      dir: 'lower', fact: kpi.expBreakdown.rent,      plan: FINANCE_PLAN.expRent,      fmt: fmtMoney },
        { label: 'Расходники', icon: 'supplies',  dir: 'lower', fact: kpi.expBreakdown.supplies,  plan: FINANCE_PLAN.expSupplies,  fmt: fmtMoney },
        { label: 'Прочие',     icon: 'other',     dir: 'lower', fact: kpi.expBreakdown.other,     plan: FINANCE_PLAN.expOther,     fmt: fmtMoney },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {rows.map(grp => (
        <div key={grp.title}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#7d7174' }}>{grp.title}</p>
          <div className={`grid gap-3 grid-cols-2 md:grid-cols-${Math.min(grp.metrics.length, 5)}`}>
            {grp.metrics.map(m => <KpiCard key={m.label} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
