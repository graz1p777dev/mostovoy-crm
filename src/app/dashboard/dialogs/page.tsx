import { getShopInbox } from '@/actions/mostovoy-crm'
import { getDealLinksByExternalKeys } from '@/actions/deals'
import { ShopInboxClient } from '@/components/shop/ShopInboxClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Диалоги приходят из витрины «МОСТОВОЙ» — своей копии переписки в CRM нет,
// поэтому кешировать страницу нельзя.
export const dynamic = 'force-dynamic'

export default async function DialogsPage() {
  const inbox = await getShopInbox()
  if (!inbox.ok) return <ShopApiError error={inbox.error} />

  // Сделки заводятся из этих же диалогов (deals.external_key = externalKey),
  // поэтому связку отдаём сразу — карточка клиента не должна мигать.
  const dealLinks = await getDealLinksByExternalKeys(
    inbox.data.conversations.map((c) => c.externalKey)
  )

  return <ShopInboxClient initialData={inbox.data} initialDealLinks={dealLinks} />
}
