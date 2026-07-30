'use client'

// Графики блока «Маркетологу» на дашборде. Компонент намеренно «глупый»:
// все производные величины считает OpsSection на сервере, здесь только отрисовка.
// Круговых диаграмм нет — <Pie> на recharts 3.8.1 в этом проекте не рисует
// сектора, поэтому доли даём столбцами и цифрами в легенде (как в
// «Аналитике магазина»).

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { GlassChartCard } from '@/components/charts/GlassChartCard'
import {
  CHART_COLORS, CHART_GRID_STROKE, CHART_MARGIN, CHART_PALETTE, CHART_TICK,
  CHART_TOOLTIP_STYLE,
} from '@/components/charts/chart-theme'

const H = 190

export interface TrafficDailyPoint {
  day: string
  Просмотры: number
  'Клики «Купить»': number
}

interface Props {
  daily: TrafficDailyPoint[]
  topViews: { name: string; Просмотры: number }[]
  sources: { name: string; Клики: number; share: number }[]
}

export function ShopTrafficCharts({ daily, topViews, sources }: Props) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {daily.length > 0 && (
        <GlassChartCard title="Просмотры и клики по дням">
          <ResponsiveContainer width="100%" height={H}>
            <LineChart data={daily} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="day" tick={CHART_TICK} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="Просмотры" stroke={CHART_COLORS.secondary} strokeWidth={2.5} dot={false} />
              <Line dataKey="Клики «Купить»" stroke={CHART_COLORS.positive} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </GlassChartCard>
      )}

      {topViews.length > 0 && (
        <GlassChartCard title="Топ товаров по просмотрам">
          <ResponsiveContainer width="100%" height={H}>
            <BarChart data={topViews} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis type="number" tick={CHART_TICK} allowDecimals={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="name" tick={CHART_TICK} width={130} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="Просмотры" fill={CHART_COLORS.secondary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassChartCard>
      )}

      {sources.length > 0 && (
        <GlassChartCard title="Откуда нажимают «Купить»" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={sources} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis type="number" tick={CHART_TICK} allowDecimals={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="name" tick={CHART_TICK} width={130} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="Клики" radius={[0, 4, 4, 0]}>
                {sources.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {sources.map((entry, index) => (
              <span key={entry.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }}
                />
                {entry.name} — {entry.Клики} ({entry.share}%)
              </span>
            ))}
          </div>
        </GlassChartCard>
      )}
    </div>
  )
}
