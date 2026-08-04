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
  /** Витрина отдаёт настройки целиком — по ним видно, копится ли очередь. */
  settings: ShopBotSettings
}

/** Строка разбивки расхода: одна задача пайплайна на одной модели. */
export interface ShopAiUsageTask {
  /** sales_agent | hypervisor_context | media_analysis | laboratory | aggressive_learning. */
  task: string
  model: string
  calls: number
  tokens: number
  costUsd: number
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
  customers: {
    total: number
    newToday: number
    activeToday: number
    active7d: number
    returning: number
    telegram: number
    whatsapp: number
    instagram: number
  }
  periods: Record<'today' | 'averageDay' | 'month' | 'year' | 'all', { tokens: number; costUsd: number }>
  tasks: ShopAiUsageTask[]
  /** Цены считаются только для DeepSeek; у остальных моделей копятся токены. */
  pricing: { inputUsdPerMillion: number; outputUsdPerMillion: number }
}

// ─── Ответы бота на подтверждение ────────────────────────────────────────────
// GET /crm/approvals?status=…, POST /crm/approvals/:id/approve|reject.
// Черновик появляется только когда в настройках включено «Подтверждать ответы
// перед отправкой» (crm.js: _autoReply → settings.approvalEnabled).

export const SHOP_APPROVAL_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const
export type ShopApprovalFilter = (typeof SHOP_APPROVAL_FILTERS)[number]

export type ShopApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ShopApproval {
  id: number
  conversationId: number
  customerName: string
  /** telegram | whatsapp | instagram | amocrm. */
  source: string
  /** Последнее входящее клиента, на которое бот сочинил ответ. */
  customerMessage: string
  aiReply: string
  /** Не null, только если менеджер правил текст перед отправкой. */
  editedReply: string | null
  rejectReason: string | null
  /** Пересказ диалога от гипервизора — контекст для менеджера. */
  summary: string | null
  model: string | null
  status: ShopApprovalStatus
  createdAt: string
  decidedAt: string | null
}

// ─── Журнал бота и лаборатория ───────────────────────────────────────────────
// GET /crm/developer/events, POST /crm/developer/lab.

export interface ShopBotEvent {
  id: number
  conversationId: number | null
  /** info | warn | error. */
  level: string
  /** inbox | generation | hypervisor | approval | delivery | learning | laboratory | settings. */
  stage: string
  event: string
  message: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

/** Ответ песочницы: сообщение никуда не уходит, диалог не создаётся. */
export interface ShopLabReply {
  reply: string
  model: string
  latencyMs: number
}

// ─── Единый inbox витрины ────────────────────────────────────────────────────
// GET /crm/conversations, GET|PATCH /crm/conversations/:id,
// POST /crm/conversations/:id/messages, GET /crm/status.
// Имена полей — ровно те, что отдаёт toConversation() в server/services/crm.js.

/** Диалог в списке. lastMessage витрина добирает подзапросом к crm_messages. */
export interface ShopInboxConversation {
  id: number
  /** Ключ идемпотентности; в CRM это deals.external_key. */
  externalKey: string
  /** telegram | whatsapp | instagram | amocrm. */
  source: string
  externalChatId: string
  externalLeadId: string | null
  /** Витрина уже подставила username или «Без имени» — пустым не бывает. */
  customerName: string
  customerUsername: string | null
  customerPhone: string | null
  aiEnabled: boolean
  unreadCount: number
  notes: string
  /** open | closed. */
  status: string
  lastMessageAt: string
  lastMessage: string
}

export interface ShopInboxMessage {
  id: number
  direction: 'incoming' | 'outgoing'
  /** customer | assistant | manager. */
  sender: string
  text: string
  status: string
  createdAt: string
}

/** Ответ GET /crm/conversations/:id — он же приходит на PATCH и на отправку. */
export interface ShopInboxDetail {
  conversation: ShopInboxConversation
  messages: ShopInboxMessage[]
}

/** GET /crm/status — состояние каналов для плашек над inbox. */
export interface ShopCrmStatus {
  telegram: boolean
  amocrm: boolean
  azisCrm: boolean
  ai: boolean
  amocrmWebhook: string
  primaryWebhook: string
}

/** Что PATCH /crm/conversations/:id реально умеет менять (crm.js: updateConversation). */
export interface ShopConversationPatch {
  aiEnabled?: boolean
  notes?: string
  status?: 'open' | 'closed'
}

export interface ShopBotApproval {
  id: number
  conversationId: number
  customerName: string
  source: string
  customerMessage: string
  aiReply: string
  editedReply: string | null
  rejectReason: string | null
  summary: string | null
  model: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
}
