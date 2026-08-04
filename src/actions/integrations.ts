'use server'

// ─── «Интеграции» — Товароучёт (живые данные) + Bitrix24 / amoCRM (конфиг) ──
// Доступ — только owner/rop (чувствительный конфиг, см. CLAUDE.md и
// 039_integrations.sql). Товароучёт — та же БД Supabase, что и эта CRM,
// поэтому статус читается напрямую из inventory_* через RLS-клиент, без
// хранения отдельного "подключения". Bitrix24/amoCRM — учётные данные
// шифруются AES-256-GCM (src/lib/integrations/crypto.ts) перед записью,
// расшифровка происходит только на сервере в момент теста соединения.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/authz'
import { encryptConfig, decryptConfig, generateWebhookSecret } from '@/lib/integrations/crypto'
import { assertSafeUrl } from '@/lib/integrations/safe-url'

export type ExternalProvider = 'bitrix24' | 'amocrm'

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

async function requireOwnerOrRop(): Promise<boolean> {
  const actor = await getActor()
  return actor?.role === 'owner' || actor?.role === 'rop'
}

// ─── Товароучёт (MostovoyInventory) — статус вычисляется live ──────────────

export interface InventorySummary {
  reachable: boolean
  productCount: number
  activeWarehouseCount: number
  lastMovementAt: string | null
  error: string | null
}

