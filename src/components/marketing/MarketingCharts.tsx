'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, AreaChart, Area,
  Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine,
} from 'recharts'
import type { MarketingDailyRow } from '@/lib/models/marketing'
import { MONTHLY_PLAN } from './marketing-plans'
import { GlassChartCard } from '@/components/charts/GlassChartCard'
import { ChartTypeToggle, type ChartKind } from '@/components/charts/ChartTypeToggle'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_GRID_STROKE, CHART_MARGIN, CHART_TICK } from '@/components/charts/chart-theme'

function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

const TICK = CHART_TICK
const MARGIN = CHART_MARGIN
const H = 180

interface Props {
  daily: MarketingDailyRow[]
}

export default function MarketingCharts({ daily }: Props) {
  const [spendKind, setSpendKind] = useState<ChartKind>('bar')
  const active = daily.filter(r => !r.isFuture)

  // ── Данные для каждого графика ────────────────────────────────────────────
  const spendRevenueData = active.map(r => ({
    day: String(r.day),
    Расход:  r.spend,
    Выручка: r.revenue,
  }))

  const appealsData = active.map(r => ({
    day: String(r.day),
    Обращения: r.appeals,
    Продажи:   r.sales,
  }))

  const cplData = active.map(r => ({
    day:  String(r.day),
    CPL:  r.cpl,
    план: active.length > 0 ? Math.round(MONTHLY_PLAN.cpl) : 0,
  }))

  const romiData = active.map(r => ({
    day:  String(r.day),
    ROMI: r.romi,
    план: MONTHLY_PLAN.romi,
  }))

  // Накопительный план выручки
  const workDays  = active.filter(r => !r.isWeekend).length || 1
  const dailyPlan = MONTHLY_PLAN.revenue / workDays
  const cumulativeData = active.reduce<{ day: string; Факт: number; План: number }[]>((acc, r) => {
    const prev    = acc[acc.length - 1]
    const cumFact = (prev?.Факт ?? 0) + r.revenue
    const cumPlan = (prev?.План ?? 0) + (r.isWeekend ? 0 : dailyPlan)
    return [...acc, { day: String(r.day), Факт: Math.round(cumFact), План: Math.round(cumPlan) }]
  }, [])

  return (
    <div className="space-y-3">

      {/* Строка 1: Расход vs Выручка | Обращения vs Продажи */}
      <div className="grid grid-cols-2 gap-3">

        {/* 1. Расход vs Выручка */}
        <GlassChartCard
          title="Расход vs Выручка"
          action={<ChartTypeToggle value={spendKind} onChange={setSpendKind} />}
        >
          <ResponsiveContainer width="100%" height={H}>
            {spendKind === 'bar' ? (
              <ComposedChart data={spendRevenueData} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={TICK} interval={4} />
                <YAxis yAxisId="l" tick={TICK} tickFormatter={fmtK} />
                <YAxis yAxisId="r" orientation="right" tick={TICK} tickFormatter={fmtK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar  yAxisId="l" dataKey="Расход"  fill={CHART_COLORS.primary} radius={[4,4,0,0]} />
                <Line yAxisId="r" dataKey="Выручка" stroke={CHART_COLORS.positive} strokeWidth={2} dot={false} />
              </ComposedChart>
            ) : spendKind === 'line' ? (
              <ComposedChart data={spendRevenueData} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={TICK} interval={4} />
                <YAxis tick={TICK} tickFormatter={fmtK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="Расход"  stroke={CHART_COLORS.primary} strokeWidth={2.5} dot={false} />
                <Line dataKey="Выручка" stroke={CHART_COLORS.positive} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            ) : (
              <AreaChart data={spendRevenueData} margin={MARGIN}>
                <defs>
                  <linearGradient id="gSpendA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRevA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.positive} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.positive} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={TICK} interval={4} />
                <YAxis tick={TICK} tickFormatter={fmtK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area dataKey="Расход" stroke={CHART_COLORS.primary} fill="url(#gSpendA)" strokeWidth={2} dot={false} />
                <Area dataKey="Выручка" stroke={CHART_COLORS.positive} fill="url(#gRevA)" strokeWidth={2} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </GlassChartCard>

        {/* 2. Обращения vs Продажи */}
        <GlassChartCard title="Обращения vs Продажи">
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart data={appealsData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis yAxisId="l" tick={TICK} />
              <YAxis yAxisId="r" orientation="right" tick={TICK} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar  yAxisId="l" dataKey="Обращения" fill={CHART_COLORS.secondary} radius={[4,4,0,0]} />
              <Line yAxisId="r" dataKey="Продажи"   stroke={CHART_COLORS.neutral} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </GlassChartCard>
      </div>

      {/* Строка 2: CPL | ROMI | Накопительный план */}
      <div className="grid grid-cols-3 gap-3">

        {/* 3. CPL по дням */}
        <GlassChartCard title="CPL по дням">
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart data={cplData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={fmtK} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={MONTHLY_PLAN.cpl} stroke={CHART_COLORS.negative} strokeDasharray="4 4" />
              <Bar  dataKey="CPL"  fill={CHART_COLORS.primary} radius={[4,4,0,0]} />
              <Line dataKey="план" stroke={CHART_COLORS.negative} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </GlassChartCard>

        {/* 4. ROMI */}
        <GlassChartCard title="ROMI %">
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart data={romiData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={v => v + '%'} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(v, n) => [Number(v).toLocaleString('ru') + '%', String(n)]}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={MONTHLY_PLAN.romi} stroke={CHART_COLORS.positive} strokeDasharray="4 4" />
              <Bar  dataKey="ROMI" fill={CHART_COLORS.secondary} radius={[4,4,0,0]} />
              <Line dataKey="план" stroke={CHART_COLORS.positive} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </GlassChartCard>

        {/* 5. Накопительный план */}
        <GlassChartCard title="Выполнение плана накопительно">
          <ResponsiveContainer width="100%" height={H}>
            <AreaChart data={cumulativeData} margin={MARGIN}>
              <defs>
                <linearGradient id="gradFact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="gradPlan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a19698" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#a19698" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={fmtK} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="План" stroke="#a19698" fill="url(#gradPlan)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              <Area dataKey="Факт" stroke={CHART_COLORS.primary} fill="url(#gradFact)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassChartCard>

      </div>
    </div>
  )
}
