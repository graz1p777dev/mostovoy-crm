import { getShopAnalytics } from '@/actions/mostovoy-analytics'
import { ShopAnalyticsClient } from '@/components/shop/ShopAnalyticsClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Аналитика витрины: product_views («на что смотрят») и buy_clicks
// («что собираются купить») — две разные метрики, не смешиваем.
export const dynamic = 'force-dynamic'

export default async function ShopAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days } = await searchParams
  const period = Number(days) || 30

  const result = await getShopAnalytics(period)
  if (!result.ok) return <ShopApiError error={result.error} />

  return <ShopAnalyticsClient analytics={result.data} days={result.data.periodDays} />
}
