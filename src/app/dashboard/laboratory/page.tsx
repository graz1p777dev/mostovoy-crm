import { getShopBotSettings } from '@/actions/mostovoy-bot-settings'
import { ShopBotLabClient } from '@/components/shop/ShopBotLabClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Песочница работает на боте витрины «МОСТОВОЙ»: список моделей и промпты
// по умолчанию берём из её же настроек, чтобы тест повторял прод.
export const dynamic = 'force-dynamic'

export default async function LaboratoryPage() {
  const settings = await getShopBotSettings()
  if (!settings.ok) return <ShopApiError error={settings.error} />

  return <ShopBotLabClient settings={settings.data} />
}
