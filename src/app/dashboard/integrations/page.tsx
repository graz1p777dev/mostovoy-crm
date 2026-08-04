import { getIntegrationsData } from '@/actions/integrations'
import { IntegrationsClient } from '@/components/integrations/IntegrationsClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const data = await getIntegrationsData()
  if (!data.allowed) {
    return <ShopApiError error="Раздел доступен только владельцу и руководителю отдела" />
  }

  return <IntegrationsClient data={data} />
}
