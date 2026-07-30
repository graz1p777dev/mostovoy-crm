import { getShopPosts } from '@/actions/mostovoy-posts'
import { mostovoyPublicUrl } from '@/lib/mostovoy-api'
import { ShopPostsClient } from '@/components/shop/ShopPostsClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Новости витрины: тот же админ-API магазина, что и товары.
export const dynamic = 'force-dynamic'

export default async function ShopPostsPage() {
  const result = await getShopPosts()
  if (!result.ok) return <ShopApiError error={result.error} />

  return <ShopPostsClient posts={result.posts} imageBase={mostovoyPublicUrl() ?? ''} />
}
