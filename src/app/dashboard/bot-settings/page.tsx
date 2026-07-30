import { getShopBotSettings } from '@/actions/mostovoy-bot-settings'
import { ShopBotSettingsClient } from '@/components/shop/ShopBotSettingsClient'
import { ShopApiError } from '@/components/shop/ShopApiError'

// Бот магазина — часть витрины (Express + SQLite), а не отдельный бэкенд:
// настройки читаются и пишутся через её админ-API на сервере, чтобы
// MOSTOVOY_ADMIN_TOKEN не попал в браузер.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Настройки бота — МОСТОВОЙ' }

export default async function BotSettingsPage() {
  const result = await getShopBotSettings()
  if (!result.ok) return <ShopApiError error={result.error} />

  return <ShopBotSettingsClient settings={result.data} />
}
