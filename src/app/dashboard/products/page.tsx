import { getShopProducts } from '@/actions/mostovoy-products'
import { mostovoyPublicUrl } from '@/lib/mostovoy-api'
import { ShopProductsClient } from '@/components/shop/ShopProductsClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Каталог живёт на витрине (Express + SQLite), а не в Supabase — данные
// запрашиваются на сервере, чтобы админ-токен витрины не попал в браузер.
export const dynamic = 'force-dynamic'

export default async function ShopProductsPage() {
  const result = await getShopProducts()
  if (!result.ok) return <ShopApiError error={result.error} />

  return <ShopProductsClient data={result.data} imageBase={mostovoyPublicUrl() ?? ''} />
}
