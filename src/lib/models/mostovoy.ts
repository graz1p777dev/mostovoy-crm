// Типы данных витрины «МОСТОВОЙ» — ровно то, что отдаёт её админ-API
// (server/routes/admin.js: toAdminJson, toPostJson) и аналитика магазина
// (server/services/buy-analytics.js). Поля не переименовываем, чтобы форму
// CRM можно было сверить с валидацией витрины один в один.

export const SHOP_CURRENCIES = ['USD', 'KGS', 'RUB'] as const
export type ShopCurrency = (typeof SHOP_CURRENCIES)[number]

/** [название, hex] — формат swatches у витрины. */
export type ShopSwatch = [string, string]

export interface ShopProduct {
  id: number
  slug: string
  name: string
  brand: string | null
  model: string | null
  category: string | null
  group: string | null
  variant: string | null
  color: string | null
  swatches: ShopSwatch[]
  price: number
  currency: string
  discountPercent: number | null
  discountLabel: string | null
  salePrice: number | null
  available: boolean
  /** active | needs_research | hidden | sync_error — hidden = мягко удалён. */
  status: string
  /** telegram | manual — откуда товар появился. */
  origin: string
  description: string | null
  storageOptions: string[]
  image: string | null
  images: string[]
  createdAt: string
  updatedAt: string
}

export interface ShopProductsData {
  products: ShopProduct[]
  groups: string[]
  categorySuggestions: string[]
}

export interface ShopPost {
  id: number
  slug: string
  title: string
  body: string
  image: string | null
  status: 'published' | 'draft'
  publishedAt: string
  updatedAt: string | null
}

/** Поля формы товара. Совпадают с тем, что принимает validateBody витрины. */
export interface ShopProductInput {
  name: string
  price: string
  currency: ShopCurrency
  brand: string
  category: string
  productGroup: string
  color: string
  variant: string
  description: string
  storageOptions: string
  image: string
  images: string
  swatches: ShopSwatch[]
  discountPercent: string
  available: boolean
}

export interface ShopPostInput {
  title: string
  body: string
  image: string
  status: 'published' | 'draft'
}

// ─── Аналитика магазина ──────────────────────────────────────────────────────

/** Периоды, которые понимает витрина (остальные она молча заменяет на 30). */
export const SHOP_ANALYTICS_PERIODS = [7, 30, 90, 365] as const

export interface ShopTopViewed {
  productSlug: string
  productName: string
  views: number
  visitors: number
}

export interface ShopTopClicked {
  productSlug: string
  productName: string
  clicks: number
  units: number
}

export interface ShopAnalytics {
  periodDays: number
  summary: { clicks: number; units: number; visitors: number; handoffs?: number }
  topProducts: ShopTopClicked[]
  trend: { day: string; clicks: number }[]
  sources: { source: string; clicks: number }[]
  recent: {
    id: string
    source: string
    pagePath: string | null
    visitorId: string | null
    clickedAt: string
    items: { productSlug: string; productName: string; quantity: number }[]
  }[]
  /** Появилось вместе с трекингом просмотров карточек. */
  views?: {
    periodDays: number
    summary: { views: number; visitors: number; products: number }
    topProducts: ShopTopViewed[]
    trend: { day: string; views: number }[]
  }
}

/** Запись из price_history витрины: oldPrice = null у только что появившегося товара. */
export interface ShopPriceChange {
  id: number
  productSlug: string | null
  productName: string
  oldPrice: number | null
  newPrice: number
  currency: string
  /** telegram | admin — кто поменял цену. */
  source: string
  changedAt: string
}

// ─── Настройки бота витрины ──────────────────────────────────────────────────
// GET / PUT /api/admin/crm/settings — server/services/crm.js: getSettings() и
// saveSettings(). Поля не переименовываем: форма должна читаться рядом с её
// валидацией один в один.

/** Модель из списка витрины (services/ai.js: MODELS). enabled = ключ провайдера настроен. */
export interface ShopBotModel {
  id: string
  label: string
  provider: string
  enabled: boolean
}

export interface ShopBotSettings {
  approvalEnabled: boolean
  /** bot_learning_mode: aggressive | manual. */
  aggressiveLearning: boolean
  model: string
  systemPrompt: string
  hypervisorPrompt: string
  characterPrompt: string
  rulesPrompt: string
  taskPrompt: string
  /** Только чтение — витрина сама решает, какие модели существуют. */
  models: ShopBotModel[]
}

/** Тело PUT: всё, кроме списка моделей. */
export type ShopBotSettingsInput = Omit<ShopBotSettings, 'models'>

/**
 * Лимиты витрины. Она делает .trim().slice(limit) молча — поэтому в форме
 * показываем остаток символов, а пустое поле означает «вернуть встроенный
 * промпт по умолчанию» (в saveSettings стоит `|| DEFAULT_*`).
 */
export const SHOP_BOT_PROMPT_LIMITS = {
  systemPrompt: 16000,
  hypervisorPrompt: 8000,
  characterPrompt: 8000,
  rulesPrompt: 8000,
  taskPrompt: 8000,
} as const

export type ShopBotPromptField = keyof typeof SHOP_BOT_PROMPT_LIMITS

// ─── Состояние бота и диалогов (для дашборда) ────────────────────────────────
// GET /crm/developer/status и GET /crm/developer/usage.

export interface ShopBotStatus {
  /** Хоть у одного провайдера настроен ключ. */
  enabled: boolean
  approvals: { total: number; pending: number; approved: number; rejected: number }
  errors24h: number
}

export interface ShopAiUsage {
  overview: {
    conversations: number
    messages: number
    aiReplies: number
    approved: number
    withoutEdits: number
    rejected: number
  }
  periods: Record<'today' | 'averageDay' | 'month' | 'year' | 'all', { tokens: number; costUsd: number }>
}
