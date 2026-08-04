import { getShopPriceHistory } from '@/actions/mostovoy-products'
import { ShopPriceHistoryClient } from '@/components/shop/ShopPriceHistoryClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Журнал цен витрины (price_history) — тот же источник, что у карточки
// «что подорожало» на дашборде, только целиком.
export const dynamic = 'force-dynamic'

export default async function ShopUpdatesPage() {
  const result = await getShopPriceHistory(500)
  if (!result.ok) return <ShopApiError error={result.error} />

  return <ShopPriceHistoryClient changes={result.changes} />
}
