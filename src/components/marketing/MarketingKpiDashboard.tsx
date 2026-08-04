'use client'

import type { MarketingKpi } from '@/lib/models/marketing'
import { MetricIconBadge } from '@/components/common/MetricIconBadge'
import {
  METRICS, MONTHLY_PLAN, getStatus, fmtValue, STATUS_COLORS,
  type MetricMeta,
} from './marketing-plans'

const GROUP_LABELS: Record<string, string> = {
  ad:     'Реклама',
  funnel: 'Воронка',
  conv:   'Конверсии',
  fin:    'Финансы',
}

function getFactValue(metric: MetricMeta, kpi: MarketingKpi): number {
  switch (metric.key) {
    case 'spend':           return kpi.totalSpend
    case 'impressions':     return kpi.totalImpressions
    case 'reach':           return kpi.totalReach
    case 'clicks':          return kpi.totalClicks
    case 'ctr':             return kpi.avgCtr
    case 'cpc':             return kpi.avgCpc
    case 'cpm':             return kpi.totalImpressions > 0
                              ? Math.round((kpi.totalSpend / kpi.totalImpressions) * 1000)
                              : 0
    case 'cpl':             return kpi.avgCpl
    case 'appeals':         return kpi.totalAppeals
    case 'leads':           return kpi.totalLeads
    case 'qualifiedLeads':  return kpi.totalLeads
    case 'consultations':   return kpi.totalConsultations
    case 'sales':           return kpi.totalSales
    case 'convAppealLead':  return kpi.convAppealLead
    case 'convLeadConsult': return kpi.convLeadConsult
    case 'convConsultSale': return kpi.convConsultSale
    case 'revenue':         return kpi.totalRevenue
    case 'avgCheck':        return kpi.avgCheck
    case 'romi':            return kpi.romi
    case 'drr':             return kpi.drr
    default:                return 0
  }
}

interface KpiCardProps {
  metric: MetricMeta
  fact:   number
  plan:   number
}

function KpiCard({ metric, fact, plan }: KpiCardProps) {
  const status   = getStatus(fact, plan, metric.direction)
  const colors   = STATUS_COLORS[status]
  const pct      = plan === 0 ? 0 : Math.round((fact / plan) * 100)
  const delta    = fact - plan
  const isLower  = metric.direction === 'lower'
  const deltaGood = isLower ? delta <= 0 : delta >= 0

  const progressPct = Math.min(100, plan === 0 ? 0 : Math.round((fact / plan) * 100))

  return (
    <div
      className="rounded-2xl p-3.5 border flex flex-col gap-2"
      style={{ backgroundColor: 'var(--surface)', borderColor: colors.border, borderWidth: 1.5 }}
    >
      {/* Шапка */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-2">
          <MetricIconBadge name={`${metric.key} ${metric.label} ${metric.icon}`} />
          <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
            {metric.label}
          </p>
        </div>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {status === 'green' ? '✓ OK' : status === 'yellow' ? '~ Норма' : status === 'red' ? '✗ Риск' : '—'}
        </span>
      </div>

      {/* Факт — крупно */}
      <p className="text-lg font-bold leading-none" style={{ color: colors.text }}>
        {fmtValue(fact, metric.format)}
      </p>

      {/* Прогресс-бар */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--paper-2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progressPct}%`, backgroundColor: colors.text }}
        />
      </div>

      {/* Строка план / % / дельта */}
      <div className="flex items-center justify-between text-[10px]">
        <span style={{ color: 'var(--ink-3)' }}>
          план <span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmtValue(plan, metric.format)}</span>
        </span>
        <span className="font-bold" style={{ color: colors.text }}>{pct}%</span>
        <span className="font-semibold" style={{ color: deltaGood ? 'var(--ok)' : 'var(--brand)' }}>
          {deltaGood ? '+' : ''}{fmtValue(Math.abs(delta), metric.format)}
        </span>
      </div>
    </div>
  )
}

interface Props {
  kpi: MarketingKpi
}

export default function MarketingKpiDashboard({ kpi }: Props) {
  const groups = ['ad', 'funnel', 'conv', 'fin'] as const

  return (
    <div className="space-y-4">
      {groups.map(grp => {
        const metrics = METRICS.filter(m => m.group === grp)
        return (
          <div key={grp}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-3)' }}>
              {GROUP_LABELS[grp]}
            </p>
            <div className={`grid gap-3 ${grp === 'conv' ? 'grid-cols-3' : grp === 'fin' ? 'grid-cols-4' : 'grid-cols-4 md:grid-cols-7'}`}>
              {metrics.map(m => (
                <KpiCard
                  key={m.key}
                  metric={m}
                  fact={getFactValue(m, kpi)}
                  plan={MONTHLY_PLAN[m.key]}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