async function getInventorySummary(): Promise<InventorySummary> {
  const supabase = await createClient()

  const [productsRes, warehousesRes, movementRes] = await Promise.all([
    supabase.from('inventory_products').select('id', { count: 'exact', head: true }),
    supabase.from('inventory_warehouses').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('inventory_stock_movements')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const firstError = productsRes.error || warehousesRes.error || movementRes.error
  if (firstError) {
    return {
      reachable: false,
      productCount: 0,
      activeWarehouseCount: 0,
      lastMovementAt: null,
      error: firstError.message,
    }
  }

  return {
    reachable: true,
    productCount: productsRes.count ?? 0,
    activeWarehouseCount: warehousesRes.count ?? 0,
    lastMovementAt: (movementRes.data as { created_at: string } | null)?.created_at ?? null,
    error: null,
  }
}

// ─── Bitrix24 / amoCRM ──────────────────────────────────────────────────────

export interface ConnectionView {
  provider: ExternalProvider
  status: 'not_configured' | 'configured' | 'connected' | 'error'
  hasCredentials: boolean
  lastCheckedAt: string | null
  lastError: string | null
  webhookUrl: string
  // Только НЕ секретные поля конфигурации — для отображения в форме.
  maskedConfig: Record<string, string>
}

export interface IntegrationEventRow {
  id: string
  provider: string
  payload_summary: string
  received_at: string
}

export interface IntegrationsData {
  allowed: boolean
  inventory: InventorySummary
  connections: ConnectionView[]
  events: IntegrationEventRow[]
}

interface ConnectionRow {
  provider: string
  status: string
  config_encrypted: string | null
  webhook_secret: string | null
  last_checked_at: string | null
  last_error: string | null
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

function maskSecret(value: string | undefined): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function buildConnectionView(provider: ExternalProvider, row: ConnectionRow | undefined): ConnectionView {
  const webhookSecret = row?.webhook_secret ?? ''
  let maskedConfig: Record<string, string> = {}
  if (row?.config_encrypted) {
    try {
      const config = decryptConfig<Record<string, string>>(row.config_encrypted)
      if (provider === 'bitrix24') {
        maskedConfig = { webhookUrl: maskSecret(config.webhookUrl) }
      } else {
        maskedConfig = { subdomain: config.subdomain ?? '', accessToken: maskSecret(config.accessToken) }
      }
    } catch {
      maskedConfig = {}
    }
  }

  return {
    provider,
    status: (row?.status as ConnectionView['status']) ?? 'not_configured',
    hasCredentials: Boolean(row?.config_encrypted),
    lastCheckedAt: row?.last_checked_at ?? null,
    lastError: row?.last_error ?? null,
    webhookUrl: webhookSecret ? `${appBaseUrl()}/api/webhooks/${provider}/${webhookSecret}` : '',
    maskedConfig,
  }
}

export async function getIntegrationsData(): Promise<IntegrationsData> {
  const allowed = await requireOwnerOrRop()
  if (!allowed) {
    return { allowed: false, inventory: { reachable: false, productCount: 0, activeWarehouseCount: 0, lastMovementAt: null, error: null }, connections: [], events: [] }
  }

  const admin = createAdminClient()

  const [inventory, connectionsRes, eventsRes] = await Promise.all([
    getInventorySummary(),
    admin
      .from('integration_connections')
      .select('provider, status, config_encrypted, webhook_secret, last_checked_at, last_error')
      .in('provider', ['bitrix24', 'amocrm']),
    admin
      .from('integration_events')
      .select('id, provider, payload_summary, received_at')
      .order('received_at', { ascending: false })
      .limit(20),
  ])

  const byProvider = new Map((connectionsRes.data ?? []).map(r => [r.provider, r as ConnectionRow]))

  return {
    allowed: true,
    inventory,
    connections: [
      buildConnectionView('bitrix24', byProvider.get('bitrix24')),
      buildConnectionView('amocrm', byProvider.get('amocrm')),
    ],
    events: (eventsRes.data ?? []) as IntegrationEventRow[],
  }
}

// ─── Сохранение конфигурации ────────────────────────────────────────────────

export async function saveBitrix24Connection(webhookUrl: string): Promise<ActionResult> {
  if (!await requireOwnerOrRop()) return { success: false, error: 'Недостаточно прав' }

  let normalizedUrl: string
  try {
    normalizedUrl = assertSafeUrl(webhookUrl, 'Webhook Bitrix24').toString().replace(/\/+$/, '')
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Некорректный URL' }
  }

  let configEncrypted: string
  try {
    configEncrypted = encryptConfig({ webhookUrl: normalizedUrl })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ошибка шифрования' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('integration_connections')
    .select('webhook_secret')
    .eq('provider', 'bitrix24')
    .maybeSingle()

  const { error } = await admin.from('integration_connections').upsert(
    {
      provider: 'bitrix24',
      status: 'configured',
      config_encrypted: configEncrypted,
      webhook_secret: existing?.webhook_secret ?? generateWebhookSecret(),
      last_error: null,
    },
    { onConflict: 'provider' },
  )

  if (error) {
    console.error('[saveBitrix24Connection]', error.message)
    return { success: false, error: 'Ошибка сохранения подключения' }
  }

  revalidatePath('/dashboard/integrations')
  return { success: true }
}

export async function saveAmoCrmConnection(input: { subdomain: string; accessToken: string }): Promise<ActionResult> {
  if (!await requireOwnerOrRop()) return { success: false, error: 'Недостаточно прав' }

  const subdomain = input.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!subdomain) return { success: false, error: 'Укажите поддомен amoCRM' }
  const accessToken = input.accessToken.trim()
  if (!accessToken) return { success: false, error: 'Укажите долгосрочный токен доступа' }

  let configEncrypted: string
  try {
    configEncrypted = encryptConfig({ subdomain, accessToken })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ошибка шифрования' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('integration_connections')
    .select('webhook_secret')
    .eq('provider', 'amocrm')
    .maybeSingle()

  const { error } = await admin.from('integration_connections').upsert(
    {
      provider: 'amocrm',
      status: 'configured',
      config_encrypted: configEncrypted,
      webhook_secret: existing?.webhook_secret ?? generateWebhookSecret(),
      last_error: null,
    },
    { onConflict: 'provider' },
  )

  if (error) {
    console.error('[saveAmoCrmConnection]', error.message)
    return { success: false, error: 'Ошибка сохранения подключения' }
  }

  revalidatePath('/dashboard/integrations')
  return { success: true }
}

export async function deleteConnection(provider: ExternalProvider): Promise<ActionResult> {
  if (!await requireOwnerOrRop()) return { success: false, error: 'Недостаточно прав' }

  const admin = createAdminClient()
  const { error } = await admin.from('integration_connections').delete().eq('provider', provider)
  if (error) return { success: false, error: 'Ошибка удаления подключения' }

  revalidatePath('/dashboard/integrations')
  return { success: true }
}

// ─── Проверка соединения — реальный минимальный вызов внешнего API ─────────

export async function testConnection(provider: ExternalProvider): Promise<ActionResult> {
  if (!await requireOwnerOrRop()) return { success: false, error: 'Недостаточно прав' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('integration_connections')
    .select('config_encrypted')
    .eq('provider', provider)
    .maybeSingle()

  if (!row?.config_encrypted) {
    return { success: false, error: 'Сначала сохраните подключение' }
  }

  let url: string
  const headers: Record<string, string> = { accept: 'application/json' }

  try {
    if (provider === 'bitrix24') {
      const { webhookUrl } = decryptConfig<{ webhookUrl: string }>(row.config_encrypted)
      url = `${webhookUrl.replace(/\/+$/, '')}/profile.json`
    } else {
      const { subdomain, accessToken } = decryptConfig<{ subdomain: string; accessToken: string }>(row.config_encrypted)
      url = `https://${subdomain}.amocrm.ru/api/v4/account`
      headers.authorization = `Bearer ${accessToken}`
    }
  } catch {
    return { success: false, error: 'Не удалось расшифровать сохранённую конфигурацию' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let ok = false
  let errorText: string | null = null
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    ok = response.ok
    if (!ok) errorText = `HTTP ${response.status}`
  } catch (e) {
    errorText = e instanceof Error && e.name === 'AbortError' ? 'Превышено время ожидания' : (e instanceof Error ? e.message : 'Ошибка запроса')
  } finally {
    clearTimeout(timer)
  }

  await admin
    .from('integration_connections')
    .update({ status: ok ? 'connected' : 'error', last_checked_at: new Date().toISOString(), last_error: errorText })
    .eq('provider', provider)

  revalidatePath('/dashboard/integrations')

  if (!ok) return { success: false, error: errorText ?? 'Не удалось подключиться' }
  return { success: true }
}
