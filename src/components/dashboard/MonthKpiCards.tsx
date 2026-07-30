import KpiCard from '@/components/common/KpiCard'
import type { DashboardMonthStats } from '@/types'
import { formatMoney, formatNumber } from '@/lib/formatters'
import { CalendarDays, ShoppingCart, TrendingUp, Target } from 'lucide-react'

interface MonthKpiCardsProps {
  stats: DashboardMonthStats
}

function safePct(fact: number, plan: number): number {
  if (!plan || plan === 0) return fact > 0 ? 100 : 0
  return Math.round((fact / plan) * 1000) / 10
}

export default function MonthKpiCards({ stats }: MonthKpiCardsProps) {
  const fvPct = safePct(stats.fv, stats.plan_fv)
  const salesPct = safePct(stats.sales, stats.plan_sales)
  const revenuePct = safePct(stats.revenue, stats.plan_revenue)

  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiCard
        label="Первичных встреч (ФВ)"
        value={formatNumber(stats.fv)}
        plan={formatNumber(stats.plan_fv)}
        pct={fvPct}
        icon={<CalendarDays style={{ width: 14, height: 14 }} />}
      />
      <KpiCard
        label="Продаж"
        value={formatNumber(stats.sales)}
        plan={formatNumber(stats.plan_sales)}
        pct={salesPct}
        icon={<ShoppingCart style={{ width: 14, height: 14 }} />}
      />
      <KpiCard
        label="Выручка"
        value={formatMoney(stats.revenue)}
        plan={formatMoney(stats.plan_revenue)}
        pct={revenuePct}
        icon={<TrendingUp style={{ width: 14, height: 14 }} />}
      />
      <KpiCard
        label="KPI%"
        value={`${stats.kpi_pct.toFixed(1)}%`}
        plan="100%"
        pct={stats.kpi_pct}
        icon={<Target style={{ width: 14, height: 14 }} />}
      />
    </div>
  )
}
