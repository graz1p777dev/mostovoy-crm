'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Eye, MousePointerClick, Users } from 'lucide-react'
import { GlassChartCard } from '@/components/charts/GlassChartCard'
import {
  CHART_COLORS, CHART_TEXT, CHART_GRID_STROKE, CHART_MARGIN, CHART_PALETTE, CHART_TICK,
  CHART_TOOLTIP_STYLE,
} from '@/components/charts/chart-theme'
import { Button } from '@/components/ui/button'
import { SHOP_ANALYTICS_PERIODS, type ShopAnalytics } from '@/lib/models/mostovoy'

const H = 220

const SOURCE_LABELS: Record<string, string> = {
  product: 'Карточка товара',
  cart: 'Корзина',
  credit: 'Рассрочка',
}

function shortName(name: string) {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name
}

function dayLabel(day: string) {
  const [, month, date] = day.split('-')
  return date && month ? `${date}.${month}` : day
}

interface Props {
  analytics: ShopAnalytics
  days: number
}

export function ShopAnalyticsClient({ analytics, days }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const views = analytics.views

  // Дни считаем объединением обеих серий: в один день могут быть просмотры
  // без клика и наоборот, а на графике нужна общая ось.
  const dailyData = useMemo(() => {
    const byDay = new Map<string, { day: string; Просмотры: number; 'Клики «Купить»': number }>()
    for (const point of views?.trend ?? []) {
      byDay.set(point.day, { day: point.day, 'Просмотры': point.views, 'Клики «Купить»': 0 })
    }
    for (const point of analytics.trend) {
      const existing = byDay.get(point.day)
      if (existing) existing['Клики «Купить»'] = point.clicks
      else byDay.set(point.day, { day: point.day, 'Просмотры': 0, 'Клики «Купить»': point.clicks })
    }
    return [...byDay.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((row) => ({ ...row, day: dayLabel(row.day) }))
  }, [analytics.trend, views])

  // Конверсия «посмотрел → нажал Купить» — только там, где есть оба числа.
  const conversion = useMemo(() => {
    if (!views) return []
    const clicksBySlug = new Map(analytics.topProducts.map((item) => [item.productSlug, item]))
    return views.topProducts
      .map((item) => {
        const clicked = clicksBySlug.get(item.productSlug)
        if (!clicked) return null
        return {
          slug: item.productSlug,
          name: item.productName,
          views: item.views,
          clicks: clicked.clicks,
          rate: item.views > 0 ? (clicked.clicks / item.views) * 100 : 0,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.rate - a.rate)
  }, [analytics.topProducts, views])

  const viewsBars = (views?.topProducts ?? []).map((item) => ({
    name: shortName(item.productName),
    Просмотры: item.views,
  }))
  const clickBars = analytics.topProducts.map((item) => ({
    name: shortName(item.productName),
    Клики: item.clicks,
  }))
  const totalSourceClicks = analytics.sources.reduce((sum, item) => sum + item.clicks, 0)
  const sourceSplit = analytics.sources.map((item) => ({
    name: SOURCE_LABELS[item.source] ?? item.source,
    'Клики': item.clicks,
    share: totalSourceClicks === 0 ? 0 : Math.round((item.clicks / totalSourceClicks) * 100),
  }))

  function setPeriod(next: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('days', String(next))
    router.push(`/dashboard/shop-analytics?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      {/* Период */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Период:</span>
        {SHOP_ANALYTICS_PERIODS.map((period) => (
          <Button
            key={period}
            variant={period === days ? 'default' : 'outline'}
            className="h-8 px-3 text-xs"
            onClick={() => setPeriod(period)}
          >
            {period === 365 ? 'год' : `${period} дн.`}
          </Button>
        ))}
      </div>

      {/* Сводка. Просмотры показываем только если трекинг витрины их отдаёт. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {views && (
          <>
            <SummaryTile
              icon={<Eye size={13} />}
              label="Просмотров карточек"
              value={views.summary.views}
              color={CHART_TEXT.secondary}
            />
            <SummaryTile
              icon={<Users size={13} />}
              label="Смотрели человек"
              value={views.summary.visitors}
              color={CHART_TEXT.primary}
            />
          </>
        )}
        <SummaryTile
          icon={<MousePointerClick size={13} />}
          label="Кликов «Купить»"
          value={analytics.summary.clicks}
          color={CHART_TEXT.positive}
        />
        <SummaryTile
          icon={<MousePointerClick size={13} />}
          label="Товаров в заявках"
          value={analytics.summary.units}
          color={CHART_TEXT.neutral}
        />
        <SummaryTile
          icon={<Users size={13} />}
          label="Нажимали «Купить»"
          value={analytics.summary.visitors}
          color={CHART_TEXT.negative}
        />
      </div>

      {!views && (
        <p className="rounded-2xl bg-white p-4 text-xs text-muted-foreground">
          Витрина ещё не отдаёт просмотры карточек — обновите магазин до версии с трекингом
          <code className="mx-1">/api/analytics/product-view</code>, и здесь появятся блоки по просмотрам.
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {/* Топ по просмотрам */}
        {viewsBars.length > 0 && (
          <GlassChartCard title="Топ товаров по ПРОСМОТРАМ карточек">
            <ResponsiveContainer width="100%" height={H}>
              <BarChart data={viewsBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis type="number" tick={CHART_TICK} allowDecimals={false} domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="name" tick={CHART_TICK} width={140} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="Просмотры" fill={CHART_COLORS.secondary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlassChartCard>
        )}

        {/* Топ по кликам «Купить» */}
        {clickBars.length > 0 && (
          <GlassChartCard title="Топ товаров по КЛИКАМ «Купить»">
            <ResponsiveContainer width="100%" height={H}>
              <BarChart data={clickBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis type="number" tick={CHART_TICK} allowDecimals={false} domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="name" tick={CHART_TICK} width={140} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="Клики" fill={CHART_COLORS.positive} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlassChartCard>
        )}

        {/* Динамика по дням */}
        {dailyData.length > 0 && (
          <GlassChartCard title="Просмотры и клики по дням">
            <ResponsiveContainer width="100%" height={H}>
              <LineChart data={dailyData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="day" tick={CHART_TICK} />
                <YAxis tick={CHART_TICK} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {views && (
                  <Line dataKey="Просмотры" stroke={CHART_COLORS.secondary} strokeWidth={2.5} dot={false} />
                )}
                <Line dataKey="Клики «Купить»" stroke={CHART_COLORS.positive} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </GlassChartCard>
        )}

        {/* Откуда нажимают «Купить». Столбцы, а не круговая: <Pie> в этом
            проекте на recharts 3.8.1 не рисует сектора (та же беда у
            FinanceCharts) — доли показываем цифрами рядом. */}
        {sourceSplit.length > 0 && (
          <GlassChartCard title="Откуда нажимают «Купить»">
            <ResponsiveContainer width="100%" height={H - 40}>
              <BarChart data={sourceSplit} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis type="number" tick={CHART_TICK} allowDecimals={false} domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="name" tick={CHART_TICK} width={120} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="Клики" radius={[0, 4, 4, 0]}>
                  {sourceSplit.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {sourceSplit.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {entry.name} — {entry.Клики} ({entry.share}%)
                  </span>
                </div>
              ))}
            </div>
          </GlassChartCard>
        )}
      </div>

      {/* Конверсия просмотр → клик */}
      {conversion.length > 0 && (
        <div className="rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold" style={{ color: '#1b1517' }}>
            Конверсия: посмотрели → нажали «Купить»
          </h2>
          <p className="mb-4 text-[11px] text-muted-foreground">
            Только товары, у которых за период есть и просмотры, и клики.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase" style={{ color: '#6b6063' }}>
                  <th className="py-2 pr-3 text-left font-medium">Товар</th>
                  <th className="px-3 py-2 text-right font-medium">Просмотры</th>
                  <th className="px-3 py-2 text-right font-medium">Клики «Купить»</th>
                  <th className="py-2 pl-3 text-right font-medium">Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {conversion.map((row) => (
                  <tr key={row.slug} style={{ borderTop: '1px solid #fdfbfb' }}>
                    <td className="py-2 pr-3" style={{ color: '#1b1517' }}>{row.name}</td>
                    <td className="px-3 py-2 text-right" style={{ color: CHART_TEXT.secondary }}>{row.views}</td>
                    <td className="px-3 py-2 text-right" style={{ color: CHART_TEXT.positive }}>{row.clicks}</td>
                    <td className="py-2 pl-3 text-right font-medium" style={{ color: '#1b1517' }}>
                      {row.rate.toFixed(row.rate >= 10 ? 0 : 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analytics.summary.clicks === 0 && (views?.summary.views ?? 0) === 0 && (
        <p className="rounded-2xl bg-white p-4 text-sm text-muted-foreground">
          За выбранный период витрина не зафиксировала ни просмотров карточек, ни кликов «Купить».
        </p>
      )}
    </div>
  )
}

function SummaryTile({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xl font-bold" style={{ color }}>
        {icon}
        {value.toLocaleString('ru-RU')}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: '#6b6063' }}>{label}</div>
    </div>
  )
}
