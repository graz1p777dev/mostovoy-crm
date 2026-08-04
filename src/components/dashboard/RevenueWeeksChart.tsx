'use client'
import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { WeekRevenuePoint } from '@/lib/dashboard-queries'
import { formatMoney, formatMoneyShort } from '@/lib/formatters'
import { ChartTypeToggle, type ChartKind } from '@/components/charts/ChartTypeToggle'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_GRID_STROKE, CHART_MARGIN } from '@/components/charts/chart-theme'
import { TrendingUp } from 'lucide-react'
import EmptyState from '@/components/common/EmptyState'

interface RevenueWeeksChartProps {
  data: WeekRevenuePoint[]
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2" style={CHART_TOOLTIP_STYLE}>
      <p style={{ color: 'var(--ink-3)', marginBottom: 2 }}>Неделя {label}</p>
      <p className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
        {formatMoney(payload[0].value)}
      </p>
    </div>
  )
}

const commonAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: 'var(--ink-3)' },
}

export default function RevenueWeeksChart({ data }: RevenueWeeksChartProps) {
  const [kind, setKind] = useState<ChartKind>('bar')
  const hasData = data.some(d => d.revenue > 0)

  return (
    <div>
      <div className="flex justify-end mb-2">
        <ChartTypeToggle value={kind} onChange={setKind} />
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center" style={{ height: 160 }}>
          <EmptyState
            className="w-full"
            icon={TrendingUp}
            title="Продаж в этом месяце ещё нет"
            hint="График по неделям построится с первой продажи."
          />
        </div>
      ) : (
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'bar' ? (
              <BarChart data={data} margin={CHART_MARGIN} barCategoryGap="30%">
                <defs>
                  <linearGradient id="revenueBarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="label" {...commonAxisProps} />
                <YAxis tickFormatter={formatMoneyShort} {...commonAxisProps} width={44} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(28,20,22,0.06)' }} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={40} fill="url(#revenueBarFill)" />
              </BarChart>
            ) : kind === 'line' ? (
              <LineChart data={data} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="label" {...commonAxisProps} />
                <YAxis tickFormatter={formatMoneyShort} {...commonAxisProps} width={44} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: CHART_COLORS.primary, strokeOpacity: 0.2 }} />
                <Line
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: CHART_COLORS.primary, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <AreaChart data={data} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="revenueAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="label" {...commonAxisProps} />
                <YAxis tickFormatter={formatMoneyShort} {...commonAxisProps} width={44} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: CHART_COLORS.primary, strokeOpacity: 0.2 }} />
                <Area
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  fill="url(#revenueAreaFill)"
                  dot={false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
