'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, AreaChart, Area,
  Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts'
import type { FinanceDailyRow, FinanceKpi } from '@/lib/models/finance'
import { fmtK } from './finance-plans'
import { GlassChartCard } from '@/components/charts/GlassChartCard'
import { ChartTypeToggle, type ChartKind } from '@/components/charts/ChartTypeToggle'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_GRID_STROKE, CHART_MARGIN, CHART_TICK } from '@/components/charts/chart-theme'

const TICK = CHART_TICK
const MARGIN = CHART_MARGIN
const H = 180

// Пять долей расходов должны различаться попарно, поэтому берём максимально
// разведённые роли, а не соседние оттенки.
const EXP_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.negative,
  CHART_COLORS.positive,
  CHART_COLORS.soft,
]

interface Props { daily: FinanceDailyRow[]; kpi: FinanceKpi }

export default function FinanceCharts({ daily, kpi }: Props) {
  const [revenueKind, setRevenueKind] = useState<ChartKind>('bar')
  const active = daily.filter(r => !r.isFuture && r.revenue > 0)

  // 1. Выручка vs Расходы
  const revenueExpData = active.map(r => ({
    day: String(r.day), Выручка: r.revenue, Расходы: r.expenses,
  }))

  // 2. Прибыль по дням
  const profitData = active.map(r => ({
    day: String(r.day), Прибыль: r.netProfit,
  }))

  // 3. Структура расходов (stacked bar — топ 10 дней для читаемости)
  const stackedData = active.map(r => ({
    day:       String(r.day),
    ФОТ:       r.expPayroll,
    Маркетинг: r.expMarketing,
    Аренда:    r.expRent,
    Расходники:r.expSupplies,
    Прочие:    r.expOther,
  }))

  // 4. Cash Flow накопительно
  const cashData = active.map(r => ({
    day: String(r.day),
    'Cash In':  r.cashIn,
    'Cash Out': r.cashOut,
    Баланс:     r.cashBalance,
  }))

  // 5. Маржа по дням
  const marginData = active.map(r => ({
    day: String(r.day), Маржа: r.margin,
  }))

  // Pie для структуры расходов (итого)
  const pieData = [
    { name: 'ФОТ',        value: kpi.expBreakdown.payroll,   fill: EXP_COLORS[0] },
    { name: 'Аренда',     value: kpi.expBreakdown.rent,      fill: EXP_COLORS[1] },
    { name: 'Расходники', value: kpi.expBreakdown.supplies,  fill: EXP_COLORS[2] },
    { name: 'Маркетинг',  value: kpi.expBreakdown.marketing, fill: EXP_COLORS[3] },
    { name: 'Прочие',     value: kpi.expBreakdown.other,     fill: EXP_COLORS[4] },
  ]

  return (
    <div className="space-y-3">

      {/* Строка 1: Выручка vs Расходы | Прибыль */}
      <div className="grid grid-cols-2 gap-3">
        <GlassChartCard
          title="Выручка vs Расходы"
          action={<ChartTypeToggle value={revenueKind} onChange={setRevenueKind} />}
        >
          <ResponsiveContainer width="100%" height={H}>
            {revenueKind === 'bar' ? (
              <ComposedChart data={revenueExpData} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={TICK} interval={4} />
                <YAxis yAxisId="l" tick={TICK} tickFormatter={fmtK} />
                <YAxis yAxisId="r" orientation="right" tick={TICK} tickFormatter={fmtK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar  yAxisId="l" dataKey="Выручка" fill={CHART_COLORS.primary} radius={[4,4,0,0]} />
                <Line yAxisId="r" dataKey="Расходы" stroke={CHART_COLORS.negative} strokeWidth={2} dot={false} />
              </ComposedChart>
            ) : revenueKind === 'line' ? (
              <ComposedChart data={revenueExpData} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={TICK} interval={4} />
                <YAxis tick={TICK} tickFormatter={fmtK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="Выручка" stroke={CHART_COLORS.primary} strokeWidth={2.5} dot={false} />
                <Line dataKey="Расходы" stroke={CHART_COLORS.negative} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            ) : (
              <AreaChart data={revenueExpData} margin={MARGIN}>
                <defs>
                  <linearGradient id="gRevenueA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExpA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.negative} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.negative} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={TICK} interval={4} />
                <YAxis tick={TICK} tickFormatter={fmtK} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area dataKey="Выручка" stroke={CHART_COLORS.primary} fill="url(#gRevenueA)" strokeWidth={2} dot={false} />
                <Area dataKey="Расходы" stroke={CHART_COLORS.negative} fill="url(#gExpA)" strokeWidth={2} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </GlassChartCard>

        <GlassChartCard title="Прибыль по дням">
          <ResponsiveContainer width="100%" height={H}>
            <BarChart data={profitData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={fmtK} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
              <Bar dataKey="Прибыль" radius={[4,4,0,0]}>
                {profitData.map((entry, i) => (
                  <Cell key={i} fill={entry.Прибыль >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassChartCard>
      </div>

      {/* Строка 2: Структура расходов stacked | Cash Flow | Маржа */}
      <div className="grid grid-cols-3 gap-3">

        <GlassChartCard title="Структура расходов">
          <ResponsiveContainer width="100%" height={H}>
            <BarChart data={stackedData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={fmtK} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              {['ФОТ','Аренда','Расходники','Маркетинг','Прочие'].map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={EXP_COLORS[i]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </GlassChartCard>

        <GlassChartCard title="Cash Flow накопительно">
          <ResponsiveContainer width="100%" height={H}>
            <AreaChart data={cashData} margin={MARGIN}>
              <defs>
                <linearGradient id="gBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={fmtK} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="Баланс" stroke={CHART_COLORS.primary} fill="url(#gBalance)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassChartCard>

        <GlassChartCard title="Маржинальность по дням">
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart data={marginData} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={TICK} interval={4} />
              <YAxis tick={TICK} tickFormatter={v => v + '%'} domain={[-20, 80]} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [Number(v).toFixed(1) + '%', String(n)]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <CartesianGrid y={38.8} stroke={CHART_COLORS.positive} strokeDasharray="4 4" />
              <Line dataKey="Маржа" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </GlassChartCard>

      </div>

      {/* Строка 3: Pie структура расходов итого */}
      <GlassChartCard title="Доля расходов за месяц">
        <div className="flex items-center gap-6">
          <ResponsiveContainer width={180} height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [fmtK(Number(v)) + ' KGS', String(n)]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2">
            {pieData.map(entry => {
              const total = pieData.reduce((s, e) => s + e.value, 0)
              const pct   = total === 0 ? 0 : Math.round((entry.value / total) * 100)
              return (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.fill }} />
                  <span className="text-[11px] font-medium text-foreground">{entry.name}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtK(entry.value)} KGS</span>
                  <span className="text-[10px] font-bold" style={{ color: CHART_COLORS.primary }}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </GlassChartCard>

    </div>
  )
}
